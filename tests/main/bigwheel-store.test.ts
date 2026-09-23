import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStore } from '../../src/main/game/app-store';
import { newAppSession, parseAppSession, type AppSession } from '../../src/main/persistence/app-session-repository';
import { appActionSchema, type AppAction } from '../../src/shared/app-contracts';
import { BIG_WHEEL_SEGMENTS } from '../../src/core/bigwheel/core';
import { TABLE_LEVELS } from '../../src/shared/table-levels';
import { environment } from '../core/helpers';
afterEach(() => vi.useRealTimers());
function harness(state = newAppSession(), index = 0) {
  const save = vi.fn(async (_snapshot: AppSession) => {}), nextSegmentIndex = vi.fn(() => index);
  const store = new AppStore(state, environment(), 'test', { save }, 100, undefined, { nextId: randomUUID, nextSegmentIndex });
  const command = (action: AppAction) => ({ sessionId: store.getSnapshot().sessionId, commandId: randomUUID(), expectedRevision: store.getSnapshot().revision, action });
  const act = (action: AppAction) => store.dispatch(command(action));
  return { store, save, nextSegmentIndex, act, command };
}
describe('big wheel single writer integration', () => {
  it.each(TABLE_LEVELS)('applies level $level to total wager while preserving incomplete drafts and zero removal', async limits => {
    const state = newAppSession(); state.table.selectedLevel = limits.level; state.wallet.balanceCents = limits.maxBetCents * 2;
    const { store, act } = harness(state);
    await act({ type: 'selectGame', gameId: 'bigwheel' });
    expect(store.getSnapshot().bigwheel?.pendingBets.silver).toBe(limits.minBetCents);
    await act({ type: 'bigwheel', action: { type: 'setBet', target: 'silver', amountCents: 0 } });
    await act({ type: 'bigwheel', action: { type: 'setBet', target: 'mega', amountCents: 1 } });
    expect(store.getSnapshot().bigwheel?.totalBetCents).toBe(1);
    expect(store.getSnapshot().bigwheel?.legalActions).not.toContain('spin');
    expect(await act({ type: 'bigwheel', action: { type: 'spin' } })).toMatchObject({ ok: false });
    expect(await act({ type: 'bigwheel', action: { type: 'setBet', target: 'silver', amountCents: limits.maxBetCents } })).toMatchObject({ ok: false });
    expect(await act({ type: 'bigwheel', action: { type: 'setBet', target: 'silver', amountCents: limits.maxBetCents - 1 } })).toMatchObject({ ok: true });
    expect(store.getSnapshot().bigwheel?.totalBetCents).toBe(limits.maxBetCents);
    expect(store.getSnapshot().bigwheel?.legalActions).toContain('spin');
  });
  it('keeps one sampled candidate across failed start and payout saves and duplicate commands', async () => {
    vi.useFakeTimers(); const { store, act, command, save, nextSegmentIndex } = harness();
    await act({ type: 'selectGame', gameId: 'bigwheel' });
    const spin = command({ type: 'bigwheel', action: { type: 'spin' } });
    save.mockRejectedValueOnce(new Error('disk'));
    expect(await store.dispatch(spin)).toMatchObject({ error: 'SAVE_FAILED' });
    const candidate = save.mock.calls.at(-1)![0];
    expect(candidate.wallet.balanceCents).toBe(9900);
    expect(store.getSnapshot().balanceCents).toBe(10000);
    expect(await act({ type: 'goToMenu' })).toMatchObject({ error: 'SAVE_FAILED' });
    await act({ type: 'retrySave' });
    expect(save.mock.calls.at(-1)![0]).toEqual(candidate);
    expect(nextSegmentIndex).toHaveBeenCalledTimes(1);
    expect(await store.dispatch(spin)).toMatchObject({ ok: true });
    expect(store.getSnapshot().bigwheel?.lastResult).toBeNull();
    for (const action of [{ type: 'goToMenu' }, { type: 'resetAll' }, { type: 'selectLevel', level: 1 }, { type: 'selectGame', gameId: 'baccarat' }, { type: 'bigwheel', action: { type: 'setBet', target: 'gold', amountCents: 1 } }] as AppAction[]) expect(await act(action)).toMatchObject({ ok: false });
    save.mockRejectedValueOnce(new Error('disk')); await vi.runAllTimersAsync();
    expect(store.getSnapshot()).toMatchObject({ balanceCents: 9900, saveError: true, activeRoundGameId: 'bigwheel' });
    const payout = save.mock.calls.at(-1)![0]; await act({ type: 'retrySave' });
    expect(save.mock.calls.at(-1)![0]).toEqual(payout);
    expect(store.getSnapshot()).toMatchObject({ balanceCents: 10100, activeRoundGameId: null, table: { bestBankrollCents: 10100 } });
    expect(store.getSnapshot().bigwheel?.recentResults).toHaveLength(1);
    await store.dispatch(spin); expect(store.getSnapshot().balanceCents).toBe(10100);
  });
  it('restores a spinning round without calling randomness and rejects a mismatched lock', async () => {
    vi.useFakeTimers(); const first = harness(newAppSession(), BIG_WHEEL_SEGMENTS.indexOf('mega'));
    await first.act({ type: 'selectGame', gameId: 'bigwheel' });
    await first.act({ type: 'bigwheel', action: { type: 'setBet', target: 'silver', amountCents: 0 } });
    await first.act({ type: 'bigwheel', action: { type: 'setBet', target: 'mega', amountCents: 100 } });
    await first.act({ type: 'bigwheel', action: { type: 'spin' } });
    const checkpoint = first.save.mock.calls.at(-1)![0];
    expect(() => parseAppSession({ ...checkpoint, activeRoundGameId: null })).toThrow();
    vi.clearAllTimers(); const restored = harness(structuredClone(checkpoint)); restored.store.resumeAutomatic();
    await vi.runAllTimersAsync();
    expect(restored.nextSegmentIndex).not.toHaveBeenCalled();
    expect(restored.store.getSnapshot()).toMatchObject({ balanceCents: 14000, bigwheel: { lastResult: { outcome: 'mega', returnCents: 4100 } } });
    expect(restored.store.getSnapshot().bigwheel?.recentResults).toHaveLength(1);
  });
  it('normalizes unaffordable next-round drafts and retains exact old payout evidence', async () => {
    vi.useFakeTimers(); const state = newAppSession(); state.wallet.balanceCents = 5000;
    const { act, store, save } = harness(state, BIG_WHEEL_SEGMENTS.indexOf('gold'));
    await act({ type: 'selectGame', gameId: 'bigwheel' }); await act({ type: 'bigwheel', action: { type: 'setBet', target: 'silver', amountCents: 4900 } });
    await act({ type: 'bigwheel', action: { type: 'spin' } }); await vi.runAllTimersAsync();
    const result = save.mock.calls.at(-1)![0].games.bigwheel!.lastResult;
    expect(store.getSnapshot().balanceCents).toBe(100);
    await act({ type: 'bigwheel', action: { type: 'nextRound' } });
    expect(store.getSnapshot().bigwheel?.totalBetCents).toBe(100);
    expect(save.mock.calls.at(-1)![0].games.bigwheel!.lastResult).toEqual(result);
  });
  it('exposes only registered public actions', () => {
    expect(appActionSchema.safeParse({ type: 'bigwheel', action: { type: 'advanceBigWheel' } }).success).toBe(false);
    expect(appActionSchema.safeParse({ type: 'selectGame', gameId: 'bigwheel' }).success).toBe(true);
  });
});
