import { createBigWheel, emptyBigWheelBets, totalBigWheelBet, transitionBigWheel, type BigWheelEnvironment } from '../../core/bigwheel/core';
import { toBigWheelView } from './bigwheel-adapter';
import { randomInt, randomUUID } from 'node:crypto';
import { bestTableLevel, getTableLevel, normalizeTableBet, validateTableBet } from '../../shared/table-levels';
import { createBaccarat, createShoe, transitionBaccarat, type BaccaratEnvironment } from '../../core/baccarat/core';
import { toBaccaratView } from './baccarat-adapter';
import { createSession } from '../../core/engine';
import type { EngineEnvironment } from '../../core/game-state';
import type { AppAction, AppCommand, AppResult, AppView } from '../../shared/app-contracts';
import { newAppSession, parseAppSession, type AppSession, type AppSessionRepository } from '../persistence/app-session-repository';
import { applyBlackjack, toGameViewState } from './blackjack-adapter';

export class AppStore {
  private busy = false;
  private pending?: AppSession;
  private failed = false;
  private internalError?: string;
  private sequence = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<(s: AppView) => void>();
  private waiters = new Set<() => void>();
  private cache = new Set<string>();
  public constructor(private state: AppSession, private blackjack: EngineEnvironment,
    private platform: string, private repository: Pick<AppSessionRepository, 'save'>,
    private autoDelay = 0, private baccarat: BaccaratEnvironment = { createShoe: () => createShoe(randomInt), nextId: randomUUID },
    private bigwheel: BigWheelEnvironment = { nextSegmentIndex: () => randomInt(54), nextId: randomUUID }) { parseAppSession(state); }
  public getSnapshot(): AppView {
    const s = this.state;
    const bj = s.screen === 'blackjack' && s.games.blackjack;
    const blackjack = bj ? toGameViewState({ ...bj, balanceCents: s.wallet.balanceCents }, s.revision, this.platform) : null;
    const limits = getTableLevel(s.table.selectedLevel);
    if (blackjack) blackjack.legalActions = blackjack.legalActions.filter(a => a !== 'resetSession'
      && (!(a === 'deal' || a === 'setBet' || a === 'setBetStep') || s.wallet.balanceCents >= limits.minBetCents));
    const baccarat = s.screen === 'baccarat' && s.games.baccarat ? toBaccaratView(s.games.baccarat, s.wallet.balanceCents) : null;
    if (baccarat && s.wallet.balanceCents < limits.minBetCents) baccarat.legalActions = baccarat.legalActions.filter(a => a !== 'deal' && a !== 'setBet');
    const bigwheel = s.screen === 'bigwheel' && s.games.bigwheel ? toBigWheelView(s.games.bigwheel, s.wallet.balanceCents) : null;
    if (bigwheel && (bigwheel.totalBetCents < limits.minBetCents || bigwheel.totalBetCents > limits.maxBetCents)) bigwheel.legalActions = bigwheel.legalActions.filter(a => a !== 'spin');
    return { revision: s.revision, platform: this.platform, balanceCents: s.wallet.balanceCents,
      table: { selectedLevel: s.table.selectedLevel, bestBankrollCents: s.table.bestBankrollCents, bestLevel: bestTableLevel(s.table.bestBankrollCents),
        minBetCents: limits.minBetCents, maxBetCents: limits.maxBetCents, entryBalanceCents: limits.entryBalanceCents },
      blackjack, baccarat, bigwheel,
      sessionId: s.sessionId, viewSequence: this.sequence, screen: s.screen,
      activeRoundGameId: s.activeRoundGameId, canNavigate: !s.activeRoundGameId && !this.busy && !this.pending && !this.internalError,
      saveError: this.failed, ...(this.internalError ? { internalError: this.internalError } : {}),
    };
  }
  public subscribe(listener: (s: AppView) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public isBusy(): boolean { return this.busy; }
  public hasPendingSave(): boolean { return Boolean(this.pending); }
  public whenIdle(): Promise<void> { return this.busy ? new Promise(resolve => this.waiters.add(resolve)) : Promise.resolve(); }
  private publish(): void { this.sequence++; for (const listener of this.listeners) { try { listener(this.getSnapshot()); } catch (error) { console.error('State listener failed', error); } } }
  private fail(error: Extract<AppResult, { ok: false }>['error'], message: string): AppResult { return { ok: false, error, message, state: this.getSnapshot() }; }
  public async dispatch(c: AppCommand): Promise<AppResult> {
    const key = `${c.sessionId}:${c.commandId}`;
    const last = this.state.lastAppliedCommand;
    if (last?.sessionId === c.sessionId && last.commandId === c.commandId) return { ok: true, state: this.getSnapshot() };
    if (c.sessionId !== this.state.sessionId) return this.fail('STALE_STATE', '이전 세션의 명령입니다.');
    if (this.cache.has(key)) return { ok: true, state: this.getSnapshot() };
    if (this.busy) return this.fail('BUSY', '저장 중입니다.');
    if (this.internalError) return this.fail('RECOVERY_REQUIRED', this.internalError);
    if (c.expectedRevision !== this.state.revision) return this.fail('STALE_STATE', '상태가 변경되었습니다.');
    if (this.pending) {
      if (c.action.type !== 'retrySave' && c.commandId !== this.pending.lastAppliedCommand?.commandId) return this.fail('SAVE_FAILED', '저장에 실패했습니다. 저장 재시도가 필요합니다.');
    } else {
      if (c.action.type === 'retrySave') return this.fail('INVALID_ACTION', '재시도할 저장이 없습니다.');
      try {
        const candidate = this.apply(c.action);
        candidate.revision = this.state.revision + 1;
        candidate.lastAppliedCommand = { sessionId: c.sessionId, commandId: c.commandId, revision: candidate.revision };
        this.pending = parseAppSession(candidate);
      } catch (error) { return this.fail('INVALID_ACTION', error instanceof Error ? error.message : '잘못된 명령입니다.'); }
    }
    return this.commit();
  }
  private apply(action: AppAction): AppSession {
    const s = structuredClone(this.state);
    const limits = getTableLevel(s.table.selectedLevel);
    if (action.type === 'selectLevel') {
      if (s.screen !== 'menu' || s.activeRoundGameId) throw new Error('판을 마친 뒤 메뉴에서 레벨을 선택하세요.');
      const target = getTableLevel(action.level);
      if (action.level !== s.table.selectedLevel && s.wallet.balanceCents < target.entryBalanceCents) throw new Error('입장에 필요한 잔액이 부족합니다.');
      s.table.selectedLevel = target.level;
      this.normalizeBets(s);
      return s;
    }
    if (action.type === 'resetAll' || action.type === 'selectGame' || action.type === 'goToMenu') {
      if (s.activeRoundGameId) throw new Error('한 판을 마친 뒤 이동할 수 있습니다.');
      if (action.type === 'resetAll') {
        if (s.screen !== 'menu') throw new Error('메뉴에서 새로 시작하세요.');
        return newAppSession(s.revision);
      }
      if (action.type === 'goToMenu') { s.screen = 'menu'; return s; }
      s.screen = action.gameId;
      if (action.gameId === 'blackjack') {
        if (!s.games.blackjack) {
          const { balanceCents: _, ...bj } = createSession(this.blackjack.createShoe());
          s.games.blackjack = structuredClone(bj) as AppSession['games']['blackjack'];
        }
        const b = s.games.blackjack!;
        if (!b.round) b.pendingBetCents = normalizeTableBet(b.pendingBetCents, s.wallet.balanceCents, limits);
      }
      if (action.gameId === 'baccarat') {
        s.games.baccarat ??= createBaccarat(this.baccarat.createShoe());
        if (s.games.baccarat.phase === 'betting') s.games.baccarat.pendingBet.amountCents = normalizeTableBet(s.games.baccarat.pendingBet.amountCents, s.wallet.balanceCents, limits);
      }
      if (action.gameId === 'bigwheel') {
        s.games.bigwheel ??= createBigWheel();
        this.normalizeBigWheelBets(s);
      }
      return s;
    }
    if (action.type === 'blackjack') {
      if (s.screen !== 'blackjack' || !s.games.blackjack) throw new Error('현재 게임의 명령이 아닙니다.');
      if (action.action.type === 'setBet') validateTableBet(action.action.amountCents, s.wallet.balanceCents, limits);
      if (action.action.type === 'setBetStep' && s.wallet.balanceCents < limits.minBetCents) throw new Error('하위 레벨을 선택하세요.');
      if (action.action.type === 'deal') {
        this.normalizeBets(s);
        validateTableBet(s.games.blackjack.pendingBetCents, s.wallet.balanceCents, limits);
      }
      const next = applyBlackjack(s.games.blackjack, s.wallet.balanceCents, action.action, this.blackjack);
      s.wallet.balanceCents = next.balance;
      s.games.blackjack = next.game as AppSession['games']['blackjack'];
      s.activeRoundGameId = next.active ? 'blackjack' : null;
    }
    if (action.type === 'baccarat') {
      if (s.screen !== 'baccarat' || !s.games.baccarat) throw new Error('현재 게임의 명령이 아닙니다.');
      if (action.action.type === 'setBet') validateTableBet(action.action.amountCents, s.wallet.balanceCents, limits);
      if (action.action.type === 'deal') {
        this.normalizeBets(s);
        validateTableBet(s.games.baccarat.pendingBet.amountCents, s.wallet.balanceCents, limits);
      }
      const next = transitionBaccarat(s.games.baccarat, s.wallet.balanceCents, action.action, this.baccarat, s.sessionId);
      s.games.baccarat = next.game; s.wallet.balanceCents = next.balance;
      s.activeRoundGameId = next.active ? 'baccarat' : null;
    }
    if (action.type === 'bigwheel') {
      if (s.screen !== 'bigwheel' || !s.games.bigwheel) throw new Error('현재 게임의 명령이 아닙니다.');
      if (action.action.type === 'setBet') {
        const total = totalBigWheelBet({ ...s.games.bigwheel.pendingBets, [action.action.target]: action.action.amountCents });
        if (total > limits.maxBetCents || total > s.wallet.balanceCents) throw new Error('총 베팅이 테이블 한도 또는 잔액을 초과합니다.');
      }
      if (action.action.type === 'spin') validateTableBet(totalBigWheelBet(s.games.bigwheel.pendingBets), s.wallet.balanceCents, limits);
      const next = transitionBigWheel(s.games.bigwheel, s.wallet.balanceCents, action.action, this.bigwheel, s.sessionId);
      s.games.bigwheel = next.game; s.wallet.balanceCents = next.balance;
      s.activeRoundGameId = next.active ? 'bigwheel' : null;
    }
    this.normalizeBets(s, action.type !== 'bigwheel' || action.action.type !== 'setBet');
    this.recordSettlement(s);
    return s;
  }
  private normalizeBigWheelBets(s: AppSession): void {
    const game = s.games.bigwheel;
    if (!game || game.phase !== 'betting') return;
    const limits = getTableLevel(s.table.selectedLevel);
    const total = totalBigWheelBet(game.pendingBets);
    if (total < limits.minBetCents || total > limits.maxBetCents || total > s.wallet.balanceCents)
      game.pendingBets = { ...emptyBigWheelBets(), silver: normalizeTableBet(limits.minBetCents, s.wallet.balanceCents, limits) };
  }
  private normalizeBets(s: AppSession, normalizeWheel = true): void {
    const limits = getTableLevel(s.table.selectedLevel);
    if (s.games.blackjack && !s.games.blackjack.round) s.games.blackjack.pendingBetCents = normalizeTableBet(s.games.blackjack.pendingBetCents, s.wallet.balanceCents, limits);
    if (s.games.baccarat?.phase === 'betting') s.games.baccarat.pendingBet.amountCents = normalizeTableBet(s.games.baccarat.pendingBet.amountCents, s.wallet.balanceCents, limits);
    if (normalizeWheel) this.normalizeBigWheelBets(s);
  }
  private recordSettlement(s: AppSession): void {
    const newlySettled = (['blackjack', 'baccarat', 'bigwheel'] as const).some(id => {
      const next = s.games[id]?.lastResult;
      return next && next.roundId !== this.state.games[id]?.lastResult?.roundId;
    });
    if (newlySettled) s.table.bestBankrollCents = Math.max(s.table.bestBankrollCents, s.wallet.balanceCents);
  }
  private async commit(): Promise<AppResult> {
    this.busy = true;
    this.publish();
    try {
      await this.repository.save(this.pending!);
      if (this.state.sessionId !== this.pending!.sessionId) this.cache.clear();
      this.state = this.pending!; this.pending = undefined; this.failed = false;
      const last = this.state.lastAppliedCommand;
      if (last) { this.cache.add(`${last.sessionId}:${last.commandId}`); if (this.cache.size > 100) this.cache.delete(this.cache.values().next().value!); }
    } catch { this.failed = true; }
    finally { this.busy = false; this.publish(); for (const done of this.waiters) done(); this.waiters.clear(); }
    if (this.failed) return this.fail('SAVE_FAILED', '저장에 실패했습니다. 저장 재시도가 필요합니다.');
    this.resumeAutomatic();
    return { ok: true, state: this.getSnapshot() };
  }
  public resumeAutomatic(): void {
    if (this.timer || this.pending || this.internalError || this.busy) return;
    if (!(this.state.activeRoundGameId === 'blackjack' && this.state.games.blackjack?.round?.phase === 'dealerTurn')
      && !(this.state.activeRoundGameId === 'baccarat' && this.state.games.baccarat?.phase === 'dealing')
      && !(this.state.activeRoundGameId === 'bigwheel' && this.state.games.bigwheel?.phase === 'spinning')) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.advance(); }, this.autoDelay);
  }
  private async advance(): Promise<void> {
    if (this.busy) { await this.whenIdle(); this.resumeAutomatic(); return; }
    if (this.pending || this.internalError) return;
    try {
      const s = structuredClone(this.state);
      if (s.activeRoundGameId === 'blackjack' && s.games.blackjack?.round?.phase === 'dealerTurn') {
        const next = applyBlackjack(s.games.blackjack, s.wallet.balanceCents, { type: 'advanceDealer' }, this.blackjack);
        s.wallet.balanceCents = next.balance;
        s.games.blackjack = next.game as AppSession['games']['blackjack'];
        s.activeRoundGameId = next.active ? 'blackjack' : null;
      } else if (s.activeRoundGameId === 'baccarat' && s.games.baccarat?.phase === 'dealing') {
        const next = transitionBaccarat(s.games.baccarat, s.wallet.balanceCents, { type: 'advanceBaccarat' }, this.baccarat, s.sessionId);
        s.games.baccarat = next.game; s.wallet.balanceCents = next.balance;
        s.activeRoundGameId = next.active ? 'baccarat' : null;
      } else if (s.activeRoundGameId === 'bigwheel' && s.games.bigwheel?.phase === 'spinning') {
        const next = transitionBigWheel(s.games.bigwheel, s.wallet.balanceCents, { type: 'advanceBigWheel' }, this.bigwheel, s.sessionId);
        s.games.bigwheel = next.game; s.wallet.balanceCents = next.balance;
        s.activeRoundGameId = next.active ? 'bigwheel' : null;
      } else return;
      this.recordSettlement(s);
      s.revision++;
      this.pending = parseAppSession(s);
      await this.commit();
    } catch { this.internalError = '게임 상태를 진행할 수 없습니다. 저장된 판을 보존했습니다. 앱을 다시 실행하세요.'; this.publish(); }
  }
}
