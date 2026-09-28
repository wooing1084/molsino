import { checkBigWheelBet, totalBigWheelBet, type BigWheelState } from '../../core/bigwheel/core';
import type { BigWheelView } from '../../shared/bigwheel-view';
export function toBigWheelView(s: BigWheelState, balance: number): BigWheelView {
  const legalActions: BigWheelView['legalActions'] = [];
  if (s.phase === 'betting') {
    legalActions.push('setBet');
    try { checkBigWheelBet(s.pendingBets, balance); legalActions.push('spin'); } catch { /* An incomplete or unsafe draft cannot spin. */ }
  }
  if (s.phase === 'result') legalActions.push('nextRound');
  const r = s.phase === 'result' ? s.lastResult : null;
  return { roundId: s.round?.roundId ?? null, phase: s.phase, pendingBets: { ...s.pendingBets }, totalBetCents: totalBigWheelBet(s.pendingBets),
    lastResult: r ? { roundId: r.roundId, outcome: r.outcome, segmentIndex: r.segmentIndex, bets: { ...r.bets }, totalBetCents: r.totalBetCents, returnCents: r.returnCents, netCents: r.netCents } : null,
    recentResults: s.recentResults.map(({ roundId, outcome }) => ({ roundId, outcome })), legalActions };
}
