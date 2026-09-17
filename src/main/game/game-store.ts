import { BlackjackError } from '../../core/errors';
import { getPhase, legalActions, transition } from '../../core/engine';
import type { EngineEnvironment, SessionState } from '../../core/game-state';
import { scoreHand } from '../../core/scoring';
import type { CommandError, CommandResult, GameViewState, UserCommand } from '../../shared/contracts';
import { SESSION_SCHEMA_VERSION, type SavedSession, type SessionRepository } from '../persistence/session-repository';

const COMMAND_CACHE_LIMIT = 100;

export class GameStore {
  private revision = 0;
  private busy = false;
  private committedState: SessionState;
  private lastAppliedCommand: SavedSession['lastAppliedCommand'] = null;
  private pending: { snapshot: SavedSession; commandId: string | null } | undefined;
  private saveFailed = false;
  private readonly commandCache = new Map<string, CommandResult>();
  private readonly listeners = new Set<(state: GameViewState) => void>();
  private readonly idleWaiters = new Set<() => void>();
  private dealerTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    initialState: SessionState,
    private readonly environment: EngineEnvironment,
    private readonly platform: string,
    private readonly repository?: SessionRepository,
    restored?: SavedSession,
  ) {
    this.committedState = restored?.state ?? initialState;
    this.revision = restored?.revision ?? 0;
    this.lastAppliedCommand = restored?.lastAppliedCommand ?? null;
  }

  public getSnapshot(): GameViewState {
    return { ...toGameViewState(this.committedState, this.revision, this.platform),
      ...(this.saveFailed ? { saveError: true } : {}) };
  }

  public subscribe(listener: (state: GameViewState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public isBusy(): boolean { return this.busy; }
  public hasPendingSave(): boolean { return Boolean(this.pending); }

  public whenIdle(): Promise<void> {
    return this.busy ? new Promise(resolve => this.idleWaiters.add(resolve)) : Promise.resolve();
  }

  public async dispatch(command: UserCommand): Promise<CommandResult> {
    const cached = this.commandCache.get(command.commandId);
    if (cached) return cached;
    if (this.lastAppliedCommand?.commandId === command.commandId) {
      return this.cache(command.commandId, { ok: true, state: this.getSnapshot() });
    }
    if (this.busy) return this.failure('BUSY', 'Another game command is being committed');
    if (this.pending) {
      if (command.commandId !== this.pending.commandId && command.action.type !== 'retrySave') {
        return this.failure('SAVE_FAILED', '저장에 실패했습니다. 저장 재시도가 필요합니다.');
      }
      return this.retryPending();
    }
    if (command.action.type === 'retrySave') return this.failure('INVALID_ACTION', 'No failed save to retry');
    if (command.expectedRevision !== this.revision) {
      return this.cache(command.commandId, this.failure('STALE_STATE', 'Game state has changed'));
    }

    this.busy = true;
    try {
      const candidate = transition(this.committedState, command.action, this.environment).nextState;
      const revision = this.revision + 1;
      this.pending = {
        snapshot: {
          schemaVersion: SESSION_SCHEMA_VERSION, revision, state: candidate,
          lastAppliedCommand: { commandId: command.commandId, revision },
        },
        commandId: command.commandId,
      };
      return await this.commitPending();
    } catch (error) {
      if (this.pending) this.saveFailed = true;
      const result = this.failure(errorCode(error), error instanceof Error ? error.message : 'Game command failed');
      return this.pending ? this.failure('SAVE_FAILED', '저장에 실패했습니다. 저장 재시도가 필요합니다.')
        : this.cache(command.commandId, result);
    } finally {
      this.busy = false;
      this.releaseIdle();
    }
  }

  private async retryPending(): Promise<CommandResult> {
    this.busy = true;
    try { return await this.commitPending(); }
    catch {
      this.saveFailed = true;
      return this.failure('SAVE_FAILED', '저장에 실패했습니다. 저장 재시도가 필요합니다.');
    }
    finally { this.busy = false; this.releaseIdle(); }
  }

  private async commitPending(): Promise<CommandResult> {
    const pending = this.pending;
    if (!pending) throw new Error('Missing pending transition');
    await this.repository?.save(pending.snapshot);
    this.committedState = pending.snapshot.state;
    this.revision = pending.snapshot.revision;
    this.lastAppliedCommand = pending.snapshot.lastAppliedCommand;
    this.pending = undefined;
    this.saveFailed = false;
    const state = this.getSnapshot();
    const result: CommandResult = { ok: true, state };
    if (pending.commandId) this.cache(pending.commandId, result);
    this.publish(state);
    if (state.phase === 'dealerTurn') this.scheduleDealer();
    return result;
  }

  private async advanceDealer(): Promise<void> {
    if (this.busy) {
      void this.whenIdle().then(() => this.scheduleDealer());
      return;
    }
    if (this.pending || this.committedState.round?.phase !== 'dealerTurn') return;
    this.busy = true;
    try {
      const candidate = transition(this.committedState, { type: 'advanceDealer' }, this.environment).nextState;
      this.pending = {
        snapshot: {
          schemaVersion: SESSION_SCHEMA_VERSION, revision: this.revision + 1,
          state: candidate, lastAppliedCommand: this.lastAppliedCommand,
        },
        commandId: null,
      };
      await this.commitPending();
    } catch (error) {
      this.saveFailed = true;
      console.error('Dealer checkpoint failed; waiting for save retry', error);
      this.publish(this.getSnapshot());
    } finally {
      this.busy = false;
      this.releaseIdle();
    }
  }

  public resumeDealer(): void {
    this.scheduleDealer();
  }

  private scheduleDealer(): void {
    if (this.dealerTimer || this.pending || this.committedState.round?.phase !== 'dealerTurn') return;
    this.dealerTimer = setTimeout(() => {
      this.dealerTimer = undefined;
      void this.advanceDealer();
    }, 0);
  }

  private publish(state: GameViewState): void {
    for (const listener of this.listeners) {
      try { listener(state); }
      catch (error) { console.error('Game state listener failed', error); }
    }
  }

  private releaseIdle(): void {
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  private failure(error: CommandError, message: string): CommandResult {
    return { ok: false, error, message, state: this.getSnapshot() };
  }

  private cache(commandId: string, result: CommandResult): CommandResult {
    this.commandCache.set(commandId, result);
    if (this.commandCache.size > COMMAND_CACHE_LIMIT) {
      const oldest = this.commandCache.keys().next().value as string | undefined;
      if (oldest) this.commandCache.delete(oldest);
    }
    return result;
  }
}

function errorCode(error: unknown): CommandError {
  if (!(error instanceof BlackjackError)) return 'VALIDATION_ERROR';
  if (error.code === 'INVALID_ACTION' || error.code === 'INVALID_HAND') return 'INVALID_ACTION';
  return 'VALIDATION_ERROR';
}

export function toGameViewState(state: SessionState, revision: number, platform: string): GameViewState {
  const round = state.round;
  const dealerCards = round
    ? round.dealerHand.holeRevealed
      ? [...round.dealerHand.cards]
      : round.dealerHand.cards.slice(0, 1)
    : [];
  const dealerScore = dealerCards.length > 0 ? scoreHand(dealerCards) : undefined;

  return {
    revision,
    platform,
    phase: getPhase(state),
    balanceCents: state.balanceCents,
    pendingBetCents: state.pendingBetCents,
    betStepCents: state.betStepCents,
    playerHands: round?.playerHands.map((hand, index) => {
      const score = scoreHand(hand.cards);
      return {
        handId: hand.handId,
        cards: hand.cards.map((card) => ({ ...card })),
        total: score.total,
        isSoft: score.isSoft,
        wagerCents: hand.wagerCents,
        status: hand.status,
        active: round.activeHandIndex === index,
        fromSplit: hand.fromSplit,
        doubled: hand.doubled,
      };
    }) ?? [],
    activeHandIndex: round?.activeHandIndex ?? null,
    dealerHand: {
      cards: dealerCards.map((card) => ({ ...card })),
      hiddenCardCount: round && !round.dealerHand.holeRevealed ? round.dealerHand.cards.length - dealerCards.length : 0,
      ...(dealerScore ? { total: dealerScore.total, isSoft: dealerScore.isSoft } : {}),
    },
    ...(round?.insurance ? { insurance: { ...round.insurance } } : {}),
    legalActions: [...legalActions(state)],
    ...(state.lastResult ? {
      lastResult: {
        roundId: state.lastResult.roundId,
        netCents: state.lastResult.netCents,
        entries: state.lastResult.entries.map((entry) => ({ ...entry })),
      },
    } : {}),
  };
}
