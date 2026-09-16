import { describe, expect, it } from 'vitest';
import { createSession, getPhase, legalActions, transition } from '../../src/core/engine';
import { card, environment, fixtureShoe } from './helpers';

describe('insurance, even money, and surrender', () => {
  it('does not peek before insurance and pays insurance independently exactly once', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('9'), card('A', 'C'), card('7', 'D'), card('K', 'H'),
    ]);
    const offered = transition(createSession(shoe), { type: 'deal' }, env).nextState;

    expect(getPhase(offered)).toBe('insuranceDecision');
    expect(offered.round?.dealerHand.holeRevealed).toBe(false);
    expect(offered.ledger).toHaveLength(0);
    expect(offered.round?.insurance?.maxWagerCents).toBe(50);
    expect(legalActions(offered)).toEqual(['chooseInsurance', 'resetSession']);

    const settled = transition(offered, { type: 'chooseInsurance', amountCents: 50 }, env).nextState;
    expect(settled.balanceCents).toBe(10_000);
    expect(settled.lastResult?.netCents).toBe(0);
    expect(settled.lastResult?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ componentId: 'insurance', outcome: 'insurance-win', wagerCents: 50, returnedCents: 150 }),
      expect.objectContaining({ outcome: 'loss', wagerCents: 100, returnedCents: 0 }),
    ]));
    expect(settled.ledger.filter(({ componentId }) => componentId === 'insurance')).toHaveLength(1);
  });

  it('records a failed insurance wager and continues the player hand', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('9'), card('A', 'C'), card('7', 'D'), card('6', 'H'),
    ]);
    const offered = transition(createSession(shoe), { type: 'deal' }, env).nextState;
    const playing = transition(offered, { type: 'chooseInsurance', amountCents: 50 }, env).nextState;

    expect(getPhase(playing)).toBe('playerTurn');
    expect(playing.balanceCents).toBe(9_850);
    expect(playing.ledger).toMatchObject([
      { componentId: 'insurance', outcome: 'insurance-loss', returnedCents: 0 },
    ]);
    const handId = playing.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');
    const settled = transition(playing, { type: 'stand', handId }, env).nextState;
    expect(settled.lastResult?.netCents).toBe(-150);
    expect(settled.ledger.filter(({ componentId }) => componentId === 'insurance')).toHaveLength(1);
  });

  it('validates insurance increments, maximum, and available balance', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('9'), card('A', 'C'), card('7', 'D'), card('6', 'H'),
    ]);
    const offered = transition(createSession(shoe), { type: 'deal' }, env).nextState;

    expect(() => transition(offered, { type: 'chooseInsurance', amountCents: 25 }, env)).toThrow('$0.50');
    expect(() => transition(offered, { type: 'chooseInsurance', amountCents: 100 }, env)).toThrow('exceeds');

    const declined = transition(offered, { type: 'chooseInsurance', amountCents: 0 }, env).nextState;
    expect(getPhase(declined)).toBe('playerTurn');
    expect(declined.ledger).toHaveLength(0);
  });

  it('offers even money instead of insurance for a natural blackjack', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('A'), card('A', 'C'), card('K', 'D'), card('9', 'H'),
    ]);
    const offered = transition(createSession(shoe), { type: 'deal' }, env).nextState;

    expect(legalActions(offered)).toEqual(['acceptEvenMoney', 'keepBlackjack', 'resetSession']);
    expect(() => transition(offered, { type: 'chooseInsurance', amountCents: 50 }, env)).toThrow();

    const accepted = transition(offered, { type: 'acceptEvenMoney' }, env).nextState;
    expect(accepted.balanceCents).toBe(10_100);
    expect(accepted.lastResult).toMatchObject({ netCents: 100 });
    expect(accepted.lastResult?.entries[0]?.outcome).toBe('even-money');
    expect(accepted.round?.insurance?.decision).toBe('evenMoney');
  });

  it('keeps blackjack for a 3:2 win or a push after the dealer peek', () => {
    const env = environment();
    const missShoe = fixtureShoe([
      card('A'), card('A', 'C'), card('K', 'D'), card('9', 'H'),
    ]);
    const missOffer = transition(createSession(missShoe), { type: 'deal' }, env).nextState;
    const win = transition(missOffer, { type: 'keepBlackjack' }, env).nextState;
    expect(win.balanceCents).toBe(10_150);
    expect(win.lastResult?.entries[0]?.outcome).toBe('blackjack');
    expect(win.round?.insurance?.decision).toBe('keptBlackjack');

    const hitShoe = fixtureShoe([
      card('A', 'S', '2'), card('A', 'C', '2'), card('K', 'D', '2'), card('Q', 'H', '2'),
    ]);
    const hitOffer = transition(createSession(hitShoe), { type: 'deal' }, environment()).nextState;
    const push = transition(hitOffer, { type: 'keepBlackjack' }, environment()).nextState;
    expect(push.balanceCents).toBe(10_000);
    expect(push.lastResult?.entries[0]?.outcome).toBe('push');
  });

  it('allows late surrender only on the original untouched two-card hand', () => {
    const env = environment();
    const shoe = fixtureShoe([
      card('10'), card('9', 'C'), card('6', 'D'), card('8', 'H'),
    ]);
    const dealt = transition(createSession(shoe), { type: 'deal' }, env).nextState;
    const handId = dealt.round?.playerHands[0]?.handId;
    if (!handId) throw new Error('missing test hand');

    const settled = transition(dealt, { type: 'surrender', handId }, env).nextState;
    expect(settled.balanceCents).toBe(9_950);
    expect(settled.lastResult?.entries[0]).toMatchObject({ outcome: 'surrender', returnedCents: 50 });

    const hitShoe = fixtureShoe([
      card('5', 'S', '2'), card('9', 'C', '2'), card('6', 'D', '2'), card('8', 'H', '2'), card('2', 'S', '3'),
    ]);
    const hitDeal = transition(createSession(hitShoe), { type: 'deal' }, environment()).nextState;
    const hitHandId = hitDeal.round?.playerHands[0]?.handId;
    if (!hitHandId) throw new Error('missing test hand');
    const afterHit = transition(hitDeal, { type: 'hit', handId: hitHandId }, environment()).nextState;
    expect(() => transition(afterHit, { type: 'surrender', handId: hitHandId }, environment())).toThrow('Surrender');
  });
});
