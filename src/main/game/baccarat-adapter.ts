import { checkBet, score, type BaccaratState } from '../../core/baccarat/core';
import type { BaccaratView } from '../../shared/baccarat-view';
export function toBaccaratView(s: BaccaratState, balance: number): BaccaratView {
  const hand = (cards: BaccaratState['shoe']['cards']) => ({ cards: cards.map(c => ({ ...c })), total: cards.length ? score(cards) : null });
  const legalActions: BaccaratView['legalActions'] = [];
  if (s.phase === 'betting' && balance >= 100) {
    legalActions.push('setBet');
    try { checkBet(s.pendingBet, balance); legalActions.push('deal'); } catch { /* Current wager cannot safely settle. */ }
  }
  if (s.phase === 'result') legalActions.push('nextRound');
  const r = s.phase === 'result' ? s.lastResult : null;
  return { phase: s.phase, pendingBet: { ...s.pendingBet }, player: hand(s.round?.player ?? []), banker: hand(s.round?.banker ?? []),
    lastResult: r ? { outcome: r.outcome, bet: { ...r.bet }, returnCents: r.returnCents, netCents: r.netCents } : null,
    recentResults: s.recentResults.map(({ roundId, outcome }) => ({ roundId, outcome })), legalActions };
}
