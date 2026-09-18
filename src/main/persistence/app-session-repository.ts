import { randomUUID } from 'node:crypto';
import { AtomicSessionRepository, type RepositoryLoad } from './atomic-session-repository';
import { z } from 'zod';
import { validateState, getPhase } from '../../core/engine';
import { SessionRepository, stateSchema, type SavedSession } from './session-repository';
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const gameId = z.enum(['blackjack', 'baccarat']);
const appSchema = z.object({
  schemaVersion: z.literal(2), sessionId: z.uuid(), revision: integer,
  screen: z.enum(['menu', 'blackjack', 'baccarat']), wallet: z.object({ balanceCents: integer }).strict(),
  activeRoundGameId: gameId.nullable(),
  games: z.object({ blackjack: stateSchema.omit({ balanceCents: true }).nullable(), baccarat: z.null() }).strict(),
  lastAppliedCommand: z.object({ sessionId: z.uuid(), commandId: z.uuid(), revision: integer }).strict().nullable(),
}).strict();
export type AppSession = z.infer<typeof appSchema>;
export type AppLoadResult = RepositoryLoad<AppSession>;
export function newAppSession(revision = 0): AppSession {
  return { schemaVersion: 2, sessionId: randomUUID(), revision, screen: 'menu', wallet: { balanceCents: 10000 },
    activeRoundGameId: null, games: { blackjack: null, baccarat: null }, lastAppliedCommand: null };
}
export function migrateLegacy(snapshot: SavedSession): AppSession {
  const app = newAppSession(snapshot.revision);
  const { balanceCents, ...blackjack } = snapshot.state;
  app.wallet.balanceCents = balanceCents;
  app.games.blackjack = structuredClone(blackjack) as AppSession['games']['blackjack'];
  const phase = getPhase(snapshot.state);
  app.activeRoundGameId = phase === 'betting' || phase === 'result' ? null : 'blackjack';
  app.screen = app.activeRoundGameId ?? 'menu';
  app.lastAppliedCommand = snapshot.lastAppliedCommand ? { ...snapshot.lastAppliedCommand, sessionId: app.sessionId } : null;
  return parseAppSession(app);
}
export function parseAppSession(value: unknown): AppSession {
  const s = appSchema.parse(value);
  if (s.lastAppliedCommand && s.lastAppliedCommand.revision > s.revision) throw new Error('Invalid command revision');
  let active: 'blackjack' | 'baccarat' | null = null;
  if (s.games.blackjack) {
    const state = { ...s.games.blackjack, balanceCents: s.wallet.balanceCents };
    validateState(state);
    if (!['betting', 'result'].includes(getPhase(state))) active = 'blackjack';
  }
  if (s.activeRoundGameId !== active || active && s.screen !== active) throw new Error('Invalid active game lock');
  if (s.screen !== 'menu' && !s.games[s.screen]) throw new Error('Missing selected game');
  return s;
}
export class AppSessionRepository extends AtomicSessionRepository<AppSession> {
  private readonly legacy: SessionRepository;
  public constructor(directory: string) { super(directory, 'app-session', 2, parseAppSession); this.legacy = new SessionRepository(directory); }
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
