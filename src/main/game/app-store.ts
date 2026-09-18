import { randomInt, randomUUID } from 'node:crypto';
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
    private autoDelay = 0, private baccarat: BaccaratEnvironment = { createShoe: () => createShoe(randomInt), nextId: randomUUID }) { parseAppSession(state); }
  public getSnapshot(): AppView {
    const s = this.state;
    const bj = s.screen === 'blackjack' && s.games.blackjack;
    const blackjack = bj ? toGameViewState({ ...bj, balanceCents: s.wallet.balanceCents }, s.revision, this.platform) : null;
    if (blackjack) blackjack.legalActions = blackjack.legalActions.filter(a => a !== 'resetSession');
    return { revision: s.revision, platform: this.platform, balanceCents: s.wallet.balanceCents,
      blackjack, baccarat: s.screen === 'baccarat' && s.games.baccarat ? toBaccaratView(s.games.baccarat, s.wallet.balanceCents) : null,
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
        if (!b.round) b.pendingBetCents = Math.max(100, Math.min(b.pendingBetCents, s.wallet.balanceCents));
      }
      if (action.gameId === 'baccarat') {
        s.games.baccarat ??= createBaccarat(this.baccarat.createShoe());
        if (s.games.baccarat.phase === 'betting') s.games.baccarat.pendingBet.amountCents = Math.max(100, Math.min(s.games.baccarat.pendingBet.amountCents, s.wallet.balanceCents));
      }
      return s;
    }
    if (action.type === 'blackjack') {
      if (s.screen !== 'blackjack' || !s.games.blackjack) throw new Error('현재 게임의 명령이 아닙니다.');
      const next = applyBlackjack(s.games.blackjack, s.wallet.balanceCents, action.action, this.blackjack);
      s.wallet.balanceCents = next.balance;
      s.games.blackjack = next.game as AppSession['games']['blackjack'];
      s.activeRoundGameId = next.active ? 'blackjack' : null;
    }
    if (action.type === 'baccarat') {
      if (s.screen !== 'baccarat' || !s.games.baccarat) throw new Error('현재 게임의 명령이 아닙니다.');
      const next = transitionBaccarat(s.games.baccarat, s.wallet.balanceCents, action.action, this.baccarat, s.sessionId);
      s.games.baccarat = next.game; s.wallet.balanceCents = next.balance;
      s.activeRoundGameId = next.active ? 'baccarat' : null;
    }
    return s;
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
      && !(this.state.activeRoundGameId === 'baccarat' && this.state.games.baccarat?.phase === 'dealing')) return;
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
      } else return;
      s.revision++;
      this.pending = parseAppSession(s);
      await this.commit();
    } catch { this.internalError = '게임 상태를 진행할 수 없습니다. 저장된 판을 보존했습니다. 앱을 다시 실행하세요.'; this.publish(); }
  }
}
