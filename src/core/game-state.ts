import type { Card } from './models';
import type { Shoe } from './shoe';
import type { LedgerEntry } from './settlement';

export const RULE_SET_ID = 'casino-6d-s17-3to2-v1' as const;
export const STARTING_BALANCE_CENTS = 10_000;
export const DEFAULT_BET_CENTS = 100;
export const BET_STEPS_CENTS = [100, 500, 1_000, 2_500] as const;
export const MAX_BET_CENTS = 50_000;
export const MAX_HANDS = 4;

export const ROUND_PHASES = ['insuranceDecision', 'playerTurn', 'dealerTurn', 'result'] as const;
export type GamePhase = 'betting' | (typeof ROUND_PHASES)[number];
export const HAND_STATUSES = ['playing', 'standing', 'busted', 'surrendered'] as const;
export type HandStatus = (typeof HAND_STATUSES)[number];
export const INSURANCE_DECISIONS = ['pending', 'declined', 'purchased', 'evenMoney', 'keptBlackjack'] as const;

export interface PlayerHand {
  readonly handId: string;
  readonly cards: readonly Card[];
  readonly wagerCents: number;
  readonly status: HandStatus;
  readonly fromSplit: boolean;
  readonly splitAces: boolean;
  readonly doubled: boolean;
}

export interface DealerHand {
  readonly cards: readonly Card[];
  readonly holeRevealed: boolean;
}

export interface InsuranceState {
  readonly decision: (typeof INSURANCE_DECISIONS)[number];
  readonly wagerCents: number;
  readonly maxWagerCents: number;
}

export interface RoundState {
  readonly roundId: string;
  readonly originalWagerCents: number;
  readonly phase: Exclude<GamePhase, 'betting'>;
  readonly playerHands: readonly PlayerHand[];
  readonly dealerHand: DealerHand;
  readonly activeHandIndex: number | null;
  readonly insurance: InsuranceState | null;
}

export interface RoundResult {
  readonly roundId: string;
  readonly netCents: number;
  readonly entries: readonly LedgerEntry[];
}

export interface SessionState {
  readonly ruleSetId: typeof RULE_SET_ID;
  readonly balanceCents: number;
  readonly pendingBetCents: number;
  readonly betStepCents: number;
  readonly shoe: Shoe;
  readonly round: RoundState | null;
  readonly ledger: readonly LedgerEntry[];
  readonly lastResult: RoundResult | null;
}

export type UserAction =
  | { readonly type: 'setBet'; readonly amountCents: number }
  | { readonly type: 'setBetStep'; readonly stepCents: number }
  | { readonly type: 'deal' }
  | { readonly type: 'chooseInsurance'; readonly amountCents: number }
  | { readonly type: 'acceptEvenMoney' }
  | { readonly type: 'keepBlackjack' }
  | { readonly type: 'hit'; readonly handId: string }
  | { readonly type: 'stand'; readonly handId: string }
  | { readonly type: 'doubleDown'; readonly handId: string }
  | { readonly type: 'split'; readonly handId: string }
  | { readonly type: 'surrender'; readonly handId: string }
  | { readonly type: 'nextRound' }
  | { readonly type: 'resetSession' };

export type InternalAction = { readonly type: 'advanceDealer' };
export type CoreAction = UserAction | InternalAction;

export type LegalAction =
  | 'setBet'
  | 'setBetStep'
  | 'deal'
  | 'chooseInsurance'
  | 'acceptEvenMoney'
  | 'keepBlackjack'
  | 'hit'
  | 'stand'
  | 'doubleDown'
  | 'split'
  | 'surrender'
  | 'nextRound'
  | 'resetSession';

export type EngineEvent =
  | { readonly type: 'roundStarted'; readonly roundId: string }
  | { readonly type: 'cardDrawn'; readonly target: 'player' | 'dealer'; readonly handId?: string }
  | { readonly type: 'insuranceSettled'; readonly returnedCents: number }
  | { readonly type: 'roundSettled'; readonly result: RoundResult }
  | { readonly type: 'sessionReset' };

export interface EngineEnvironment {
  readonly createShoe: () => Shoe;
  readonly nextId: (kind: 'round' | 'hand') => string;
}

export interface TransitionResult {
  readonly nextState: SessionState;
  readonly events: readonly EngineEvent[];
}
