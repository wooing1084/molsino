import { describe, expect, it } from 'vitest';
import { createSession, transition, validateState } from '../../src/core/engine';
import {
  applyLedgerEntry,
  blackjackReturn,
  calculateRoundNet,
  createLedgerEntry,
  insuranceWinReturn,
  surrenderReturn,
} from '../../src/core/settlement';
import { card, environment, fixtureShoe } from './helpers';

describe('settlement ledger and money integrity', () => {
  it('applies each (roundId, componentId) credit at most once', () => {
    const entry = createLedgerEntry('round-1', 'insurance', 'insurance-win', 50, 150);
    const first = applyLedgerEntry(9_850, [], entry);
    const duplicate = applyLedgerEntry(first.balanceCents, first.ledger, entry);

    expect(first).toMatchObject({ balanceCents: 10_000, applied: true });
    expect(duplicate).toMatchObject({ balanceCents: 10_000, applied: false });
    expect(duplicate.ledger).toHaveLength(1);
    expect(calculateRoundNet(duplicate.ledger, 'round-1')).toBe(100);
  });

  it('rounds half-cent returns up while keeping whole-cent payouts unchanged', () => {
    expect(blackjackReturn(100)).toBe(250);
    expect(blackjackReturn(101)).toBe(253);
    expect(insuranceWinReturn(50)).toBe(150);
    expect(surrenderReturn(100)).toBe(50);
    expect(surrenderReturn(101)).toBe(51);
    expect(() => blackjackReturn(Number.MAX_SAFE_INTEGER)).toThrow('safe integer');
  });

  it('rejects round ID reuse before an old ledger can suppress a new payout', () => {
    const firstEnvironment = environment();
    const shoe = fixtureShoe([
      card('A'), card('9', 'C'), card('K', 'D'), card('7', 'H'),
    ]);
    const result = transition(createSession(shoe), { type: 'deal' }, firstEnvironment).nextState;
    const betting = transition(result, { type: 'nextRound' }, firstEnvironment).nextState;

    expect(() => transition(betting, { type: 'deal' }, environment())).toThrow('must not be reused');
  });

  it('rejects invalid bets, phases, inactive hand IDs, and unexpected exhaustion', () => {
    const env = environment();
    const state = createSession(fixtureShoe([]));
    expect(transition(state, { type: 'setBet', amountCents: 150 }, env).nextState.pendingBetCents).toBe(150);
    expect(() => transition(state, { type: 'setBet', amountCents: 99 }, env)).toThrow('at least $1');
    expect(() => transition(state, { type: 'setBet', amountCents: 50_100 }, env)).toThrow('Insufficient balance');
    expect(() => transition(state, { type: 'hit', handId: 'missing' }, env)).toThrow('playerTurn');

    const shoe = fixtureShoe([
      card('5'), card('10', 'C'), card('6', 'D'), card('6', 'H'), card('2', 'S', '2'),
    ]);
    const dealt = transition(createSession(shoe), { type: 'deal' }, env).nextState;
    const handId = dealt.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');
    expect(() => transition(dealt, { type: 'hit', handId: 'old-hand' }, env)).toThrow('not active');

    const exhausted = { ...dealt, shoe: { ...dealt.shoe, nextIndex: dealt.shoe.cards.length } };
    expect(() => transition(exhausted, { type: 'hit', handId }, env)).toThrow('Unexpected shoe exhaustion');

    const reservedIdEnvironment = {
      createShoe: () => fixtureShoe([]),
      nextId: (kind: 'round' | 'hand') => kind === 'round' ? 'reserved-round' : 'insurance',
    };
    expect(() => transition(createSession(fixtureShoe([])), { type: 'deal' }, reservedIdEnvironment)).toThrow('reserved');
  });

  it('detects malformed persisted state before applying a transition', () => {
    const state = createSession(fixtureShoe([]));
    expect(() => validateState({ ...state, balanceCents: -1 })).toThrow('non-negative');
    expect(() => validateState({ ...state, shoe: { ...state.shoe, nextIndex: 999 } })).toThrow('index');
    expect(() => validateState({ ...state, ruleSetId: 'casino-6d-s17-3to2-v1' })).not.toThrow();
    const badLedger = createLedgerEntry('round-x', 'hand-x', 'win', 100, 200);
    expect(() => validateState({ ...state, ledger: [{ ...badLedger, netCents: 999 }] })).toThrow('net');
    expect(() => createSession({ cards: state.shoe.cards.slice(0, 4), nextIndex: 0 })).toThrow('Shoe');
    expect(() => createSession(fixtureShoe([], 1))).toThrow('fresh');

    const malformedCards = [...state.shoe.cards];
    const first = malformedCards[0];
    if (!first) throw new Error('missing fixture card');
    malformedCards[0] = { ...first, rank: first.rank === 'A' ? 'K' : 'A' };
    expect(() => createSession({ cards: malformedCards, nextIndex: 0 })).toThrow('six complete decks');

    const usedShoe = fixtureShoe([], 235);
    const nonFreshReplacement = fixtureShoe([], 1);
    const cutState = { ...createSession(fixtureShoe([])), shoe: usedShoe };
    expect(() => transition(
      cutState,
      { type: 'deal' },
      environment(nonFreshReplacement),
    )).toThrow('fresh');
  });
});
