/** Integer cents only. This is the first isolated core module, not a game engine. */
export function validateBet(cents: number, balanceCents: number): number {
  if (!Number.isSafeInteger(balanceCents) || balanceCents < 0) throw new Error('Invalid balance');
  if (!Number.isSafeInteger(cents) || cents < 100 || cents % 100 !== 0 || cents > 50_000) {
    throw new Error('Bet must be whole dollars between $1 and $500');
  }
  if (cents > balanceCents) throw new Error('Insufficient balance');
  return cents;
}
