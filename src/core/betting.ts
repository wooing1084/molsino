/** Bets are integer cents, including dollar amounts with two decimal places. */
export function validateBet(cents: number, balanceCents: number): number {
  if (!Number.isSafeInteger(balanceCents) || balanceCents < 0) throw new Error('Invalid balance');
  if (!Number.isSafeInteger(cents) || cents < 100 || cents > 50_000) {
    throw new Error('Bet must be between $1 and $500 in whole cents');
  }
  if (cents > balanceCents) throw new Error('Insufficient balance');
  return cents;
}
