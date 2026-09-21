import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createSession, transition } from '../../src/core/engine';
import { AppSessionRepository, migrateAppV2, newAppSession } from '../../src/main/persistence/app-session-repository';
import { card, environment, fixtureShoe } from '../core/helpers';
let dir: string;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
it('retries interrupted migration without promoting temp files or changing legacy bytes', async () => {
  dir = await mkdtemp(join(tmpdir(), 'molsino-app-repo-'));
  const old = JSON.stringify({ schemaVersion: 1, revision: 7, state: createSession(fixtureShoe([]), { balanceCents: 11111, pendingBetCents: 101 }), lastAppliedCommand: null });
  await writeFile(join(dir, 'session.json'), old);
  await writeFile(join(dir, 'app-session.json.abandoned.tmp'), JSON.stringify(newAppSession()));
  await mkdir(join(dir, 'app-session.backup.json'));
  const repo = new AppSessionRepository(dir);
  await expect(repo.load()).rejects.toThrow();
  await rm(join(dir, 'app-session.backup.json'), { recursive: true });
  const loaded = await repo.load();
  expect(loaded).toMatchObject({ kind: 'ready', snapshot: { revision: 7, wallet: { balanceCents: 11111 }, games: { blackjack: { pendingBetCents: 101 } } } });
  expect(await repo.load()).toEqual(loaded);
  expect(await readFile(join(dir, 'session.json'), 'utf8')).toBe(old);
});
it('new primary/backup always take precedence over valid legacy data', async () => {
  dir = await mkdtemp(join(tmpdir(), 'molsino-app-repo-'));
  const old = JSON.stringify({ schemaVersion: 1, revision: 7, state: createSession(fixtureShoe([])), lastAppliedCommand: null });
  await writeFile(join(dir, 'session.json'), old);
  const repo = new AppSessionRepository(dir);
  const fresh = newAppSession(); fresh.wallet.balanceCents = 4567;
  await repo.save(fresh);
  await repo.save({ ...fresh, revision: 1 });
  await writeFile(join(dir, 'app-session.json'), JSON.stringify({ schemaVersion: 99 }));
  expect(await repo.load()).toMatchObject({ kind: 'recovery', issue: 'futureSchema', backup: { wallet: { balanceCents: 4567 } } });
  await rm(join(dir, 'app-session.json'));
  expect(await repo.load()).toMatchObject({ kind: 'recovery', backup: { wallet: { balanceCents: 4567 } } });
});

function v2InProgress() {
  const app = newAppSession(12);
  const env = environment(fixtureShoe([card('8'), card('6'), card('8', 'H'), card('10'), card('3')]));
  const started = transition(createSession(env.createShoe(), { balanceCents: 100000, pendingBetCents: 20000 }), { type: 'deal' }, env).nextState;
  const split = transition(started, { type: 'split', handId: started.round!.playerHands[0]!.handId }, env).nextState;
  const { balanceCents, ...blackjack } = split;
  const { table: _, ...old } = app;
  return { ...old, schemaVersion: 2, screen: 'blackjack', activeRoundGameId: 'blackjack',
    wallet: { balanceCents }, games: { blackjack, baccarat: null },
    lastAppliedCommand: { sessionId: old.sessionId, commandId: randomUUID(), revision: 12 } };
}
it('atomically upgrades v2 above-cap split evidence without changing identity, deductions, or dedup record', async () => {
  dir = await mkdtemp(join(tmpdir(), 'molsino-app-v3-'));
  const old = v2InProgress();
  await writeFile(join(dir, 'app-session.json'), JSON.stringify(old));
  const repo = new AppSessionRepository(dir);
  const loaded = await repo.load();
  expect(loaded).toEqual({ kind: 'ready', snapshot: { ...old, schemaVersion: 3, table: { selectedLevel: 1, bestBankrollCents: 60000 } } });
  const persisted = JSON.parse(await readFile(join(dir, 'app-session.json'), 'utf8'));
  expect(persisted.games).toEqual(old.games);
  expect(persisted.lastAppliedCommand).toEqual(old.lastAppliedCommand);
  expect(persisted.table).toEqual({ selectedLevel: 1, bestBankrollCents: 60000 });
  expect(JSON.parse(await readFile(join(dir, 'app-session.backup.json'), 'utf8'))).toEqual(persisted);
  expect(await repo.load()).toEqual(loaded);
});
it('retries a failed v2 primary replacement without changing source bytes or double-migrating funds', async () => {
  dir = await mkdtemp(join(tmpdir(), 'molsino-app-v3-'));
  const old = JSON.stringify(v2InProgress());
  await writeFile(join(dir, 'app-session.json'), old);
  let fail = true;
  const repo = new AppSessionRepository(dir, { ...fs, rename: async (source, target) => {
    if (String(target) === join(dir, 'app-session.json') && fail) { fail = false; throw Object.assign(new Error('disk'), { code: 'EIO' }); }
    return fs.rename(source, target);
  } });
  await expect(repo.load()).rejects.toThrow('disk');
  expect(await readFile(join(dir, 'app-session.json'), 'utf8')).toBe(old);
  expect(JSON.parse(await readFile(join(dir, 'app-session.backup.json'), 'utf8')).wallet.balanceCents).toBe(60000);
  expect(await repo.load()).toMatchObject({ kind: 'ready', snapshot: { schemaVersion: 3, wallet: { balanceCents: 60000 } } });
});
it.each(['missing', 'corrupt', 'futureSchema'])('offers a validated v2 backup without automatic restore when primary is %s', async issue => {
  dir = await mkdtemp(join(tmpdir(), 'molsino-app-v3-'));
  const old = JSON.stringify(v2InProgress());
  await writeFile(join(dir, 'app-session.backup.json'), old);
  if (issue !== 'missing') await writeFile(join(dir, 'app-session.json'), issue === 'corrupt' ? '{bad' : '{"schemaVersion":99}');
  const repo = new AppSessionRepository(dir);
  expect(await repo.load()).toMatchObject({ kind: 'recovery', issue: issue === 'futureSchema' ? issue : 'corrupt', backup: { schemaVersion: 3, wallet: { balanceCents: 60000 } } });
  expect(await readFile(join(dir, 'app-session.backup.json'), 'utf8')).toBe(old);
  if (issue === 'missing') await expect(readFile(join(dir, 'app-session.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('rejects malformed v2 evidence and never repairs invalid v3 by downgrading it', () => {
  const old = v2InProgress();
  expect(() => migrateAppV2({ ...old, activeRoundGameId: null })).toThrow();
  expect(() => migrateAppV2({ ...old, schemaVersion: 3 })).toThrow();
});
