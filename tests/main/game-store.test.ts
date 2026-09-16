import { describe, expect, it, vi } from 'vitest';
import { createSession } from '../../src/core/engine';
import { GameStore } from '../../src/main/game/game-store';
import type { UserCommand } from '../../src/shared/contracts';
import { card, environment, fixtureShoe } from '../core/helpers';

const command = (commandId: string, expectedRevision: number, action: UserCommand['action']): UserCommand => ({
  commandId,
  expectedRevision,
  action,
});

describe('GameStore', () => {
  it('owns the state, publishes revisions, and returns cached duplicate results once', async () => {
    const shoe = fixtureShoe([
      card('A'), card('9', 'C'), card('K', 'D'), card('7', 'H'),
    ]);
    const store = new GameStore(createSession(shoe), environment(), 'test');
    const listener = vi.fn();
    store.subscribe(listener);
    const deal = command('11111111-1111-4111-8111-111111111111', 0, { type: 'deal' });

    const first = await store.dispatch(deal);
    const duplicate = await store.dispatch(deal);

    expect(first).toMatchObject({ ok: true, state: { revision: 1, phase: 'result', balanceCents: 10_150 } });
    expect(duplicate).toEqual(first);
    expect(store.getSnapshot().revision).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('rejects stale revisions without changing state', async () => {
    const store = new GameStore(createSession(fixtureShoe([])), environment(), 'test');
    const first = await store.dispatch(command(
      '22222222-2222-4222-8222-222222222222',
      0,
      { type: 'setBet', amountCents: 200 },
    ));
    const stale = await store.dispatch(command(
      '33333333-3333-4333-8333-333333333333',
      0,
      { type: 'setBet', amountCents: 300 },
    ));

    expect(first).toMatchObject({ ok: true, state: { revision: 1, pendingBetCents: 200 } });
    expect(stale).toMatchObject({ ok: false, error: 'STALE_STATE', state: { revision: 1, pendingBetCents: 200 } });
  });

  it('keeps the hole card and shoe private and advances the dealer internally', async () => {
    const shoe = fixtureShoe([
      card('10'), card('9', 'C'), card('7', 'D'), card('7', 'H'), card('5', 'S', '2'),
    ]);
    const store = new GameStore(createSession(shoe), environment(), 'test');
    const dealt = await store.dispatch(command(
      '44444444-4444-4444-8444-444444444444',
      0,
      { type: 'deal' },
    ));
    if (!dealt.ok) throw new Error(dealt.message);

    expect(dealt.state).not.toHaveProperty('shoe');
    expect(dealt.state.dealerHand).toMatchObject({ cards: [{ rank: '9' }], hiddenCardCount: 1, total: 9 });
    const handId = dealt.state.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');
    const settled = await store.dispatch(command(
      '55555555-5555-4555-8555-555555555555',
      dealt.state.revision,
      { type: 'stand', handId },
    ));

    expect(settled).toMatchObject({ ok: true, state: { revision: 2, phase: 'dealerTurn' } });
    await vi.waitFor(() => {
      expect(store.getSnapshot()).toMatchObject({
        revision: 3, phase: 'result', dealerHand: { hiddenCardCount: 0, total: 21 },
      });
    });
  });
});
