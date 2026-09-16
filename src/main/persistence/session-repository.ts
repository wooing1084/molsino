import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
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
const stateSchema = z.object({
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

export type LoadResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'ready'; readonly snapshot: SavedSession }
  | { readonly kind: 'recovery'; readonly issue: 'corrupt' | 'futureSchema'; readonly backup?: SavedSession };

type ReadResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'valid'; readonly snapshot: SavedSession }
  | { readonly kind: 'corrupt' | 'futureSchema' };

type FileOperations = Pick<typeof fs, 'copyFile' | 'mkdir' | 'open' | 'readFile' | 'rename' | 'unlink'>;

export class SessionRepository {
  private readonly primary: string;
  private readonly backup: string;

  public constructor(private readonly directory: string, private readonly io: FileOperations = fs) {
    this.primary = path.join(directory, 'session.json');
    this.backup = path.join(directory, 'session.backup.json');
  }

  public async load(): Promise<LoadResult> {
    const primary = await this.readValidated(this.primary);
    if (primary.kind === 'valid') return { kind: 'ready', snapshot: primary.snapshot };
    const backup = await this.readValidated(this.backup);
    if (primary.kind === 'missing' && backup.kind === 'missing') return { kind: 'missing' };
    return {
      kind: 'recovery', issue: primary.kind === 'futureSchema' ? 'futureSchema' : 'corrupt',
      ...(backup.kind === 'valid' ? { backup: backup.snapshot } : {}),
    };
  }

  public async save(snapshot: SavedSession): Promise<void> {
    parseSnapshot(snapshot);
    await this.io.mkdir(this.directory, { recursive: true });
    const previous = await this.readValidated(this.primary);
    // Never copy a corrupt or unsupported primary over the last good backup.
    if (previous.kind === 'valid') await this.writeAtomic(this.backup, JSON.stringify(previous.snapshot));
    await this.writeAtomic(this.primary, JSON.stringify(snapshot));
  }

  /** Preserve an unsupported or damaged primary when a person explicitly chooses recovery. */
  public async archivePrimary(): Promise<void> {
    try {
      await this.io.copyFile(this.primary, path.join(this.directory, `session.recovery-${randomUUID()}.json`), constants.COPYFILE_EXCL);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  }

  private async readValidated(filename: string): Promise<ReadResult> {
    let data: string;
    try { data = await this.io.readFile(filename, 'utf8'); }
    catch (error) {
      if (isMissing(error)) return { kind: 'missing' };
      throw error;
    }
    try {
      const parsed: unknown = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null && 'schemaVersion' in parsed
        && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > SESSION_SCHEMA_VERSION) {
        return { kind: 'futureSchema' };
      }
      return { kind: 'valid', snapshot: parseSnapshot(parsed) };
    } catch {
      return { kind: 'corrupt' };
    }
  }

  private async writeAtomic(destination: string, data: string): Promise<void> {
    const temp = `${destination}.${randomUUID()}.tmp`;
    try {
      const file = await this.io.open(temp, 'wx', 0o600);
      try { await file.writeFile(data, 'utf8'); await file.sync(); }
      finally { await file.close(); }
      for (let attempt = 0; ; attempt += 1) {
        try { await this.io.rename(temp, destination); break; }
        catch (error) {
          if (!isPermissionError(error) || attempt >= 2) throw error;
          await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
        }
      }
    } finally {
      await this.io.unlink(temp).catch(error => { if (!isMissing(error)) throw error; });
    }
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

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

function isPermissionError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'EPERM' || code === 'EACCES';
}
