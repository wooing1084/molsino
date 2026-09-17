import { describe, expect, it } from 'vitest';
import { parseBetInput } from '../../src/shared/bet-input';

describe('direct bet text parsing', () => {
  it.each([
    ['1', 100], ['1.5', 150], ['1.01', 101], ['1.25', 125], ['500.00', 50_000],
  ] as const)('parses %s to %i cents', (text, cents) => {
    expect(parseBetInput(text, 50_000)).toEqual({ ok: true, cents });
  });

  it.each(['', '0.99', '1.001', '1e2', '-1', '1,25', '500.01', 'Infinity'])('rejects %s', text => {
    expect(parseBetInput(text, 50_000).ok).toBe(false);
  });

  it('uses the exact cent balance as the upper bound', () => {
    expect(parseBetInput('1.25', 125)).toEqual({ ok: true, cents: 125 });
    expect(parseBetInput('1.26', 125).ok).toBe(false);
    expect(parseBetInput('600.01', 60_001)).toEqual({ ok: true, cents: 60_001 });
    expect(parseBetInput('600.02', 60_001).ok).toBe(false);
  });
});
