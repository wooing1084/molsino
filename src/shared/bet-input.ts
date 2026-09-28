import type { BetLimits } from './table-levels';
export type BetInputError = 'required' | 'format' | 'tooLarge' | 'belowMinimum' | 'aboveMaximum' | 'balance';
export type ParsedBet = { ok: true; cents: number } | { ok: false; error: BetInputError };

/** Parse a dollar string without floating-point money arithmetic. */
export function parseBetInput(value: string, balanceCents: number, limits: BetLimits = { minBetCents: 100, maxBetCents: Number.MAX_SAFE_INTEGER }): ParsedBet {
  const amount = value.trim();
  if (!amount) return { ok: false, error: 'required' };
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    return { ok: false, error: 'format' };
  }
  const [dollars, fraction = ''] = amount.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return { ok: false, error: 'tooLarge' };
  if (cents < limits.minBetCents) return { ok: false, error: 'belowMinimum' };
  if (cents > limits.maxBetCents) return { ok: false, error: 'aboveMaximum' };
  if (cents > balanceCents) {
    return { ok: false, error: 'balance' };
  }
  return { ok: true, cents };
}
