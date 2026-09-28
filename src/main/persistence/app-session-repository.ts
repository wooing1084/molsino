import { bigWheelStateSchema, validateBigWheel } from '../../core/bigwheel/core';
import { baccaratStateSchema, validateBaccarat } from '../../core/baccarat/core';
import { randomUUID } from 'node:crypto';
import { AtomicSessionRepository, type FileOperations, type RepositoryLoad } from './atomic-session-repository';
import { z } from 'zod';
import { validateState, getPhase } from '../../core/engine';
import { SessionRepository, stateSchema, type SavedSession } from './session-repository';
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const gameId = z.enum(['blackjack', 'baccarat']);
const appV2Schema = z.object({
  schemaVersion: z.literal(2), sessionId: z.uuid(), revision: integer,
  screen: z.enum(['menu', 'blackjack', 'baccarat']), wallet: z.object({ balanceCents: integer }).strict(),
  activeRoundGameId: gameId.nullable(),
  games: z.object({ blackjack: stateSchema.omit({ balanceCents: true }).nullable(), baccarat: baccaratStateSchema.nullable() }).strict(),
  lastAppliedCommand: z.object({ sessionId: z.uuid(), commandId: z.uuid(), revision: integer }).strict().nullable(),
}).strict();
const appV3Schema = appV2Schema.extend({
  schemaVersion: z.literal(3),
  table: z.object({ selectedLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]), bestBankrollCents: integer }).strict(),
});
const appSchema = appV3Schema.extend({
  schemaVersion: z.literal(4), screen: z.enum(['menu', 'blackjack', 'baccarat', 'bigwheel']),
  activeRoundGameId: z.enum(['blackjack', 'baccarat', 'bigwheel']).nullable(),
  games: appV3Schema.shape.games.extend({ bigwheel: bigWheelStateSchema.nullable() }),
});
export type AppSession = z.infer<typeof appSchema>;
export type AppLoadResult = RepositoryLoad<AppSession>;
export function newAppSession(revision = 0): AppSession {
  return { schemaVersion: 4, table: { selectedLevel: 1, bestBankrollCents: 10000 }, sessionId: randomUUID(), revision, screen: 'menu', wallet: { balanceCents: 10000 },
    activeRoundGameId: null, games: { blackjack: null, baccarat: null, bigwheel: null }, lastAppliedCommand: null };
}
export function migrateLegacy(snapshot: SavedSession): AppSession {
  const app = newAppSession(snapshot.revision);
  const { balanceCents, ...blackjack } = snapshot.state;
  app.wallet.balanceCents = balanceCents;
  app.table.bestBankrollCents = balanceCents;
  app.games.blackjack = structuredClone(blackjack) as AppSession['games']['blackjack'];
  const phase = getPhase(snapshot.state);
  app.activeRoundGameId = phase === 'betting' || phase === 'result' ? null : 'blackjack';
  app.screen = app.activeRoundGameId ?? 'menu';
  app.lastAppliedCommand = snapshot.lastAppliedCommand ? { ...snapshot.lastAppliedCommand, sessionId: app.sessionId } : null;
  return parseAppSession(app);
}
export function migrateAppV2(value: unknown): AppSession {
  const old = appV2Schema.parse(value);
  return migrateAppV3({ ...old, schemaVersion: 3, table: { selectedLevel: 1, bestBankrollCents: old.wallet.balanceCents } });
}
export function migrateAppV3(value: unknown): AppSession {
  const old = appV3Schema.parse(value);
  return parseAppSession({ ...old, schemaVersion: 4, games: { ...old.games, bigwheel: null } });
}
function migrateAppSession(value: unknown): AppSession {
  if (typeof value === 'object' && value !== null && 'schemaVersion' in value && value.schemaVersion === 2) return migrateAppV2(value);
  return migrateAppV3(value);
}
export function parseAppSession(value: unknown): AppSession {
  const s = appSchema.parse(value);
  if (s.lastAppliedCommand && s.lastAppliedCommand.revision > s.revision) throw new Error('Invalid command revision');
  let active: AppSession['activeRoundGameId'] = null;
  if (s.games.blackjack) {
    const state = { ...s.games.blackjack, balanceCents: s.wallet.balanceCents };
    validateState(state);
    if (!['betting', 'result'].includes(getPhase(state))) active = 'blackjack';
  }
  if (s.games.baccarat) {
    validateBaccarat(s.games.baccarat, s.sessionId, s.wallet.balanceCents);
    if (s.games.baccarat.phase === 'dealing') {
      if (active) throw new Error('Two active games');
      active = 'baccarat';
    }
  }
  if (s.games.bigwheel) {
    validateBigWheel(s.games.bigwheel, s.sessionId, s.wallet.balanceCents);
    if (s.games.bigwheel.phase === 'spinning') {
      if (active) throw new Error('Two active games');
      active = 'bigwheel';
    }
  }
  if (s.activeRoundGameId !== active || active && s.screen !== active) throw new Error('Invalid active game lock');
  if (s.screen !== 'menu' && !s.games[s.screen]) throw new Error('Missing selected game');
  return s;
}
export class AppSessionRepository extends AtomicSessionRepository<AppSession> {
  private readonly legacy: SessionRepository;
  public constructor(directory: string, io?: FileOperations) { super(directory, 'app-session', 4, parseAppSession, io, migrateAppSession); this.legacy = new SessionRepository(directory, io); }
  public override async load(): Promise<AppLoadResult> {
    const current = await super.load();
    if (current.kind !== 'missing') return current;
    const old = await this.legacy.load();
    if (old.kind === 'missing') return old;
    if (old.kind === 'recovery') return { kind: 'recovery', issue: old.issue, ...(old.backup ? { backup: migrateLegacy(old.backup) } : {}) };
    const snapshot = migrateLegacy(old.snapshot);
    await this.save(snapshot);
    const verified = await super.load();
    if (verified.kind !== 'ready') throw new Error('Migration verification failed');
    return verified;
  }
}
