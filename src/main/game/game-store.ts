import { BlackjackError } from '../../core/errors';
import { getPhase, legalActions, transition } from '../../core/engine';
import type { CoreAction, EngineEnvironment, SessionState } from '../../core/game-state';
import { scoreHand } from '../../core/scoring';
import type { CommandError, CommandResult, GameViewState, UserCommand } from '../../shared/contracts';

const COMMAND_CACHE_LIMIT = 100;

export class GameStore {
  private revision = 0;
  private busy = false;
  private committedState: SessionState;
  private readonly commandCache = new Map<string, CommandResult>();
  private readonly listeners = new Set<(state: GameViewState) => void>();

  public constructor(
    initialState: SessionState,
    private readonly environment: EngineEnvironment,
    private readonly platform: string,
  ) {
    this.committedState = initialState;
  }

  public getSnapshot(): GameViewState {
    return toGameViewState(this.committedState, this.revision, this.platform);
  }

  public subscribe(listener: (state: GameViewState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public dispatch(command: UserCommand): CommandResult {
    const cached = this.commandCache.get(command.commandId);
    if (cached) return cached;
    if (this.busy) return this.failure('BUSY', 'Another game command is being committed');
    if (command.expectedRevision !== this.revision) {
      return this.cache(command.commandId, this.failure('STALE_STATE', 'Game state has changed'));
    }

    this.busy = true;
    try {
      let candidate = this.committedState;
      let candidateRevision = this.revision;
      const apply = (action: CoreAction): void => {
        candidate = transition(candidate, action, this.environment).nextState;
        candidateRevision += 1;
      };

      apply(command.action);
      while (candidate.round?.phase === 'dealerTurn') apply({ type: 'advanceDealer' });

      this.committedState = candidate;
      this.revision = candidateRevision;
      const state = this.getSnapshot();
      const result: CommandResult = { ok: true, state };
      this.cache(command.commandId, result);
      for (const listener of this.listeners) {
        try { listener(state); }
        catch (error) { console.error('Game state listener failed', error); }
      }
      return result;
    } catch (error) {
      const result = this.failure(errorCode(error), error instanceof Error ? error.message : 'Game command failed');
      return this.cache(command.commandId, result);
    } finally {
      this.busy = false;
    }
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
