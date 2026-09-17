export type ParsedBet = { ok: true; cents: number } | { ok: false; message: string };

/** Parse a dollar string without floating-point money arithmetic. */
export function parseBetInput(value: string, balanceCents: number): ParsedBet {
  const amount = value.trim();
  if (!amount) return { ok: false, message: '베팅 금액을 입력하세요.' };
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    return { ok: false, message: '숫자를 소수 둘째 자리까지 입력하세요.' };
  }
  const [dollars, fraction = ''] = amount.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return { ok: false, message: '베팅 금액이 너무 큽니다.' };
  if (cents < 100) return { ok: false, message: '최소 베팅은 $1.00입니다.' };
  if (cents > Math.min(50_000, balanceCents)) {
    return { ok: false, message: '베팅 한도 또는 잔액을 초과했습니다.' };
  }
  return { ok: true, cents };
}
