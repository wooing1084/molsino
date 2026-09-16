import { describe, expect, it } from 'vitest';
import { createSession, getPhase, legalActions, transition } from '../../src/core/engine';
import { card, environment, fixtureShoe } from './helpers';

describe('double down and split hands', () => {
  it('charges an exact double, draws one card, and ends the hand', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('5'), card('6', 'C'), card('6', 'D'), card('9', 'H'), card('9', 'S', '2'), card('5', 'D', '2'),
    ]);
    const dealt = transition(createSession(shoe), { type: 'deal' }, env).nextState;
    const handId = dealt.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');
    const doubled = transition(dealt, { type: 'doubleDown', handId }, env).nextState;

    expect(doubled.balanceCents).toBe(9_800);
    expect(doubled.round?.playerHands[0]).toMatchObject({ wagerCents: 200, doubled: true, status: 'standing' });
    expect(doubled.round?.playerHands[0]?.cards).toHaveLength(3);
    expect(getPhase(doubled)).toBe('dealerTurn');

    const result = transition(doubled, { type: 'advanceDealer' }, env).nextState;
    expect(result.balanceCents).toBe(10_000);
    expect(result.lastResult?.entries[0]).toMatchObject({ outcome: 'push', wagerCents: 200, returnedCents: 200 });
  });

  it('plays split hands left-first, supports DAS, and settles mixed outcomes', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('8'), card('6', 'C'), card('8', 'D'), card('9', 'H'),
      card('3', 'S', '2'), card('10', 'D', '2'), card('10', 'C', '3'), card('4', 'D', '3'),
    ]);
    const dealt = transition(createSession(shoe), { type: 'deal' }, env).nextState;
    const leftId = dealt.round?.playerHands[0]?.handId;
    if (!leftId) throw new Error('missing test hand');
    const splitState = transition(dealt, { type: 'split', handId: leftId }, env).nextState;

    expect(splitState.round?.playerHands).toHaveLength(2);
    expect(splitState.round?.activeHandIndex).toBe(0);
    expect(splitState.round?.playerHands[0]?.cards.map(({ rank }) => rank)).toEqual(['8', '3']);
    expect(splitState.round?.playerHands[1]?.cards.map(({ rank }) => rank)).toEqual(['8']);
    expect(legalActions(splitState)).toContain('doubleDown');

    const afterDouble = transition(splitState, { type: 'doubleDown', handId: leftId }, env).nextState;
    const right = afterDouble.round?.playerHands[1];
    if (!right) throw new Error('missing right hand');
    expect(afterDouble.round?.activeHandIndex).toBe(1);
    expect(right.cards.map(({ rank }) => rank)).toEqual(['8', '10']);
    expect(() => transition(afterDouble, { type: 'hit', handId: leftId }, env)).toThrow('not active');

    const dealerTurn = transition(afterDouble, { type: 'stand', handId: right.handId }, env).nextState;
    const settled = transition(dealerTurn, { type: 'advanceDealer' }, env).nextState;
    expect(settled.balanceCents).toBe(10_100);
    expect(settled.lastResult).toMatchObject({ netCents: 100 });
    expect(settled.lastResult?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ componentId: leftId, outcome: 'win', wagerCents: 200, returnedCents: 400 }),
      expect.objectContaining({ componentId: right.handId, outcome: 'loss', wagerCents: 100, returnedCents: 0 }),
    ]));
  });

  it('accepts equal ten-value cards and treats split 21 as an ordinary win', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('10'), card('10', 'C'), card('Q', 'D'), card('8', 'H'), card('A', 'S', '2'), card('9', 'D', '2'),
    ]);
    const dealt = transition(createSession(shoe), { type: 'deal' }, env).nextState;
    expect(legalActions(dealt)).toContain('split');
    const leftId = dealt.round?.playerHands[0]?.handId;
    if (!leftId) throw new Error('missing test hand');
    const splitState = transition(dealt, { type: 'split', handId: leftId }, env).nextState;
    const right = splitState.round?.playerHands[1];
    if (!right) throw new Error('missing right hand');
    expect(splitState.round?.playerHands[0]).toMatchObject({ status: 'standing', fromSplit: true });
    const settled = transition(splitState, { type: 'stand', handId: right.handId }, env).nextState;

    const leftEntry = settled.lastResult?.entries.find(({ componentId }) => componentId === leftId);
    expect(leftEntry).toMatchObject({ outcome: 'win', wagerCents: 100, returnedCents: 200 });
  });

  it('splits aces once, deals exactly one card to each, and disables further player actions', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('A'), card('7', 'C'), card('A', 'D'), card('9', 'H'),
      card('9', 'S', '2'), card('6', 'D', '2'), card('5', 'C', '2'),
    ]);
    const dealt = transition(createSession(shoe), { type: 'deal' }, env).nextState;
    const handId = dealt.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');
    const state = transition(dealt, { type: 'split', handId }, env).nextState;

    expect(state.round?.playerHands.map((hand) => hand.cards.length)).toEqual([2, 2]);
    expect(state.round?.playerHands.every((hand) => hand.status === 'standing' && hand.splitAces)).toBe(true);
    expect(state.shoe.nextIndex).toBe(6);
    expect(getPhase(state)).toBe('dealerTurn');
    expect(legalActions(state)).toEqual(['resetSession']);
  });

  it('caps resplits at four hands', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('8', 'S', '1'), card('10', 'C'), card('8', 'D', '1'), card('7', 'H'),
      card('8', 'C', '2'), card('8', 'H', '3'), card('8', 'S', '4'),
    ]);
    let state = transition(createSession(shoe), { type: 'deal' }, env).nextState;
    const handId = state.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');
    state = transition(state, { type: 'split', handId }, env).nextState;
    state = transition(state, { type: 'split', handId }, env).nextState;
    state = transition(state, { type: 'split', handId }, env).nextState;

    expect(state.round?.playerHands).toHaveLength(4);
    expect(state.round?.playerHands[0]?.cards.map(({ rank }) => rank)).toEqual(['8', '8']);
    expect(legalActions(state)).not.toContain('split');
    expect(() => transition(state, { type: 'split', handId }, env)).toThrow('not legal');
  });

  it('rejects double and split when the exact additional wager is unavailable', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('8'), card('6', 'C'), card('8', 'D'), card('9', 'H'),
    ]);
    const dealt = transition(createSession(shoe, { balanceCents: 100 }), { type: 'deal' }, env).nextState;
    const handId = dealt.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');

    expect(legalActions(dealt)).not.toContain('doubleDown');
    expect(legalActions(dealt)).not.toContain('split');
    expect(() => transition(dealt, { type: 'doubleDown', handId }, env)).toThrow('not legal');
    expect(() => transition(dealt, { type: 'split', handId }, env)).toThrow('not legal');
  });
});
