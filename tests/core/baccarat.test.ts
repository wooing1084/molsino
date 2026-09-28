import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { baccaratStateSchema, bankerDraws, burnShoe, cardValue, checkBet, createBaccarat, createCards, createShoe, payout, score, transitionBaccarat, validateBaccarat, type BaccaratAction, type BaccaratState, type Target } from '../../src/core/baccarat/core';
import type { Rank } from '../../src/core/models';
import { newAppSession, parseAppSession } from '../../src/main/persistence/app-session-repository';
import { appCommandSchema } from '../../src/shared/app-contracts';

const sessionId = randomUUID();
export function shoeWith(ranks: Rank[]) {
  const pool = createCards();
  const prefix = ranks.map(rank => pool.splice(pool.findIndex(c => c.rank === rank), 1)[0]!);
  return burnShoe([...prefix, ...pool]);
}
function play(ranks: Rank[], target: Target = 'P', wager = 100) {
  const env = { createShoe: () => shoeWith(['A', 'A', ...ranks]), nextId: randomUUID };
  let game = createBaccarat(env.createShoe()), balance = 10000;
  const act = (action: BaccaratAction | { type: 'advanceBaccarat' }) => {
    const next = transitionBaccarat(game, balance, action, env, sessionId);
    game = next.game; balance = next.balance;
    validateBaccarat(baccaratStateSchema.parse(game), sessionId, balance);
  };
  act({ type: 'setBet', target, amountCents: wager }); act({ type: 'deal' });
  const stages: BaccaratState[] = [structuredClone(game)];
  while (game.phase === 'dealing') { act({ type: 'advanceBaccarat' }); stages.push(structuredClone(game)); }
  return { game, balance, stages };
}
describe('baccarat rules and integer settlement', () => {
  it('has eight full decks, unique physical IDs, and burns the first card plus its burn value', () => {
    const cards = createCards();
    expect(cards).toHaveLength(416); expect(new Set(cards.map(c => c.cardId)).size).toBe(416);
    for (const rank of ['A', '2', '9', '10', 'J', 'Q', 'K'] as Rank[]) {
      const shoe = shoeWith([rank]);
      expect(shoe.nextIndex).toBe(1 + (rank === 'A' ? 1 : Number(rank) < 10 ? Number(rank) : 10));
    }
    expect(createShoe(max => max - 1).cards).toEqual(cards);
    expect(() => createShoe(max => max)).toThrow();
    expect(['A', '10', 'J', 'Q', 'K'].map(rank => cardValue({ rank: rank as Rank, suit: 'S', cardId: 'x' }))).toEqual([1, 0, 0, 0, 0]);
    expect(score(shoeWith(['9', '8', '6']).cards.slice(0, 3))).toBe(3);
  });
  it('covers every banker third-card table cell and the player stand case', () => {
    const allowed = ['0123456789', '0123456789', '0123456789', '012345679', '234567', '4567', '67', ''];
    for (let banker = 0; banker < 8; banker++) {
      for (let third = 0; third < 10; third++) expect(bankerDraws(banker, third)).toBe(allowed[banker]!.includes(String(third)));
      expect(bankerDraws(banker)).toBe(banker <= 5);
    }
  });
  it.each([
    ['P', 'P', 101, 202], ['B', 'B', 101, 197], ['B', 'B', 110, 215], ['B', 'B', 109, 213], ['B', 'B', 111, 216],
    ['T', 'T', 100, 900], ['P', 'T', 100, 100], ['B', 'T', 100, 100], ['T', 'P', 100, 0], ['P', 'B', 100, 0],
  ] as const)('%s / %s wager %i returns %i cents', (target, winner, amount, total) => expect(payout(target, winner, amount)).toBe(total));
  it('preflights maximum returns, intermediate products and final wallet overflow', () => {
    expect(() => checkBet({ target: 'T', amountCents: 100 }, 100)).not.toThrow();
    expect(() => checkBet({ target: 'P', amountCents: 99 }, 100)).toThrow();
    expect(() => checkBet({ target: 'B', amountCents: 101 }, 100)).toThrow();
    expect(() => checkBet({ target: 'B', amountCents: Math.floor(Number.MAX_SAFE_INTEGER / 95) + 1 }, Number.MAX_SAFE_INTEGER)).toThrow();
    for (const target of ['P', 'B', 'T'] as Target[]) expect(() => checkBet({ target, amountCents: 100 }, Number.MAX_SAFE_INTEGER)).toThrow();
    const maxTie = Math.floor(Number.MAX_SAFE_INTEGER / 9);
    expect(() => checkBet({ target: 'T', amountCents: maxTie }, maxTie)).not.toThrow();
    expect(() => checkBet({ target: 'T', amountCents: maxTie + 1 }, maxTie + 1)).toThrow();
  });
  it('ends on either natural and draws Player then Banker using the third card value', () => {
    expect(play(['9', '2', 'K', '3']).game.round).toMatchObject({ player: [{ rank: '9' }, { rank: 'K' }], banker: [{ rank: '2' }, { rank: '3' }] });
    expect(play(['2', '9', '3', 'K']).game.round!.player).toHaveLength(2);
    const drawn = play(['2', '2', '3', '4', '6', 'A']);
    expect(drawn.stages.map(s => s.round!.stage)).toEqual(['initial', 'playerThird', 'bankerThird', 'settle', 'settled']);
    expect(drawn.game.round!.player).toHaveLength(3); expect(drawn.game.round!.banker).toHaveLength(3);
    expect(drawn.game.lastResult!.outcome).toBe('B');
    // Player's third card 8 makes Banker 3 stand, even though Player's final score is 3.
    expect(play(['2', 'A', '3', '2', '8']).game.round!.banker).toHaveLength(2);
    expect(play(['3', '2', '3', '3', 'A']).game.round!.banker).toHaveLength(3);
  });
  it('reshuffles only before the next round when the cut was crossed', () => {
    let game = createBaccarat(shoeWith(['A', 'A']));
    game.shoe.nextIndex = 401;
    const replacement = vi.fn(() => shoeWith(['A', 'A']));
    const env = { createShoe: replacement, nextId: randomUUID };
    let balance = 10000;
    const act = (action: BaccaratAction | { type: 'advanceBaccarat' }) => {
      ({ game, balance } = transitionBaccarat(game, balance, action, env, sessionId));
      validateBaccarat(game, sessionId, balance);
    };
    act({ type: 'deal' }); while (game.phase === 'dealing') act({ type: 'advanceBaccarat' });
    expect(replacement).not.toHaveBeenCalled(); expect(game.shoe.nextIndex).toBeGreaterThanOrEqual(405);
    act({ type: 'nextRound' }); act({ type: 'deal' });
    expect(replacement).toHaveBeenCalledTimes(1); expect(game.round!.startIndex).toBe(2);
  });
});

describe('baccarat recovery validation and command boundary', () => {
  it('rejects malformed commands and internal advancement from public IPC', () => {
    for (const action of [{ type: 'advanceBaccarat' }, { type: 'setBet', target: ['P', 'B'], amountCents: 100 },
      { type: 'setBet', target: 'P', amountCents: 100, extra: true }, { type: 'setBet', target: 'B', amountCents: 100.5 }]) {
      expect(appCommandSchema.safeParse({ sessionId, commandId: randomUUID(), expectedRevision: 0, action: { type: 'baccarat', action } }).success).toBe(false);
    }
  });
  it('rejects corrupt cards, stages, burn, settlement evidence and history', () => {
    const good = play(['2', '2', '3', '4', '6', 'A']).game;
    const mutations: ((s: BaccaratState) => void)[] = [
      s => { s.shoe.cards[1] = s.shoe.cards[0]!; }, s => { s.shoe.cards[0]!.rank = 'K'; },
      s => { s.shoe.burnCount++; }, s => { s.shoe.nextIndex--; }, s => { s.round!.player[0]!.rank = 'K'; },
      s => { s.round!.banker.pop(); }, s => { s.round!.stage = 'initial'; }, s => { s.round!.startIndex++; },
      s => { s.round!.bet.target = 'T'; }, s => { s.lastResult!.returnCents++; }, s => { s.lastResult!.netCents++; },
      s => { s.lastResult!.settlementKey.sessionId = randomUUID(); }, s => { s.lastResult!.outcome = 'P'; },
      s => { s.recentResults[0]!.number++; }, s => { s.recentResults[0]!.outcome = 'P'; }, s => { s.recentResults = []; },
      s => { s.phase = 'betting'; }, s => { s.settledRoundCount++; },
    ];
    for (const mutate of mutations) { const bad = structuredClone(good); mutate(bad); expect(() => validateBaccarat(baccaratStateSchema.parse(bad), sessionId, 10000)).toThrow(); }
  });
  it('preserves a zero wallet in-flight and rejects a second settlement', () => {
    const env = { createShoe: () => shoeWith(['A', 'A', '9', '2', 'K', '3']), nextId: randomUUID };
    let { game, balance } = transitionBaccarat(createBaccarat(env.createShoe()), 100, { type: 'deal' }, env, sessionId);
    expect(balance).toBe(0);
    while (game.phase === 'dealing') ({ game, balance } = transitionBaccarat(game, balance, { type: 'advanceBaccarat' }, env, sessionId));
    expect(balance).toBe(200);
    expect(() => transitionBaccarat(game, balance, { type: 'advanceBaccarat' }, env, sessionId)).toThrow();
    const app = newAppSession(); app.sessionId = sessionId; app.games.baccarat = game; app.wallet.balanceCents = balance; app.screen = 'baccarat';
    expect(() => parseAppSession(app)).not.toThrow();
    app.activeRoundGameId = 'baccarat'; expect(() => parseAppSession(app)).toThrow();
  });
  it('keeps the latest twenty ordered rounds without using history as the settlement guard', () => {
    const env = { createShoe: () => shoeWith(['A', 'A']), nextId: randomUUID };
    let game = createBaccarat(env.createShoe()), balance = 10000;
    for (let i = 0; i < 25; i++) {
      ({ game, balance } = transitionBaccarat(game, balance, { type: 'deal' }, env, sessionId));
      while (game.phase === 'dealing') ({ game, balance } = transitionBaccarat(game, balance, { type: 'advanceBaccarat' }, env, sessionId));
      validateBaccarat(game, sessionId, balance);
      if (i < 24) ({ game, balance } = transitionBaccarat(game, balance, { type: 'nextRound' }, env, sessionId));
    }
    expect(game.recentResults.map(r => r.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 6));
    expect(game.lastResult!.number).toBe(25);
  });
});
