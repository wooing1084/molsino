import type { Card } from '../core/models';
import type { BaccaratAction, BaccaratState, Target } from '../core/baccarat/core';
export interface BaccaratView {
  phase: 'betting' | 'dealing' | 'result';
  pendingBet: { target: Target; amountCents: number };
  player: { cards: Card[]; total: number | null };
  banker: { cards: Card[]; total: number | null };
  lastResult: Pick<NonNullable<BaccaratState['lastResult']>, 'outcome' | 'bet' | 'returnCents' | 'netCents'> | null;
  recentResults: { roundId: string; outcome: Target }[];
  legalActions: BaccaratAction['type'][];
}
