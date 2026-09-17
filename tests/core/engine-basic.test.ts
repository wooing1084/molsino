import { describe, expect, it } from 'vitest';
import { createSession, getPhase, legalActions, transition } from '../../src/core/engine';
import { dealerShouldHit } from '../../src/core/rules';
import { card, environment, finishDealer, fixtureShoe } from './helpers';

describe('basic blackjack rounds', () => {
  it('starts with $100 and pays a natural blackjack at 3:2', () => {
    const shoe = fixtureShoe([
      card('A'), card('9', 'C'), card('K', 'D'), card('7', 'H'),
    ]);
    const result = transition(createSession(shoe), { type: 'deal' }, environment());

    expect(getPhase(result.nextState)).toBe('result');
    expect(result.nextState.balanceCents).toBe(10_150);
    expect(result.nextState.lastResult).toMatchObject({ netCents: 150 });
    expect(result.nextState.lastResult?.entries).toMatchObject([
      { outcome: 'blackjack', wagerCents: 100, returnedCents: 250 },
    ]);
  });

  it('pushes when both player and dealer have natural blackjack', () => {
    const shoe = fixtureShoe([
      card('A', 'S'), card('K', 'C'), card('Q', 'D'), card('A', 'H'),
    ]);
    const state = transition(createSession(shoe), { type: 'deal' }, environment()).nextState;

    expect(state.balanceCents).toBe(10_000);
    expect(state.lastResult?.entries[0]?.outcome).toBe('push');
  });

  it('settles an immediate dealer blackjack without offering a player action', () => {
    const shoe = fixtureShoe([
      card('9'), card('K', 'C'), card('7', 'D'), card('A', 'H'),
    ]);
    const state = transition(createSession(shoe), { type: 'deal' }, environment()).nextState;

    expect(getPhase(state)).toBe('result');
    expect(state.balanceCents).toBe(9_900);
    expect(state.round?.dealerHand.holeRevealed).toBe(true);
    expect(state.lastResult?.entries[0]?.outcome).toBe('loss');
  });

  it('hits, busts, and skips dealer draws when no live hand remains', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('10'), card('6', 'C'), card('9', 'D'), card('10', 'H'), card('5', 'S', '2'),
    ]);
    const dealt = transition(createSession(shoe), { type: 'deal' }, env).nextState;
    const handId = dealt.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');
    const state = transition(dealt, { type: 'hit', handId }, env).nextState;

    expect(getPhase(state)).toBe('result');
    expect(state.shoe.nextIndex).toBe(5);
    expect(state.lastResult?.entries[0]?.outcome).toBe('bust');
    expect(state.balanceCents).toBe(9_900);
  });

  it('advances the dealer one card per internal action and stands on soft 17', () => {
    expect(dealerShouldHit([card('A'), card('6', 'C')])).toBe(false);
    expect(dealerShouldHit([card('A'), card('5', 'C')])).toBe(true);

    const env = environment();
    const shoe = fixtureShoe([
      card('10'), card('9', 'C'), card('8', 'D'), card('6', 'H'), card('2', 'S', '2'), card('10', 'D', '2'),
    ]);
    const dealt = transition(createSession(shoe), { type: 'deal' }, env).nextState;
    const handId = dealt.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');
    const dealerTurn = transition(dealt, { type: 'stand', handId }, env).nextState;

    expect(getPhase(dealerTurn)).toBe('dealerTurn');
    const afterOne = transition(dealerTurn, { type: 'advanceDealer' }, env).nextState;
    expect(getPhase(afterOne)).toBe('result');
    expect(afterOne.shoe.nextIndex).toBe(5);
    expect(afterOne.lastResult?.entries[0]?.outcome).toBe('win');
  });

  it('remembers and clamps the next bet without automatically dealing', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('10'), card('K', 'C'), card('Q', 'D'), card('Q', 'H'),
    ]);
    const initial = createSession(shoe, { balanceCents: 500, pendingBetCents: 500 });
    const dealt = transition(initial, { type: 'deal' }, env).nextState;
    const handId = dealt.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');
    const result = transition(dealt, { type: 'stand', handId }, env).nextState;
    const next = transition(result, { type: 'nextRound' }, env).nextState;

    expect(getPhase(next)).toBe('betting');
    expect(next.pendingBetCents).toBe(500);
    expect(legalActions(next)).toContain('deal');

    const brokeShoe = fixtureShoe([
      card('9', 'S', '3'), card('K', 'C', '3'), card('7', 'D', '3'), card('Q', 'H', '3'),
    ]);
    const brokeDeal = transition(createSession(brokeShoe, { balanceCents: 100 }), { type: 'deal' }, environment()).nextState;
    const brokeHandId = brokeDeal.round?.playerHands[0]?.handId;
    if (!brokeHandId) throw new Error('missing test hand');
    const brokeResult = transition(brokeDeal, { type: 'stand', handId: brokeHandId }, environment()).nextState;
    expect(brokeResult.balanceCents).toBe(0);
    expect(legalActions(brokeResult)).not.toContain('nextRound');
    expect(() => transition(brokeResult, { type: 'nextRound' }, environment())).toThrow('Game over');
  });

  it('keeps $1 playable and ends the game below $1 after settlement', () => {
    const shoe = fixtureShoe([
      card('9'), card('10', 'C'), card('7', 'D'), card('9', 'H'),
    ]);
    for (const remaining of [100, 99]) {
      const env = environment();
      const dealt = transition(createSession(shoe, { balanceCents: remaining + 100 }), { type: 'deal' }, env).nextState;
      const handId = dealt.round?.playerHands[0]?.handId;
      if (!handId) throw new Error('missing test hand');
      const result = transition(dealt, { type: 'stand', handId }, env).nextState;
      expect(result.balanceCents).toBe(remaining);
      expect(legalActions(result).includes('nextRound')).toBe(remaining === 100);
      if (remaining === 100) {
        const next = transition(result, { type: 'nextRound' }, env).nextState;
        expect(legalActions(next)).toContain('deal');
      } else {
        expect(() => transition(result, { type: 'nextRound' }, env)).toThrow('Game over');
      }
    }
  });

  it('uses a fresh shoe only at a round boundary', () => {
    const oldShoe = fixtureShoe([], 235);
    const replacement = fixtureShoe([
      card('A'), card('9', 'C'), card('K', 'D'), card('7', 'H'),
    ]);
    const env = environment(replacement);
    const oldSession = { ...createSession(fixtureShoe([])), shoe: oldShoe };
    const state = transition(oldSession, { type: 'deal' }, env).nextState;

    expect(state.shoe.cards).toBe(replacement.cards);
    expect(state.shoe.nextIndex).toBe(4);
    expect(state.lastResult?.entries[0]?.outcome).toBe('blackjack');

    const tinyMidRound = fixtureShoe([
      card('10', 'S', 'x'), card('6', 'C', 'x'), card('5', 'D', 'x'), card('9', 'H', 'x'), card('2', 'S', 'y'),
    ], 233);
    const midRoundSession = { ...createSession(fixtureShoe([])), shoe: tinyMidRound };
    const started = transition(midRoundSession, { type: 'deal' }, env).nextState;
    const handId = started.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');
    const hit = transition(started, { type: 'hit', handId }, env).nextState;
    expect(hit.shoe.cards).toBe(tinyMidRound.cards);
    expect(hit.shoe.nextIndex).toBe(238);
  });

  it('runs a complete ordinary round through the dealer helper', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('10'), card('8', 'C'), card('9', 'D'), card('7', 'H'), card('10', 'C', '2'),
    ]);
    const dealt = transition(createSession(shoe), { type: 'deal' }, env).nextState;
    const handId = dealt.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');
    const state = finishDealer(transition(dealt, { type: 'stand', handId }, env).nextState, env);
    expect(state.lastResult?.netCents).toBe(100);
  });
});
