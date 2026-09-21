import type { BetLimits } from './table-levels';
export type ParsedBet = { ok: true; cents: number } | { ok: false; message: string };

/** Parse a dollar string without floating-point money arithmetic. */
export function parseBetInput(value: string, balanceCents: number, limits: BetLimits = { minBetCents: 100, maxBetCents: Number.MAX_SAFE_INTEGER }): ParsedBet {
  const amount = value.trim();
  if (!amount) return { ok: false, message: '베팅 금액을 입력하세요.' };
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    return { ok: false, message: '숫자를 소수 둘째 자리까지 입력하세요.' };
  }
  const [dollars, fraction = ''] = amount.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return { ok: false, message: '베팅 금액이 너무 큽니다.' };
  if (cents < limits.minBetCents) return { ok: false, message: `최소 베팅은 $${(limits.minBetCents / 100).toFixed(2)}입니다.` };
  if (cents > limits.maxBetCents) return { ok: false, message: `최대 베팅은 $${(limits.maxBetCents / 100).toFixed(2)}입니다.` };
  if (cents > balanceCents) {
    return { ok: false, message: '잔액을 초과했습니다.' };
  }
  return { ok: true, cents };
}
