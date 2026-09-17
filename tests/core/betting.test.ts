import { describe, expect, it } from 'vitest';
import { validateBet } from '../../src/core/betting';
describe('cent-precision bets', () => {
  it('accepts table limits within available balance', () => {
    expect(validateBet(100, 100)).toBe(100);
    expect(validateBet(101, 125)).toBe(101);
    expect(validateBet(125, 125)).toBe(125);
    expect(validateBet(50_000, 60_000)).toBe(50_000);
  });
  it.each([0, -100, 99, 50_001, 101.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])('rejects invalid wager %s', amount => {
    expect(() => validateBet(amount, 100_000)).toThrow();
  });
  it('does not spend fractional remaining balance', () => {
    expect(() => validateBet(200, 150)).toThrow('Insufficient balance');
    expect(validateBet(100, 150)).toBe(100);
  });
});
