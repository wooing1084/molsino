import { getPhase, legalActions, transition } from '../../core/engine';
import type { CoreAction, EngineEnvironment, SessionState } from '../../core/game-state';
import { scoreHand } from '../../core/scoring';
import type { GameViewState } from '../../shared/contracts';

export type BlackjackState = Omit<SessionState, 'balanceCents'>;
export function applyBlackjack(state: BlackjackState, balanceCents: number, action: CoreAction, environment: EngineEnvironment) {
  const next = transition({ ...state, balanceCents }, action, environment).nextState;
  const { balanceCents: balance, ...game } = next;
  return { game: structuredClone(game), balance, active: !['betting', 'result'].includes(getPhase(next)) };
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
