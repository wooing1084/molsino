import { validateBet } from './betting';
import { BlackjackError, assertSafeCents, safeAdd } from './errors';
import {
  DEFAULT_BET_CENTS,
  HAND_STATUSES,
  INSURANCE_DECISIONS,
  ROUND_PHASES,
  RULE_SET_ID,
  STARTING_BALANCE_CENTS,
  type CoreAction,
  type EngineEnvironment,
  type EngineEvent,
  type PlayerHand,
  type RoundState,
  type SessionState,
  type TransitionResult,
} from './game-state';
import { RANKS, SUITS, type Card } from './models';
import {
  canDoubleDown,
  canSplit,
  canSurrender,
  dealerShouldHit,
  isBetStep,
  isDealerBlackjack,
  isNaturalBlackjack,
  maximumInsuranceCents,
} from './rules';
import { scoreHand } from './scoring';
import {
  applyLedgerEntry,
  blackjackReturn,
  calculateRoundNet,
  createLedgerEntry,
  insuranceWinReturn,
  normalWinReturn,
  surrenderReturn,
  SETTLEMENT_OUTCOMES,
  type SettlementOutcome,
} from './settlement';
import { SHOE_SIZE, drawCard, needsReshuffleAtRoundStart, type Shoe } from './shoe';

export interface CreateSessionOptions {
  readonly balanceCents?: number;
  readonly pendingBetCents?: number;
  readonly betStepCents?: number;
}

export function createSession(shoe: Shoe, options: CreateSessionOptions = {}): SessionState {
  validateFreshShoe(shoe);
  const state: SessionState = {
    ruleSetId: RULE_SET_ID,
    balanceCents: options.balanceCents ?? STARTING_BALANCE_CENTS,
    pendingBetCents: options.pendingBetCents ?? DEFAULT_BET_CENTS,
    betStepCents: options.betStepCents ?? 100,
    shoe,
    round: null,
    ledger: [],
    lastResult: null,
  };
  validateState(state);
  return state;
}

export function getPhase(state: SessionState): 'betting' | RoundState['phase'] {
  return state.round?.phase ?? 'betting';
}

export { legalActions } from './rules';

export function transition(
  state: SessionState,
  action: CoreAction,
  environment: EngineEnvironment,
): TransitionResult {
  validateState(state);
  let result: TransitionResult;
  switch (action.type) {
    case 'setBet':
      result = setBet(state, action.amountCents);
      break;
    case 'setBetStep':
      result = setBetStep(state, action.stepCents);
      break;
    case 'deal':
      result = deal(state, environment);
      break;
    case 'chooseInsurance':
      result = chooseInsurance(state, action.amountCents);
      break;
    case 'acceptEvenMoney':
      result = acceptEvenMoney(state);
      break;
    case 'keepBlackjack':
      result = keepBlackjack(state);
      break;
    case 'hit':
      result = hit(state, action.handId);
      break;
    case 'stand':
      result = stand(state, action.handId);
      break;
    case 'doubleDown':
      result = doubleDown(state, action.handId);
      break;
    case 'split':
      result = split(state, action.handId, environment);
      break;
    case 'surrender':
      result = surrender(state, action.handId);
      break;
    case 'advanceDealer':
      result = advanceDealer(state);
      break;
    case 'nextRound':
      result = nextRound(state);
      break;
    case 'resetSession':
      {
        const freshShoe = environment.createShoe();
        validateFreshShoe(freshShoe);
        result = { nextState: createSession(freshShoe), events: [{ type: 'sessionReset' }] };
      }
      break;
  }
  validateState(result.nextState);
  return result;
}

function setBet(state: SessionState, amountCents: number): TransitionResult {
  assertBetting(state, 'Bet can only be changed between rounds');
  validateBet(amountCents, state.balanceCents);
  return { nextState: { ...state, pendingBetCents: amountCents }, events: [] };
}

function setBetStep(state: SessionState, stepCents: number): TransitionResult {
  assertBetting(state, 'Bet step can only be changed between rounds');
  if (state.balanceCents < 100) throw new BlackjackError('INVALID_ACTION', 'Game over: balance is below $1');
  if (!isBetStep(stepCents)) throw new BlackjackError('INVALID_AMOUNT', 'Unsupported bet step');
  return { nextState: { ...state, betStepCents: stepCents }, events: [] };
}

function deal(state: SessionState, environment: EngineEnvironment): TransitionResult {
  assertBetting(state, 'A round is already in progress');
  const wagerCents = validateBet(state.pendingBetCents, state.balanceCents);
  const reshuffleRequired = needsReshuffleAtRoundStart(state.shoe);
  const shoe = reshuffleRequired ? environment.createShoe() : state.shoe;
  if (reshuffleRequired) validateFreshShoe(shoe);
  else validateShoe(shoe);

  let currentShoe = shoe;
  const firstPlayer = drawRequired(currentShoe);
  currentShoe = firstPlayer.shoe;
  const dealerUp = drawRequired(currentShoe);
  currentShoe = dealerUp.shoe;
  const secondPlayer = drawRequired(currentShoe);
  currentShoe = secondPlayer.shoe;
  const dealerHole = drawRequired(currentShoe);
  currentShoe = dealerHole.shoe;

  const roundId = requireId(environment.nextId('round'), 'round');
  if (state.ledger.some((entry) => entry.roundId === roundId) || state.lastResult?.roundId === roundId) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Round IDs must not be reused');
  }
  const handId = requireId(environment.nextId('hand'), 'hand');
  if (handId === 'insurance') throw new BlackjackError('INTEGRITY_ERROR', 'Hand ID collides with a reserved ledger key');
  const playerHand: PlayerHand = {
    handId,
    cards: [firstPlayer.card, secondPlayer.card],
    wagerCents,
    status: 'playing',
    fromSplit: false,
    splitAces: false,
    doubled: false,
  };
  let round: RoundState = {
    roundId,
    originalWagerCents: wagerCents,
    phase: 'playerTurn',
    playerHands: [playerHand],
    dealerHand: { cards: [dealerUp.card, dealerHole.card], holeRevealed: false },
    activeHandIndex: 0,
    insurance: null,
  };
  let nextState: SessionState = {
    ...state,
    balanceCents: state.balanceCents - wagerCents,
    shoe: currentShoe,
    round,
    lastResult: null,
  };
  const events: EngineEvent[] = [{ type: 'roundStarted', roundId }];

  if (dealerUp.card.rank === 'A') {
    round = {
      ...round,
      phase: 'insuranceDecision',
      activeHandIndex: null,
      insurance: {
        decision: 'pending',
        wagerCents: 0,
        maxWagerCents: maximumInsuranceCents(round, nextState.balanceCents),
      },
    };
    return { nextState: { ...nextState, round }, events };
  }

  nextState = resolvePeekAndNaturals(nextState, events);
  return { nextState, events: appendSettlementEvent(events, nextState) };
}

function chooseInsurance(state: SessionState, amountCents: number): TransitionResult {
  const round = requireRoundPhase(state, 'insuranceDecision');
  const hand = round.playerHands[0];
  if (!hand || isNaturalBlackjack(hand)) {
    throw new BlackjackError('INVALID_ACTION', 'Insurance is not offered for a natural blackjack');
  }
  const insurance = round.insurance;
  if (!insurance || insurance.decision !== 'pending') {
    throw new BlackjackError('INVALID_ACTION', 'Insurance decision is not pending');
  }
  assertSafeCents(amountCents, 'Insurance wager');
  if (amountCents !== 0 && (amountCents < 50 || amountCents % 50 !== 0)) {
    throw new BlackjackError('INVALID_AMOUNT', 'Insurance must be in $0.50 increments');
  }
  if (amountCents > insurance.maxWagerCents || amountCents > state.balanceCents) {
    throw new BlackjackError('INSUFFICIENT_BALANCE', 'Insurance wager exceeds the available amount');
  }

  const decidedRound: RoundState = {
    ...round,
    insurance: {
      ...insurance,
      decision: amountCents === 0 ? 'declined' : 'purchased',
      wagerCents: amountCents,
    },
  };
  const chargedState: SessionState = {
    ...state,
    balanceCents: state.balanceCents - amountCents,
    round: decidedRound,
  };
  const events: EngineEvent[] = [];
  const resolved = resolvePeekAndNaturals(settleInsurance(chargedState, events), events);
  return { nextState: resolved, events: appendSettlementEvent(events, resolved) };
}

function acceptEvenMoney(state: SessionState): TransitionResult {
  const round = requireRoundPhase(state, 'insuranceDecision');
  const hand = round.playerHands[0];
  if (!hand || !isNaturalBlackjack(hand)) {
    throw new BlackjackError('INVALID_ACTION', 'Even money requires a natural blackjack');
  }
  const settled = settleSpecificHand(
    {
      ...state,
      round: {
        ...round,
        insurance: round.insurance ? { ...round.insurance, decision: 'evenMoney' } : null,
        dealerHand: { ...round.dealerHand, holeRevealed: true },
      },
    },
    hand,
    'even-money',
    normalWinReturn(hand.wagerCents),
  );
  return finishResult(settled, []);
}

function keepBlackjack(state: SessionState): TransitionResult {
  const round = requireRoundPhase(state, 'insuranceDecision');
  const hand = round.playerHands[0];
  if (!hand || !isNaturalBlackjack(hand)) {
    throw new BlackjackError('INVALID_ACTION', 'Keeping blackjack requires a natural blackjack');
  }
  const returnedCents = isDealerBlackjack(round) ? hand.wagerCents : blackjackReturn(hand.wagerCents);
  const outcome: SettlementOutcome = isDealerBlackjack(round) ? 'push' : 'blackjack';
  const settled = settleSpecificHand(
    {
      ...state,
      round: {
        ...round,
        insurance: round.insurance ? { ...round.insurance, decision: 'keptBlackjack' } : null,
        dealerHand: { ...round.dealerHand, holeRevealed: true },
      },
    },
    hand,
    outcome,
    returnedCents,
  );
  return finishResult(settled, []);
}

function hit(state: SessionState, handId: string): TransitionResult {
  const { round, hand, index } = requireActiveHand(state, handId);
  const drawn = drawRequired(state.shoe);
  const cards = [...hand.cards, drawn.card];
  const score = scoreHand(cards);
  const nextHand: PlayerHand = {
    ...hand,
    cards,
    status: score.isBust ? 'busted' : score.total === 21 ? 'standing' : 'playing',
  };
  const nextRound = replaceHand(round, index, nextHand);
  const nextState = { ...state, shoe: drawn.shoe, round: nextRound };
  const events: EngineEvent[] = [{ type: 'cardDrawn', target: 'player', handId }];
  return nextHand.status === 'playing'
    ? { nextState, events }
    : advanceAfterHand(nextState, index, events);
}

function stand(state: SessionState, handId: string): TransitionResult {
  const { round, hand, index } = requireActiveHand(state, handId);
  const nextState = {
    ...state,
    round: replaceHand(round, index, { ...hand, status: 'standing' }),
  };
  return advanceAfterHand(nextState, index, []);
}

function doubleDown(state: SessionState, handId: string): TransitionResult {
  const { round, hand, index } = requireActiveHand(state, handId);
  if (!canDoubleDown(state, hand)) {
    throw new BlackjackError('INVALID_ACTION', 'Double down is not legal for this hand');
  }
  const doubledWager = safeAdd(hand.wagerCents, hand.wagerCents, 'Doubled wager');
  const drawn = drawRequired(state.shoe);
  const cards = [...hand.cards, drawn.card];
  const nextHand: PlayerHand = {
    ...hand,
    cards,
    wagerCents: doubledWager,
    doubled: true,
    status: scoreHand(cards).isBust ? 'busted' : 'standing',
  };
  const nextState = {
    ...state,
    balanceCents: state.balanceCents - hand.wagerCents,
    shoe: drawn.shoe,
    round: replaceHand(round, index, nextHand),
  };
  return advanceAfterHand(nextState, index, [{ type: 'cardDrawn', target: 'player', handId }]);
}

function split(
  state: SessionState,
  handId: string,
  environment: EngineEnvironment,
): TransitionResult {
  const { round, hand, index } = requireActiveHand(state, handId);
  if (!canSplit(state, round, hand)) {
    throw new BlackjackError('INVALID_ACTION', 'Split is not legal for this hand');
  }
  const first = hand.cards[0];
  const second = hand.cards[1];
  if (!first || !second) throw new BlackjackError('INTEGRITY_ERROR', 'A split hand must have two cards');
  const splittingAces = first.rank === 'A';
  const rightHandId = requireId(environment.nextId('hand'), 'hand');
  if (rightHandId === 'insurance' || round.playerHands.some((existing) => existing.handId === rightHandId)) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Hand IDs must be unique within a round');
  }

  const left: PlayerHand = {
    ...hand,
    cards: [first],
    fromSplit: true,
    splitAces: splittingAces,
    doubled: false,
    status: 'playing',
  };
  const right: PlayerHand = {
    handId: rightHandId,
    cards: [second],
    wagerCents: hand.wagerCents,
    status: 'playing',
    fromSplit: true,
    splitAces: splittingAces,
    doubled: false,
  };
  const hands = [...round.playerHands];
  hands.splice(index, 1, left, right);
  let nextState: SessionState = {
    ...state,
    balanceCents: state.balanceCents - hand.wagerCents,
    round: { ...round, playerHands: hands, activeHandIndex: index },
  };
  const events: EngineEvent[] = [];
  nextState = dealPendingHandCard(nextState, index, events);

  if (splittingAces) {
    const afterLeft = markHandStanding(nextState, index);
    const rightIndex = index + 1;
    const afterRightDraw = dealPendingHandCard(afterLeft, rightIndex, events);
    return advanceAfterHand(markHandStanding(afterRightDraw, rightIndex), rightIndex, events);
  }

  const active = nextState.round?.playerHands[index];
  if (active && scoreHand(active.cards).total === 21) {
    return advanceAfterHand(markHandStanding(nextState, index), index, events);
  }
  return { nextState, events };
}

function surrender(state: SessionState, handId: string): TransitionResult {
  const { round, hand, index } = requireActiveHand(state, handId);
  if (!canSurrender(round, hand)) {
    throw new BlackjackError('INVALID_ACTION', 'Surrender is not legal for this hand');
  }
  const nextState = {
    ...state,
    round: replaceHand(round, index, { ...hand, status: 'surrendered' }),
  };
  return advanceAfterHand(nextState, index, []);
}

function advanceDealer(state: SessionState): TransitionResult {
  const round = requireRoundPhase(state, 'dealerTurn');
  if (!dealerShouldHit(round.dealerHand.cards)) return settleRound(state, []);
  const drawn = drawRequired(state.shoe);
  const dealerHand = { ...round.dealerHand, cards: [...round.dealerHand.cards, drawn.card], holeRevealed: true };
  const nextState = { ...state, shoe: drawn.shoe, round: { ...round, dealerHand } };
  const events: EngineEvent[] = [{ type: 'cardDrawn', target: 'dealer' }];
  return dealerShouldHit(dealerHand.cards) ? { nextState, events } : settleRound(nextState, events);
}

function nextRound(state: SessionState): TransitionResult {
  requireRoundPhase(state, 'result');
  if (state.balanceCents < 100) throw new BlackjackError('INVALID_ACTION', 'Game over: balance is below $1');
  const pendingBetCents = Math.max(100, Math.min(state.pendingBetCents, state.balanceCents));
  return { nextState: { ...state, pendingBetCents, round: null }, events: [] };
}

function resolvePeekAndNaturals(state: SessionState, events: EngineEvent[]): SessionState {
  const round = state.round;
  if (!round) throw new BlackjackError('INTEGRITY_ERROR', 'A round is required');
  const playerHand = round.playerHands[0];
  if (!playerHand) throw new BlackjackError('INTEGRITY_ERROR', 'An initial player hand is required');
  if (isDealerBlackjack(round) || isNaturalBlackjack(playerHand)) {
    return settleRound(state, events).nextState;
  }
  return {
    ...state,
    round: { ...round, phase: 'playerTurn', activeHandIndex: 0 },
  };
}

function settleInsurance(state: SessionState, events: EngineEvent[]): SessionState {
  const round = state.round;
  const insurance = round?.insurance;
  if (!round || !insurance || insurance.decision === 'pending' || insurance.wagerCents === 0) return state;
  const dealerBlackjack = isDealerBlackjack(round);
  const returnedCents = dealerBlackjack ? insuranceWinReturn(insurance.wagerCents) : 0;
  const entry = createLedgerEntry(
    round.roundId,
    'insurance',
    dealerBlackjack ? 'insurance-win' : 'insurance-loss',
    insurance.wagerCents,
    returnedCents,
  );
  const applied = applyLedgerEntry(state.balanceCents, state.ledger, entry);
  if (applied.applied) events.push({ type: 'insuranceSettled', returnedCents });
  return { ...state, balanceCents: applied.balanceCents, ledger: applied.ledger };
}

function advanceAfterHand(
  state: SessionState,
  completedIndex: number,
  events: EngineEvent[],
): TransitionResult {
  const round = state.round;
  if (!round) throw new BlackjackError('INTEGRITY_ERROR', 'A round is required');
  for (let index = completedIndex + 1; index < round.playerHands.length; index += 1) {
    const candidate = state.round?.playerHands[index];
    if (!candidate || candidate.status !== 'playing') continue;
    let nextState: SessionState = { ...state, round: { ...state.round, activeHandIndex: index } as RoundState };
    if (candidate.cards.length === 1) nextState = dealPendingHandCard(nextState, index, events);
    const ready = nextState.round?.playerHands[index];
    if (!ready) throw new BlackjackError('INTEGRITY_ERROR', 'Active hand disappeared');
    if (ready.splitAces || scoreHand(ready.cards).total === 21) {
      state = markHandStanding(nextState, index);
      continue;
    }
    return { nextState, events };
  }

  const liveHandExists = state.round?.playerHands.some((hand) => hand.status === 'standing') ?? false;
  if (!liveHandExists) return settleRound(state, events);
  const dealerRound: RoundState = {
    ...(state.round as RoundState),
    phase: 'dealerTurn',
    activeHandIndex: null,
    dealerHand: { ...(state.round as RoundState).dealerHand, holeRevealed: true },
  };
  const dealerState = { ...state, round: dealerRound };
  return dealerShouldHit(dealerRound.dealerHand.cards)
    ? { nextState: dealerState, events }
    : settleRound(dealerState, events);
}

function settleRound(state: SessionState, events: EngineEvent[]): TransitionResult {
  const round = state.round;
  if (!round) throw new BlackjackError('INTEGRITY_ERROR', 'A round is required');
  let settledState: SessionState = {
    ...state,
    round: { ...round, dealerHand: { ...round.dealerHand, holeRevealed: true } },
  };
  const dealerScore = scoreHand(round.dealerHand.cards);
  const dealerBlackjack = isDealerBlackjack(round);
  for (const hand of round.playerHands) {
    if (settledState.ledger.some((entry) => entry.roundId === round.roundId && entry.componentId === hand.handId)) {
      continue;
    }
    let outcome: SettlementOutcome;
    let returnedCents: number;
    const playerScore = scoreHand(hand.cards);
    if (hand.status === 'surrendered') {
      outcome = 'surrender';
      returnedCents = surrenderReturn(hand.wagerCents);
    } else if (hand.status === 'busted' || playerScore.isBust) {
      outcome = 'bust';
      returnedCents = 0;
    } else if (dealerBlackjack) {
      outcome = isNaturalBlackjack(hand) ? 'push' : 'loss';
      returnedCents = outcome === 'push' ? hand.wagerCents : 0;
    } else if (isNaturalBlackjack(hand)) {
      outcome = 'blackjack';
      returnedCents = blackjackReturn(hand.wagerCents);
    } else if (dealerScore.isBust || playerScore.total > dealerScore.total) {
      outcome = 'win';
      returnedCents = normalWinReturn(hand.wagerCents);
    } else if (playerScore.total === dealerScore.total) {
      outcome = 'push';
      returnedCents = hand.wagerCents;
    } else {
      outcome = 'loss';
      returnedCents = 0;
    }
    settledState = settleSpecificHand(settledState, hand, outcome, returnedCents);
  }
  return finishResult(settledState, events);
}

function settleSpecificHand(
  state: SessionState,
  hand: PlayerHand,
  outcome: SettlementOutcome,
  returnedCents: number,
): SessionState {
  const round = state.round;
  if (!round) throw new BlackjackError('INTEGRITY_ERROR', 'A round is required');
  const entry = createLedgerEntry(round.roundId, hand.handId, outcome, hand.wagerCents, returnedCents);
  const applied = applyLedgerEntry(state.balanceCents, state.ledger, entry);
  return { ...state, balanceCents: applied.balanceCents, ledger: applied.ledger };
}

function finishResult(state: SessionState, events: EngineEvent[]): TransitionResult {
  const round = state.round;
  if (!round) throw new BlackjackError('INTEGRITY_ERROR', 'A round is required');
  const entries = state.ledger.filter((entry) => entry.roundId === round.roundId);
  const result = { roundId: round.roundId, netCents: calculateRoundNet(state.ledger, round.roundId), entries };
  const nextState: SessionState = {
    ...state,
    round: {
      ...round,
      phase: 'result',
      activeHandIndex: null,
      playerHands: round.playerHands.map((hand) => hand.status === 'playing' ? { ...hand, status: 'standing' } : hand),
      dealerHand: { ...round.dealerHand, holeRevealed: true },
    },
    lastResult: result,
  };
  return { nextState, events: [...events, { type: 'roundSettled', result }] };
}

function appendSettlementEvent(events: EngineEvent[], state: SessionState): EngineEvent[] {
  if (!state.lastResult) return events;
  if (events.some((event) => event.type === 'roundSettled')) return events;
  return [...events, { type: 'roundSettled', result: state.lastResult }];
}

function dealPendingHandCard(state: SessionState, index: number, events: EngineEvent[]): SessionState {
  const round = state.round;
  const hand = round?.playerHands[index];
  if (!round || !hand || hand.cards.length !== 1) {
    throw new BlackjackError('INTEGRITY_ERROR', 'A pending split hand must contain exactly one card');
  }
  const drawn = drawRequired(state.shoe);
  const cards = [...hand.cards, drawn.card];
  const status = scoreHand(cards).isBust ? 'busted' : 'playing';
  events.push({ type: 'cardDrawn', target: 'player', handId: hand.handId });
  return {
    ...state,
    shoe: drawn.shoe,
    round: replaceHand(round, index, { ...hand, cards, status }),
  };
}

function markHandStanding(state: SessionState, index: number): SessionState {
  const round = state.round;
  const hand = round?.playerHands[index];
  if (!round || !hand) throw new BlackjackError('INTEGRITY_ERROR', 'Hand index is invalid');
  return { ...state, round: replaceHand(round, index, { ...hand, status: 'standing' }) };
}

function replaceHand(round: RoundState, index: number, hand: PlayerHand): RoundState {
  const hands = [...round.playerHands];
  if (!hands[index]) throw new BlackjackError('INTEGRITY_ERROR', 'Hand index is invalid');
  hands[index] = hand;
  return { ...round, playerHands: hands };
}

function requireActiveHand(
  state: SessionState,
  handId: string,
): { round: RoundState; hand: PlayerHand; index: number } {
  const round = requireRoundPhase(state, 'playerTurn');
  const index = round.activeHandIndex;
  if (index === null) throw new BlackjackError('INTEGRITY_ERROR', 'Player turn has no active hand');
  const hand = round.playerHands[index];
  if (!hand || hand.handId !== handId || hand.status !== 'playing') {
    throw new BlackjackError('INVALID_HAND', 'The supplied hand is not active');
  }
  return { round, hand, index };
}

function requireRoundPhase<T extends RoundState['phase']>(state: SessionState, phase: T): RoundState & { phase: T } {
  const round = state.round;
  if (!round || round.phase !== phase) {
    throw new BlackjackError('INVALID_ACTION', `Action requires ${phase} phase`);
  }
  return round as RoundState & { phase: T };
}

function assertBetting(state: SessionState, message: string): void {
  if (state.round !== null) throw new BlackjackError('INVALID_ACTION', message);
}

function drawRequired(shoe: Shoe): { card: Card; shoe: Shoe } {
  try {
    return drawCard(shoe);
  } catch {
    throw new BlackjackError('INTEGRITY_ERROR', 'Unexpected shoe exhaustion during a round');
  }
}

function requireId(value: string, kind: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BlackjackError('INTEGRITY_ERROR', `${kind} ID source returned an empty value`);
  }
  return value;
}

function validateShoe(shoe: Shoe): void {
  if (shoe.cards.length !== SHOE_SIZE
    || !Number.isSafeInteger(shoe.nextIndex)
    || shoe.nextIndex < 0
    || shoe.nextIndex > shoe.cards.length) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Shoe index is invalid');
  }
  const ids = new Set<string>();
  const composition = new Map<string, number>();
  for (const card of shoe.cards) {
    if (!card.cardId
      || ids.has(card.cardId)
      || !(RANKS as readonly string[]).includes(card.rank)
      || !(SUITS as readonly string[]).includes(card.suit)) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Shoe card IDs must be unique');
    }
    ids.add(card.cardId);
    const key = `${card.rank}-${card.suit}`;
    composition.set(key, (composition.get(key) ?? 0) + 1);
  }
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      if (composition.get(`${rank}-${suit}`) !== 6) {
        throw new BlackjackError('INTEGRITY_ERROR', 'Shoe must contain six complete decks');
      }
    }
  }
}

function validateFreshShoe(shoe: Shoe): void {
  validateShoe(shoe);
  if (shoe.nextIndex !== 0) throw new BlackjackError('INTEGRITY_ERROR', 'A replacement shoe must be fresh');
}

export function validateState(state: SessionState): void {
  if (state.ruleSetId !== RULE_SET_ID) throw new BlackjackError('INTEGRITY_ERROR', 'Unknown rule set');
  assertSafeCents(state.balanceCents, 'Balance');
  assertSafeCents(state.pendingBetCents, 'Pending bet');
  if (state.pendingBetCents !== 0 && state.pendingBetCents < 100) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Pending bet is invalid');
  }
  if (!isBetStep(state.betStepCents)) throw new BlackjackError('INTEGRITY_ERROR', 'Bet step is invalid');
  validateShoe(state.shoe);
  const ledgerKeys = new Set<string>();
  for (const entry of state.ledger) {
    assertSafeCents(entry.wagerCents, 'Ledger wager');
    assertSafeCents(entry.returnedCents, 'Ledger return');
    if (entry.netCents !== entry.returnedCents - entry.wagerCents || !Number.isSafeInteger(entry.netCents)) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Ledger net is inconsistent');
    }
    if (!entry.roundId || !entry.componentId) throw new BlackjackError('INTEGRITY_ERROR', 'Ledger keys must not be empty');
    if (!(SETTLEMENT_OUTCOMES as readonly string[]).includes(entry.outcome)) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Ledger outcome is invalid');
    }
    const key = `${entry.roundId}\u0000${entry.componentId}`;
    if (ledgerKeys.has(key)) throw new BlackjackError('INTEGRITY_ERROR', 'Ledger keys must be unique');
    ledgerKeys.add(key);
  }
  validateLastResult(state);
  const round = state.round;
  if (!round) return;
  if (!round.roundId
    || !(ROUND_PHASES as readonly string[]).includes(round.phase)
    || round.playerHands.length < 1
    || round.playerHands.length > 4) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Round shape is invalid');
  }
  assertSafeCents(round.originalWagerCents, 'Original wager');
  if (round.originalWagerCents < 100) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Original wager is invalid');
  }
  const handIds = new Set<string>();
  const roundCardIds = new Set<string>();
  const consumedCards = new Map(
    state.shoe.cards.slice(0, state.shoe.nextIndex).map((card) => [card.cardId, card] as const),
  );
  for (const hand of round.playerHands) {
    if (!hand.handId || hand.handId === 'insurance' || handIds.has(hand.handId)) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Hand IDs must be unique and must not use reserved ledger keys');
    }
    handIds.add(hand.handId);
    assertSafeCents(hand.wagerCents, 'Hand wager');
    if (hand.wagerCents < 100 || hand.cards.length < 1) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Hand wager or cards are invalid');
    }
    if (!(HAND_STATUSES as readonly string[]).includes(hand.status)) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Hand status is invalid');
    }
    for (const card of hand.cards) validateRoundCard(card, roundCardIds, consumedCards);
  }
  if (round.dealerHand.cards.length < 2) throw new BlackjackError('INTEGRITY_ERROR', 'Dealer hand is incomplete');
  for (const card of round.dealerHand.cards) validateRoundCard(card, roundCardIds, consumedCards);
  if (round.insurance) {
    assertSafeCents(round.insurance.wagerCents, 'Insurance wager');
    assertSafeCents(round.insurance.maxWagerCents, 'Insurance maximum');
    if (round.insurance.wagerCents % 50 !== 0
      || round.insurance.maxWagerCents % 50 !== 0
      || round.insurance.wagerCents > round.insurance.maxWagerCents
      || round.insurance.maxWagerCents > Math.floor(round.originalWagerCents / 2)) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Insurance amount is invalid');
    }
    if (!(INSURANCE_DECISIONS as readonly string[]).includes(round.insurance.decision)) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Insurance decision is invalid');
    }
    const hasInsuranceEntry = ledgerKeys.has(`${round.roundId}\u0000insurance`);
    if (round.insurance.decision === 'pending' && round.insurance.wagerCents !== 0) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Pending insurance cannot have a wager');
    }
    if (round.insurance.decision === 'declined' && (round.insurance.wagerCents !== 0 || hasInsuranceEntry)) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Declined insurance cannot have a wager or settlement');
    }
    if (round.insurance.decision === 'purchased'
      && (round.insurance.wagerCents < 50 || !hasInsuranceEntry)) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Purchased insurance must be wagered and settled');
    }
    if ((round.insurance.decision === 'evenMoney' || round.insurance.decision === 'keptBlackjack')
      && (round.phase !== 'result' || round.insurance.wagerCents !== 0 || hasInsuranceEntry)) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Natural blackjack decision is inconsistent');
    }
  }
  if (round.phase === 'playerTurn') {
    const active = round.activeHandIndex;
    if (active === null || round.playerHands[active]?.status !== 'playing') {
      throw new BlackjackError('INTEGRITY_ERROR', 'Player turn must have an active playable hand');
    }
  } else if (round.activeHandIndex !== null) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Only player turn can have an active hand');
  }
  if (round.phase === 'insuranceDecision') {
    const dealerUp = round.dealerHand.cards[0];
    if (dealerUp?.rank !== 'A' || round.insurance?.decision !== 'pending' || round.dealerHand.holeRevealed) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Insurance decision state is inconsistent');
    }
  } else if (round.phase === 'playerTurn' && round.dealerHand.holeRevealed) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Dealer hole card must stay hidden during player turn');
  } else if ((round.phase === 'dealerTurn' || round.phase === 'result') && !round.dealerHand.holeRevealed) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Dealer hole card must be revealed after player turns');
  }
  if (round.phase !== 'insuranceDecision' && round.insurance?.decision === 'pending') {
    throw new BlackjackError('INTEGRITY_ERROR', 'Insurance cannot remain pending after the decision phase');
  }
  if ((round.phase === 'dealerTurn' || round.phase === 'result')
    && round.playerHands.some((hand) => hand.status === 'playing')) {
    throw new BlackjackError('INTEGRITY_ERROR', 'No player hand may remain active after the player turn');
  }
  if (round.phase === 'result') {
    for (const hand of round.playerHands) {
      if (!ledgerKeys.has(`${round.roundId}\u0000${hand.handId}`)) {
        throw new BlackjackError('INTEGRITY_ERROR', 'Every result hand must have a ledger entry');
      }
    }
    if (!state.lastResult || state.lastResult.roundId !== round.roundId) {
      throw new BlackjackError('INTEGRITY_ERROR', 'Last result is inconsistent with the ledger');
    }
  } else if (state.lastResult !== null) {
    throw new BlackjackError('INTEGRITY_ERROR', 'An active round cannot also expose a last result');
  }
}

function validateRoundCard(card: Card, roundIds: Set<string>, consumedCards: Map<string, Card>): void {
  const source = consumedCards.get(card.cardId);
  if (!card.cardId
    || roundIds.has(card.cardId)
    || !source
    || source.rank !== card.rank
    || source.suit !== card.suit) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Round card IDs are inconsistent with the consumed shoe');
  }
  roundIds.add(card.cardId);
}

function validateLastResult(state: SessionState): void {
  const result = state.lastResult;
  if (!result) return;
  if (!result.roundId || !Number.isSafeInteger(result.netCents)) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Last result is invalid');
  }
  const entries = state.ledger.filter((entry) => entry.roundId === result.roundId);
  if (result.netCents !== calculateRoundNet(state.ledger, result.roundId)
    || result.entries.length !== entries.length
    || entries.some((entry, index) => {
      const resultEntry = result.entries[index];
      return !resultEntry
        || resultEntry.componentId !== entry.componentId
        || resultEntry.outcome !== entry.outcome
        || resultEntry.wagerCents !== entry.wagerCents
        || resultEntry.returnedCents !== entry.returnedCents
        || resultEntry.netCents !== entry.netCents;
    })) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Last result entries are inconsistent with the ledger');
  }
}
