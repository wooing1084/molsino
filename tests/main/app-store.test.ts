import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AppStore } from '../../src/main/game/app-store';
import { newAppSession, parseAppSession } from '../../src/main/persistence/app-session-repository';
import type { AppAction } from '../../src/shared/app-contracts';
import { environment } from '../core/helpers';

function harness(save = vi.fn(async () => {})) {
  const store = new AppStore(newAppSession(), environment(), 'test', { save });
  const command = (action: AppAction) => { const s = store.getSnapshot(); return { sessionId: s.sessionId, commandId: randomUUID(), expectedRevision: s.revision, action }; };
  return { store, save, command };
}
describe('AppStore single wallet and writer', () => {
  it('serializes navigation, refuses game commands on menu, and rejects commands for another game', async () => {
    const { store, command } = harness();
    expect(await store.dispatch(command({ type: 'blackjack', action: { type: 'deal' } }))).toMatchObject({ ok: false });
    expect(await store.dispatch(command({ type: 'baccarat', action: { type: 'deal' } }))).toMatchObject({ ok: false });
    const first = command({ type: 'selectGame', gameId: 'blackjack' });
    const stale = command({ type: 'goToMenu' });
    const results = await Promise.all([store.dispatch(first), store.dispatch(stale)]);
    expect(results[0].ok).toBe(true); expect(results[1]).toMatchObject({ ok: false, error: 'BUSY' });
    expect(store.getSnapshot()).toMatchObject({ screen: 'blackjack', balanceCents: 10000, revision: 1 });
    expect(await store.dispatch(stale)).toMatchObject({ ok: false, error: 'STALE_STATE' });
  });
  it('keeps one candidate on failed reset and rejects all old commands except the committed reset itself', async () => {
    const { store, save, command } = harness();
    const old = command({ type: 'goToMenu' });
    await store.dispatch(old);
    const reset = command({ type: 'resetAll' });
    save.mockRejectedValueOnce(new Error('disk'));
    const views: { revision: number; viewSequence: number; saveError: boolean }[] = [];
    store.subscribe(s => views.push(s));
    expect(await store.dispatch(reset)).toMatchObject({ ok: false, state: { revision: 1, sessionId: reset.sessionId, saveError: true } });
    const candidate = save.mock.calls.at(-1);
    expect(await store.dispatch(command({ type: 'selectGame', gameId: 'blackjack' }))).toMatchObject({ ok: false, error: 'SAVE_FAILED' });
    expect(await store.dispatch(command({ type: 'retrySave' }))).toMatchObject({ ok: true, state: { revision: 2, saveError: false } });
    expect(save.mock.calls.at(-1)).toEqual(candidate);
    expect(await store.dispatch(reset)).toMatchObject({ ok: true, state: { revision: 2 } });
    expect(await store.dispatch(old)).toMatchObject({ ok: false, error: 'STALE_STATE' });
    expect(views.map(s => s.viewSequence)).toEqual([...views.map(s => s.viewSequence)].sort((a, b) => a - b));
    expect(new Set(views.map(s => s.viewSequence)).size).toBe(views.length);
  });
  it('rejects duplicated wallet fields, game locks and unavailable saved games', () => {
    const s = newAppSession();
    expect(() => parseAppSession({ ...s, activeRoundGameId: 'blackjack' })).toThrow();
    expect(() => parseAppSession({ ...s, screen: 'baccarat' })).toThrow();
    expect(() => parseAppSession({ ...s, wallet: { balanceCents: -1 } })).toThrow();
  });
});
