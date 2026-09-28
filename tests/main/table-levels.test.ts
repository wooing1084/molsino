import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStore } from '../../src/main/game/app-store';
import { burnShoe, createBaccarat, createCards, transitionBaccarat } from '../../src/core/baccarat/core';
import { toBaccaratView } from '../../src/main/game/baccarat-adapter';
import { createSession, transition } from '../../src/core/engine';
import { toGameViewState } from '../../src/main/game/blackjack-adapter';
import { newAppSession, type AppSession } from '../../src/main/persistence/app-session-repository';
import { appActionSchema, type AppAction } from '../../src/shared/app-contracts';
import { TABLE_LEVELS } from '../../src/shared/table-levels';
import { parseBetInput } from '../../src/shared/bet-input';
import { card, environment, fixtureShoe } from '../core/helpers';

afterEach(() => vi.useRealTimers());
function harness(state = newAppSession(), env = environment()) {
  const save = vi.fn(async (_state: AppSession) => {});
  const store = new AppStore(state, env, 'test', { save });
  const act = (action: AppAction) => { const s = store.getSnapshot(); return store.dispatch({ sessionId: s.sessionId, commandId: randomUUID(), expectedRevision: s.revision, action }); };
  return { store, save, act };
}
function funded(balance: number, level: AppSession['table']['selectedLevel'] = 1) {
  const s = newAppSession(); s.wallet.balanceCents = balance; s.table = { selectedLevel: level, bestBankrollCents: balance }; return s;
}
describe('common table limits in the authoritative writer', () => {
  it.each(TABLE_LEVELS)('enforces level $level endpoints for blackjack and every baccarat target', async limits => {
    const { act, store } = harness(funded(Math.max(limits.entryBalanceCents, limits.maxBetCents + 100), limits.level));
    await act({ type: 'selectGame', gameId: 'blackjack' });
    for (const amountCents of [limits.minBetCents - 1, limits.maxBetCents + 1]) expect(await act({ type: 'blackjack', action: { type: 'setBet', amountCents } })).toMatchObject({ ok: false });
    for (const amountCents of [limits.minBetCents, limits.maxBetCents]) expect(await act({ type: 'blackjack', action: { type: 'setBet', amountCents } })).toMatchObject({ ok: true });
    await act({ type: 'goToMenu' }); await act({ type: 'selectGame', gameId: 'baccarat' });
    for (const target of ['P', 'B', 'T'] as const) {
      for (const amountCents of [limits.minBetCents - 1, limits.maxBetCents + 1]) expect(await act({ type: 'baccarat', action: { type: 'setBet', target, amountCents } })).toMatchObject({ ok: false });
      for (const amountCents of [limits.minBetCents, limits.maxBetCents]) expect(await act({ type: 'baccarat', action: { type: 'setBet', target, amountCents } })).toMatchObject({ ok: true });
    }
    expect(store.getSnapshot().table.maxBetCents).toBe(limits.maxBetCents);
  });
  it('admits using present funds, retains selected level below entry, and checks reentry', async () => {
    const { act, store, save } = harness(funded(49999, 2));
    expect(await act({ type: 'selectLevel', level: 2 })).toMatchObject({ ok: true });
    await act({ type: 'selectGame', gameId: 'blackjack' });
    expect(store.getSnapshot().blackjack?.pendingBetCents).toBe(500);
    expect(await act({ type: 'selectLevel', level: 1 })).toMatchObject({ ok: false });
    await act({ type: 'goToMenu' });
    const restarted = harness(save.mock.calls.at(-1)![0]);
    expect(restarted.store.getSnapshot().table.selectedLevel).toBe(2);
    await act({ type: 'selectLevel', level: 1 });
    expect(await act({ type: 'selectLevel', level: 2 })).toMatchObject({ ok: false });
    expect(store.getSnapshot().table.selectedLevel).toBe(1);
    expect(await harness(funded(50000)).act({ type: 'selectLevel', level: 2 })).toMatchObject({ ok: true });
  });
  it('shows fixed limits and blocks every fresh wager below selected minimum without forced demotion', async () => {
    const { act, store } = harness(funded(499, 2));
    for (const gameId of ['blackjack', 'baccarat'] as const) {
      await act({ type: 'selectGame', gameId });
      expect(store.getSnapshot().table).toMatchObject({ selectedLevel: 2, minBetCents: 500, maxBetCents: 25000 });
      expect(store.getSnapshot()[gameId]?.legalActions).not.toContain('deal');
      expect(store.getSnapshot()[gameId]?.legalActions).not.toContain('setBet');
      expect(await act({ type: gameId, action: { type: 'deal' } })).toMatchObject({ ok: false });
      await act({ type: 'goToMenu' });
    }
    await act({ type: 'selectLevel', level: 1 });
    await act({ type: 'selectGame', gameId: 'blackjack' });
    expect(store.getSnapshot().blackjack?.legalActions).toContain('deal');
  });
  it('keeps committed level on failed save, retries exact candidate, and rejects changing the pending choice', async () => {
    const { act, store, save } = harness(funded(50000));
    save.mockRejectedValueOnce(new Error('disk'));
    expect(await act({ type: 'selectLevel', level: 2 })).toMatchObject({ ok: false, error: 'SAVE_FAILED' });
    const candidate = save.mock.calls.at(-1)![0];
    expect(store.getSnapshot().table.selectedLevel).toBe(1);
    expect(await act({ type: 'selectLevel', level: 1 })).toMatchObject({ error: 'SAVE_FAILED' });
    expect(await act({ type: 'retrySave' })).toMatchObject({ ok: true });
    expect(save.mock.calls.at(-1)![0]).toEqual(candidate);
    expect(store.getSnapshot().table.selectedLevel).toBe(2);
  });
  it('clamps a legacy betting draft before direct deal, but permits double above the base cap', async () => {
    vi.useFakeTimers();
    const env = environment(fixtureShoe([card('5'), card('6'), card('6', 'H'), card('10'), card('10', 'H')]));
    const state = funded(20000);
    const { balanceCents: _, ...bj } = createSession(env.createShoe(), { balanceCents: 20000, pendingBetCents: 15000 });
    state.games.blackjack = structuredClone(bj) as NonNullable<AppSession['games']['blackjack']>; state.screen = 'blackjack';
    const { act, store } = harness(state, env);
    expect(await act({ type: 'blackjack', action: { type: 'deal' } })).toMatchObject({ ok: true });
    expect(store.getSnapshot().blackjack?.playerHands[0]?.wagerCents).toBe(5000);
    const handId = store.getSnapshot().blackjack!.playerHands[0]!.handId;
    expect(await act({ type: 'blackjack', action: { type: 'doubleDown', handId } })).toMatchObject({ ok: true });
    expect(store.getSnapshot().blackjack?.playerHands[0]?.wagerCents).toBe(10000);
    expect(store.getSnapshot().table.bestBankrollCents).toBe(20000);
    await vi.runAllTimersAsync();
  });
  it('records peaks only when settlement commits, never demotes achievement, and resets it explicitly', async () => {
    const env = environment(fixtureShoe([card('A'), card('9'), card('K'), card('7')]));
    const { act, store, save } = harness(funded(49900), env);
    await act({ type: 'selectGame', gameId: 'blackjack' });
    save.mockRejectedValueOnce(new Error('disk'));
    expect(await act({ type: 'blackjack', action: { type: 'deal' } })).toMatchObject({ error: 'SAVE_FAILED' });
    expect(store.getSnapshot().table).toMatchObject({ bestBankrollCents: 49900, bestLevel: 1 });
    await act({ type: 'retrySave' });
    expect(store.getSnapshot().table).toMatchObject({ bestBankrollCents: 50050, bestLevel: 2, selectedLevel: 1 });
    await act({ type: 'goToMenu' }); await act({ type: 'selectLevel', level: 2 });
    expect(store.getSnapshot().table.bestLevel).toBe(2);
    await act({ type: 'resetAll' });
    expect(store.getSnapshot()).toMatchObject({ balanceCents: 10000, table: { bestBankrollCents: 10000, bestLevel: 1, selectedLevel: 1 } });
  });
  it('validates strict level commands and cent input against both fixed cap and balance', () => {
    for (const level of [0, 7, 1.5, '2']) expect(appActionSchema.safeParse({ type: 'selectLevel', level }).success).toBe(false);
    expect(appActionSchema.safeParse({ type: 'selectLevel', level: 2, extra: true }).success).toBe(false);
    const limits = TABLE_LEVELS[1];
    expect(parseBetInput('5.01', 1000, limits)).toEqual({ ok: true, cents: 501 });
    for (const [amount, balance] of [['4.99', 1000], ['250.01', 50000], ['10.01', 1000]] as const) expect(parseBetInput(amount, balance, limits).ok).toBe(false);
  });
});

it('public reveal order survives split relocation and does not expose the hidden hole ID', () => {
  const env = environment(fixtureShoe([card('8'), card('6'), card('8', 'H'), card('10'), card('3'), card('4')]));
  let state = transition(createSession(env.createShoe()), { type: 'deal' }, env).nextState;
  const initial = toGameViewState(state, 1, 'test');
  expect(initial.roundId).toBe(state.round!.roundId);
  expect(initial.cardRevealOrder).toEqual(state.shoe.cards.slice(0, 3).map(c => c.cardId));
  expect(JSON.stringify(initial)).not.toContain(state.round!.dealerHand.cards[1]!.cardId);
  state = transition(state, { type: 'split', handId: state.round!.playerHands[0]!.handId }, env).nextState;
  const split = toGameViewState(state, 2, 'test');
  expect(split.cardRevealOrder.slice(0, 3)).toEqual(initial.cardRevealOrder);
  expect(split.cardRevealOrder).toHaveLength(4);
  expect(new Set(split.cardRevealOrder).size).toBe(4);
  expect(split.roundId).toBe(initial.roundId);
});

it('settles an old above-cap baccarat round unchanged, publishes draw order, then normalizes the next wager', async () => {
  vi.useFakeTimers();
  const pool = createCards();
  const prefix = ['A', 'A', '9', '2', 'K', '3'].map(rank => pool.splice(pool.findIndex(c => c.rank === rank), 1)[0]!);
  const env = { createShoe: () => burnShoe([...prefix, ...pool]), nextId: randomUUID };
  const state = funded(100000);
  let game = createBaccarat(env.createShoe());
  game = transitionBaccarat(game, 100000, { type: 'setBet', target: 'P', amountCents: 20000 }, env, state.sessionId).game;
  const dealt = transitionBaccarat(game, 100000, { type: 'deal' }, env, state.sessionId);
  state.games.baccarat = dealt.game; state.wallet.balanceCents = dealt.balance; state.activeRoundGameId = 'baccarat'; state.screen = 'baccarat';
  const { store, act, save } = harness(state);
  store.resumeAutomatic();
  await vi.runAllTimersAsync();
  expect(store.getSnapshot()).toMatchObject({ balanceCents: 120000, table: { bestBankrollCents: 120000 }, baccarat: { phase: 'result', pendingBet: { amountCents: 20000 }, lastResult: { returnCents: 40000 } } });
  const saved = save.mock.calls.at(-1)![0];
  const view = toBaccaratView(saved.games.baccarat!, saved.wallet.balanceCents);
  expect(view.cardRevealOrder).toEqual(prefix.slice(2).map(c => c.cardId));
  expect(view.roundId).toBe(dealt.game.round!.roundId);
  const proof = structuredClone(saved.games.baccarat!.lastResult);
  await act({ type: 'baccarat', action: { type: 'nextRound' } });
  expect(store.getSnapshot().baccarat?.pendingBet.amountCents).toBe(5000);
  expect(save.mock.calls.at(-1)![0].games.baccarat!.lastResult).toEqual(proof);
});
it('continues an above-cap blackjack insurance decision and next-round minimum without mutating old wager proof', async () => {
  const env = environment(fixtureShoe([card('9'), card('A'), card('7'), card('K')]));
  const state = funded(25000);
  const original = transition(createSession(env.createShoe(), { balanceCents: 45000, pendingBetCents: 20000 }), { type: 'deal' }, env).nextState;
  const { balanceCents, ...bj } = original;
  state.games.blackjack = structuredClone(bj) as NonNullable<AppSession['games']['blackjack']>;
  state.wallet.balanceCents = balanceCents; state.activeRoundGameId = 'blackjack'; state.screen = 'blackjack';
  const { act, store, save } = harness(state, env);
  expect(await act({ type: 'blackjack', action: { type: 'chooseInsurance', amountCents: 10000 } })).toMatchObject({ ok: true });
  expect(store.getSnapshot().blackjack?.phase).toBe('result');
  const before = save.mock.calls.at(-1)![0].games.blackjack!.ledger;
  await act({ type: 'goToMenu' }); await act({ type: 'selectLevel', level: 1 }); await act({ type: 'selectGame', gameId: 'blackjack' });
  expect(save.mock.calls.at(-1)![0].games.blackjack!.round!.originalWagerCents).toBe(20000);
  await act({ type: 'blackjack', action: { type: 'nextRound' } });
  expect(store.getSnapshot().blackjack?.pendingBetCents).toBe(5000);
  expect(save.mock.calls.at(-1)![0].games.blackjack!.ledger).toEqual(before);
});
