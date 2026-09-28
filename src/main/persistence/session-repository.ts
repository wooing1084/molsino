import { AtomicSessionRepository, type FileOperations, type RepositoryLoad } from './atomic-session-repository';
import { z } from 'zod';
import { validateState } from '../../core/engine';
import { HAND_STATUSES, INSURANCE_DECISIONS, ROUND_PHASES, RULE_SET_ID, type SessionState } from '../../core/game-state';
import { RANKS, SUITS } from '../../core/models';
import { SETTLEMENT_OUTCOMES } from '../../core/settlement';

export const SESSION_SCHEMA_VERSION = 1;
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const signedInteger = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const id = z.string().min(1);
const card = z.object({ cardId: id, rank: z.enum(RANKS), suit: z.enum(SUITS) }).strict();
const entry = z.object({
  roundId: id, componentId: id, outcome: z.enum(SETTLEMENT_OUTCOMES),
  wagerCents: integer, returnedCents: integer, netCents: signedInteger,
}).strict();
const hand = z.object({
  handId: id, cards: z.array(card), wagerCents: integer, status: z.enum(HAND_STATUSES),
  fromSplit: z.boolean(), splitAces: z.boolean(), doubled: z.boolean(),
}).strict();
const round = z.object({
  roundId: id, originalWagerCents: integer, phase: z.enum(ROUND_PHASES),
  playerHands: z.array(hand),
  dealerHand: z.object({ cards: z.array(card), holeRevealed: z.boolean() }).strict(),
  activeHandIndex: integer.nullable(),
  insurance: z.object({
    decision: z.enum(INSURANCE_DECISIONS), wagerCents: integer, maxWagerCents: integer,
  }).strict().nullable(),
}).strict();
export const stateSchema = z.object({
  ruleSetId: z.literal(RULE_SET_ID), balanceCents: integer, pendingBetCents: integer,
  betStepCents: integer,
  shoe: z.object({ cards: z.array(card), nextIndex: integer }).strict(),
  round: round.nullable(), ledger: z.array(entry),
  lastResult: z.object({ roundId: id, netCents: signedInteger, entries: z.array(entry) }).strict().nullable(),
}).strict();
const snapshotSchema = z.object({
  schemaVersion: z.literal(SESSION_SCHEMA_VERSION),
  revision: integer,
  state: stateSchema,
  lastAppliedCommand: z.object({ commandId: z.uuid(), revision: integer }).strict().nullable(),
}).strict();

export interface SavedSession {
  readonly schemaVersion: typeof SESSION_SCHEMA_VERSION;
  readonly revision: number;
  readonly state: SessionState;
  readonly lastAppliedCommand: { readonly commandId: string; readonly revision: number } | null;
}

export type LoadResult = RepositoryLoad<SavedSession>;

export class SessionRepository extends AtomicSessionRepository<SavedSession> {
  public constructor(directory: string, io?: FileOperations) {
    super(directory, 'session', SESSION_SCHEMA_VERSION, parseSnapshot, io);
  }
}

export function parseSnapshot(value: unknown): SavedSession {
  const parsed = snapshotSchema.parse(value);
  if (parsed.lastAppliedCommand && parsed.lastAppliedCommand.revision > parsed.revision) {
    throw new Error('Last command revision exceeds session revision');
  }
  validateState(parsed.state);
  return parsed;
}
