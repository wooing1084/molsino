import type { Card } from './models';
import { scoreHand } from './scoring';
import {
  BET_STEPS_CENTS,
  MAX_BET_CENTS,
  MAX_HANDS,
  type LegalAction,
  type PlayerHand,
  type RoundState,
  type SessionState,
} from './game-state';

export function cardGameValue(card: Card): number {
  if (card.rank === 'A') return 11;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank);
}

export function isNaturalBlackjack(hand: PlayerHand): boolean {
  return !hand.fromSplit && hand.cards.length === 2 && scoreHand(hand.cards).total === 21;
}

export function isDealerBlackjack(round: RoundState): boolean {
  return round.dealerHand.cards.length === 2 && scoreHand(round.dealerHand.cards).total === 21;
}

export function dealerShouldHit(cards: readonly Card[]): boolean {
  return scoreHand(cards).total < 17;
}

export function maximumInsuranceCents(round: RoundState, balanceCents: number): number {
  const available = Math.min(Math.floor(round.originalWagerCents / 2), balanceCents);
  return Math.floor(available / 50) * 50;
}

export function canDoubleDown(state: SessionState, hand: PlayerHand): boolean {
  return hand.status === 'playing'
    && hand.cards.length === 2
    && !hand.splitAces
    && state.balanceCents >= hand.wagerCents;
}

export function canSplit(state: SessionState, round: RoundState, hand: PlayerHand): boolean {
  const first = hand.cards[0];
  const second = hand.cards[1];
  return hand.status === 'playing'
    && hand.cards.length === 2
    && first !== undefined
    && second !== undefined
    && cardGameValue(first) === cardGameValue(second)
    && round.playerHands.length < MAX_HANDS
    && state.balanceCents >= hand.wagerCents
    && !(first.rank === 'A' && hand.fromSplit);
}

export function canSurrender(round: RoundState, hand: PlayerHand): boolean {
  return round.playerHands.length === 1
    && !hand.fromSplit
    && !hand.doubled
    && hand.status === 'playing'
    && hand.cards.length === 2;
}

export function legalActions(state: SessionState): readonly LegalAction[] {
  const round = state.round;
  if (!round) {
    const actions: LegalAction[] = ['resetSession'];
    if (state.balanceCents < 100) return actions;
    actions.push('setBet', 'setBetStep');
    const validBet = Number.isSafeInteger(state.pendingBetCents)
      && state.pendingBetCents >= 100
      && state.pendingBetCents <= MAX_BET_CENTS
      && state.pendingBetCents <= state.balanceCents;
    if (validBet) actions.push('deal');
    return actions;
  }

  if (round.phase === 'insuranceDecision') {
    const hand = round.playerHands[0];
    if (hand && isNaturalBlackjack(hand)) return ['acceptEvenMoney', 'keepBlackjack', 'resetSession'];
    return ['chooseInsurance', 'resetSession'];
  }

  if (round.phase === 'playerTurn' && round.activeHandIndex !== null) {
    const hand = round.playerHands[round.activeHandIndex];
    if (!hand) return ['resetSession'];
    const actions: LegalAction[] = ['hit', 'stand', 'resetSession'];
    if (canDoubleDown(state, hand)) actions.push('doubleDown');
    if (canSplit(state, round, hand)) actions.push('split');
    if (canSurrender(round, hand)) actions.push('surrender');
    return actions;
  }

  if (round.phase === 'result') return state.balanceCents >= 100
    ? ['nextRound', 'resetSession'] : ['resetSession'];
  return ['resetSession'];
}

export function isBetStep(value: number): value is (typeof BET_STEPS_CENTS)[number] {
  return (BET_STEPS_CENTS as readonly number[]).includes(value);
}
