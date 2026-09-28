import type { BigWheelAction, BigWheelBets, BigWheelState, BigWheelSymbol } from '../core/bigwheel/core';
export interface BigWheelView {
  roundId: string | null;
  phase: 'betting' | 'spinning' | 'result';
  pendingBets: BigWheelBets;
  totalBetCents: number;
  lastResult: Pick<NonNullable<BigWheelState['lastResult']>, 'roundId' | 'outcome' | 'segmentIndex' | 'bets' | 'totalBetCents' | 'returnCents' | 'netCents'> | null;
  recentResults: { roundId: string; outcome: BigWheelSymbol }[];
  legalActions: BigWheelAction['type'][];
}
