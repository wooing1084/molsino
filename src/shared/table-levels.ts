/** All games use the same base-wager limits. Additional blackjack wagers are separate. */
export const TABLE_LEVELS = [
  { level: 1, entryBalanceCents: 100, minBetCents: 100, maxBetCents: 5_000 },
  { level: 2, entryBalanceCents: 50_000, minBetCents: 500, maxBetCents: 25_000 },
  { level: 3, entryBalanceCents: 250_000, minBetCents: 2_500, maxBetCents: 100_000 },
  { level: 4, entryBalanceCents: 1_000_000, minBetCents: 10_000, maxBetCents: 500_000 },
  { level: 5, entryBalanceCents: 5_000_000, minBetCents: 50_000, maxBetCents: 1_000_000 },
  { level: 6, entryBalanceCents: 10_000_000, minBetCents: 100_000, maxBetCents: 2_500_000 },
] as const;
export type TableLevel = (typeof TABLE_LEVELS)[number]['level'];
export interface BetLimits { minBetCents: number; maxBetCents: number; }
export interface TableView extends BetLimits {
  selectedLevel: TableLevel; entryBalanceCents: number; bestBankrollCents: number; bestLevel: TableLevel;
}
export function getTableLevel(level: number): (typeof TABLE_LEVELS)[number] {
  const table = TABLE_LEVELS.find(t => t.level === level);
  if (!table) throw new Error('알 수 없는 테이블 레벨입니다.');
  return table;
}
export function bestTableLevel(balance: number): TableLevel {
  return [...TABLE_LEVELS].reverse().find(t => balance >= t.entryBalanceCents)?.level ?? 1;
}
export function normalizeTableBet(amount: number, balance: number, limits: BetLimits): number {
  // Keep the minimum as a disabled placeholder when the balance cannot fund a wager.
  return Math.max(limits.minBetCents, Math.min(amount, balance, limits.maxBetCents));
}
export function validateTableBet(amount: number, balance: number, limits: BetLimits): void {
  if (!Number.isSafeInteger(amount) || amount < limits.minBetCents || amount > limits.maxBetCents)
    throw new Error(`베팅 한도는 $${limits.minBetCents / 100}–$${limits.maxBetCents / 100}입니다.`);
  if (amount > balance) throw new Error('잔액이 부족합니다. 하위 레벨을 선택하세요.');
}
