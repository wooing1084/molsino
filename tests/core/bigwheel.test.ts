import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { BIG_WHEEL_RULES, BIG_WHEEL_SEGMENTS, BIG_WHEEL_SYMBOLS, bigWheelActionSchema, bigWheelPayout, checkBigWheelBet, createBigWheel, emptyBigWheelBets, totalBigWheelBet, transitionBigWheel, validateBigWheel, type BigWheelBets } from '../../src/core/bigwheel/core';
import { toBigWheelView } from '../../src/main/game/bigwheel-adapter';
const sessionId = randomUUID();
function spin(bets: BigWheelBets, index = 0, balance = 10000) {
  const state = createBigWheel(); state.pendingBets = bets;
  const env = { nextId: randomUUID, nextSegmentIndex: vi.fn(() => index) };
  return { ...transitionBigWheel(state, balance, { type: 'spin' }, env, sessionId), env };
}
describe('casino big wheel rules', () => {
  it('has 54 equally drawn segments with all seven independent target counts', () => {
    expect(BIG_WHEEL_SEGMENTS).toHaveLength(54);
    expect(BIG_WHEEL_SYMBOLS.map(target => BIG_WHEEL_SEGMENTS.filter(s => s === target).length)).toEqual([24, 15, 7, 4, 2, 1, 1]);
  });
  it.each(BIG_WHEEL_SYMBOLS)('settles every winning %s segment including principal, and all losing wagers', target => {
    for (const index of BIG_WHEEL_SEGMENTS.map((symbol, i) => symbol === target ? i : -1).filter(i => i >= 0)) {
      const bets = { silver: 101, gold: 102, emerald: 103, diamond: 104, crystal: 105, joker: 106, mega: 107 };
      const started = spin(bets, index);
      expect(started.balance).toBe(10000 - 728);
      validateBigWheel(started.game, sessionId, started.balance);
      const result = transitionBigWheel(started.game, started.balance, { type: 'advanceBigWheel' }, started.env, sessionId);
      const returned = bets[target] * (BIG_WHEEL_RULES[target].payout + 1);
      expect(result.balance).toBe(10000 - 728 + returned);
      expect(result.game.lastResult).toMatchObject({ outcome: target, segmentIndex: index, totalBetCents: 728, returnCents: returned, netCents: returned - 728 });
      validateBigWheel(result.game, sessionId, result.balance);
      expect(started.env.nextSegmentIndex).toHaveBeenCalledTimes(1);
      expect(() => transitionBigWheel(result.game, result.balance, { type: 'advanceBigWheel' }, started.env, sessionId)).toThrow();
    }
  });
  it('does not treat Joker and Mega as the same target', () => {
    const started = spin({ ...emptyBigWheelBets(), joker: 100 }, BIG_WHEEL_SEGMENTS.indexOf('mega'));
    const next = transitionBigWheel(started.game, started.balance, { type: 'advanceBigWheel' }, started.env, sessionId);
    expect(next.balance).toBe(9900); expect(next.game.lastResult?.returnCents).toBe(0);
  });
  it('allows individual cents and zero removal but never an empty spin or unsafe settlement', () => {
    const env = { nextId: randomUUID, nextSegmentIndex: vi.fn(() => 0) };
    const emptied = transitionBigWheel(createBigWheel(), 10000, { type: 'setBet', target: 'silver', amountCents: 0 }, env, sessionId);
    expect(totalBigWheelBet(emptied.game.pendingBets)).toBe(0);
    expect(() => transitionBigWheel(emptied.game, 10000, { type: 'spin' }, env, sessionId)).toThrow();
    expect(env.nextSegmentIndex).not.toHaveBeenCalled();
    expect(() => checkBigWheelBet({ ...emptyBigWheelBets(), mega: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER)).toThrow();
    expect(() => checkBigWheelBet({ ...emptyBigWheelBets(), silver: 1 }, Number.MAX_SAFE_INTEGER)).toThrow();
    expect(bigWheelPayout({ ...emptyBigWheelBets(), mega: 1 }, 'mega')).toBe(41);
    expect(() => totalBigWheelBet({ ...emptyBigWheelBets(), silver: Number.MAX_SAFE_INTEGER, gold: 1 })).toThrow();
    for (const index of [-1, 54, 0.5, NaN]) expect(() => spin({ ...emptyBigWheelBets(), silver: 100 }, index)).toThrow();
  });
  it('validates persisted phase, wager, outcome, ledger, history and restored payout evidence', () => {
    const started = spin({ ...emptyBigWheelBets(), silver: 100 });
    const result = transitionBigWheel(started.game, started.balance, { type: 'advanceBigWheel' }, started.env, sessionId);
    const invalid = [
      { ...started.game, phase: 'result' }, { ...started.game, round: null },
      { ...started.game, round: { ...started.game.round!, totalBetCents: 101 } },
      { ...started.game, pendingBets: { ...started.game.pendingBets, gold: 1 } },
      { ...result.game, lastResult: { ...result.game.lastResult!, returnCents: 999 } },
      { ...result.game, lastResult: { ...result.game.lastResult!, outcome: 'gold' } },
      { ...result.game, lastResult: { ...result.game.lastResult!, segmentIndex: 24 } },
      { ...result.game, recentResults: [] },
      { ...result.game, recentResults: [{ roundId: result.game.round!.roundId, number: 2, outcome: 'silver' }] },
    ];
    for (const game of invalid) expect(() => validateBigWheel(game as typeof started.game, sessionId, 9900)).toThrow();
    expect(() => validateBigWheel(result.game, randomUUID(), result.balance)).toThrow();
    expect(() => validateBigWheel(started.game, sessionId, Number.MAX_SAFE_INTEGER)).toThrow();
  });
  it('retains exactly the last 20 contiguous outcomes and withholds the spinning result', () => {
    let game = createBigWheel(), balance = 10000;
    const env = { nextId: randomUUID, nextSegmentIndex: () => 0 };
    for (let i = 0; i < 22; i++) {
      let next = transitionBigWheel(game, balance, { type: 'spin' }, env, sessionId);
      const payload = JSON.stringify(toBigWheelView(next.game, next.balance));
      for (const secret of ['segmentIndex', 'settlementKey', 'settledRoundCount']) expect(payload).not.toContain(`"${secret}"`);
      expect(toBigWheelView(next.game, next.balance).lastResult).toBeNull();
      next = transitionBigWheel(next.game, next.balance, { type: 'advanceBigWheel' }, env, sessionId);
      validateBigWheel(next.game, sessionId, next.balance);
      game = transitionBigWheel(next.game, next.balance, { type: 'nextRound' }, env, sessionId).game; balance = next.balance;
    }
    expect(game.recentResults.map(r => r.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 3));
    expect(game.pendingBets.silver).toBe(100);
  });
  it('rejects internal, malformed and extra-field public actions', () => {
    for (const action of [{ type: 'advanceBigWheel' }, { type: 'spin', index: 0 }, { type: 'setBet', target: 'unknown', amountCents: 100 }, { type: 'setBet', target: 'silver', amountCents: -1 }, { type: 'setBet', target: 'silver', amountCents: 1.5 }]) expect(bigWheelActionSchema.safeParse(action).success).toBe(false);
  });
});
