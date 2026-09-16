import { BlackjackError, assertSafeCents, safeAdd, safeMultiply } from './errors';

export const SETTLEMENT_OUTCOMES = [
  'win',
  'loss',
  'push',
  'blackjack',
  'bust',
  'surrender',
  'insurance-win',
  'insurance-loss',
  'even-money',
] as const;
export type SettlementOutcome = (typeof SETTLEMENT_OUTCOMES)[number];

export interface LedgerEntry {
  readonly roundId: string;
  readonly componentId: string;
  readonly outcome: SettlementOutcome;
  readonly wagerCents: number;
  readonly returnedCents: number;
  readonly netCents: number;
}

export interface LedgerApplication {
  readonly balanceCents: number;
  readonly ledger: readonly LedgerEntry[];
  readonly applied: boolean;
}

export function normalWinReturn(wagerCents: number): number {
  return safeMultiply(wagerCents, 2, 'Normal win return');
}

export function blackjackReturn(wagerCents: number): number {
  const multiplied = safeMultiply(wagerCents, 5, 'Blackjack return');
  if (multiplied % 2 !== 0) {
    throw new BlackjackError('INVALID_AMOUNT', 'Blackjack wager cannot be paid exactly at 3:2');
  }
  return multiplied / 2;
}

export function surrenderReturn(wagerCents: number): number {
  assertSafeCents(wagerCents, 'Surrender wager');
  if (wagerCents % 2 !== 0) {
    throw new BlackjackError('INVALID_AMOUNT', 'Surrender wager cannot be halved exactly');
  }
  return wagerCents / 2;
}

export function insuranceWinReturn(wagerCents: number): number {
  return safeMultiply(wagerCents, 3, 'Insurance return');
}

export function createLedgerEntry(
  roundId: string,
  componentId: string,
  outcome: SettlementOutcome,
  wagerCents: number,
  returnedCents: number,
): LedgerEntry {
  if (!roundId || !componentId) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Ledger keys must not be empty');
  }
  assertSafeCents(wagerCents, 'Ledger wager');
  assertSafeCents(returnedCents, 'Ledger return');
  const netCents = returnedCents - wagerCents;
  if (!Number.isSafeInteger(netCents)) {
    throw new BlackjackError('INVALID_AMOUNT', 'Ledger net exceeds the safe integer range');
  }
  return { roundId, componentId, outcome, wagerCents, returnedCents, netCents };
}

export function applyLedgerEntry(
  balanceCents: number,
  ledger: readonly LedgerEntry[],
  entry: LedgerEntry,
): LedgerApplication {
  assertSafeCents(balanceCents, 'Balance');
  assertSafeCents(entry.wagerCents, 'Ledger wager');
  assertSafeCents(entry.returnedCents, 'Ledger return');
  if (!entry.roundId || !entry.componentId || entry.netCents !== entry.returnedCents - entry.wagerCents) {
    throw new BlackjackError('INTEGRITY_ERROR', 'Ledger entry is inconsistent');
  }
  const duplicate = ledger.some(
    (current) => current.roundId === entry.roundId && current.componentId === entry.componentId,
  );
  if (duplicate) return { balanceCents, ledger, applied: false };
  return {
    balanceCents: safeAdd(balanceCents, entry.returnedCents, 'Balance'),
    ledger: [...ledger, entry],
    applied: true,
  };
}

export function calculateRoundNet(ledger: readonly LedgerEntry[], roundId: string): number {
  return ledger
    .filter((entry) => entry.roundId === roundId)
    .reduce((net, entry) => {
      const next = net + entry.netCents;
      if (!Number.isSafeInteger(next)) {
        throw new BlackjackError('INVALID_AMOUNT', 'Round net exceeds the safe integer range');
      }
      return next;
    }, 0);
}
