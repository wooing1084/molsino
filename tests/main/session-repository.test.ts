import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../../src/core/engine';
import { GameStore } from '../../src/main/game/game-store';
import { SESSION_SCHEMA_VERSION, SessionRepository, parseSnapshot, type SavedSession } from '../../src/main/persistence/session-repository';
import { card, environment, fixtureShoe } from '../core/helpers';

const directories: string[] = [];
async function directory(): Promise<string> {
  const created = await fs.mkdtemp(join(tmpdir(), 'molsino-repo-'));
  directories.push(created);
  return created;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const name of directories.splice(0)) await fs.rm(name, { recursive: true, force: true });
});

function snapshot(revision = 0, pendingBetCents = 100): SavedSession {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION, revision,
    state: { ...createSession(fixtureShoe([])), pendingBetCents },
    lastAppliedCommand: null,
  };
}

describe('SessionRepository', () => {
  it('persists the previous verified primary as backup and ignores abandoned temp files', async () => {
    const dir = await directory();
    const repo = new SessionRepository(dir);
    await repo.save(snapshot());
    await repo.save(snapshot(1, 200));
    await fs.writeFile(join(dir, 'session.json.dead.tmp'), JSON.stringify(snapshot(9, 900)));
    expect(await repo.load()).toMatchObject({ kind: 'ready', snapshot: { revision: 1 } });
    expect(JSON.parse(await fs.readFile(join(dir, 'session.backup.json'), 'utf8'))).toMatchObject({ revision: 0 });
    await fs.writeFile(join(dir, 'session.json'), '{corrupt');
    expect(await repo.load()).toMatchObject({ kind: 'recovery', issue: 'corrupt', backup: { revision: 0 } });
    expect(await fs.readFile(join(dir, 'session.json'), 'utf8')).toBe('{corrupt');
  });

  it('preserves future versions even when an older backup exists, and rejects a damaged shoe', async () => {
    const dir = await directory();
    const repo = new SessionRepository(dir);
    await repo.save(snapshot());
    await repo.save(snapshot(1, 200));
    const future = JSON.stringify({ ...snapshot(1, 200), schemaVersion: 999 });
    await fs.writeFile(join(dir, 'session.json'), future);
    expect(await repo.load()).toMatchObject({ kind: 'recovery', issue: 'futureSchema', backup: { revision: 0 } });
    expect(await fs.readFile(join(dir, 'session.json'), 'utf8')).toBe(future);
    const damaged = snapshot();
    expect(() => parseSnapshot({ ...damaged, state: { ...damaged.state,
      shoe: { ...damaged.state.shoe, nextIndex: 400 },
    } })).toThrow();
  });

  it('retries a transient EPERM rename, then commits exactly once', async () => {
    const dir = await directory();
    const rename = vi.fn(async (source: Parameters<typeof fs.rename>[0], target: Parameters<typeof fs.rename>[1]) => {
      if (rename.mock.calls.length === 1) throw Object.assign(new Error('locked'), { code: 'EPERM' });
      return fs.rename(source, target);
    });
    const repo = new SessionRepository(dir, { ...fs, rename });
    await repo.save(snapshot());
    expect(rename).toHaveBeenCalledTimes(2);
    expect(await repo.load()).toMatchObject({ kind: 'ready', snapshot: { revision: 0 } });
  });

  it('keeps the old committed state and retries the same candidate after write failure', async () => {
    const dir = await directory();
    let failPrimary = true;
    const rename = vi.fn(async (source: Parameters<typeof fs.rename>[0], target: Parameters<typeof fs.rename>[1]) => {
      if (String(target) === join(dir, 'session.json') && failPrimary) {
        failPrimary = false;
        throw Object.assign(new Error('disk failure'), { code: 'EIO' });
      }
      return fs.rename(source, target);
    });
    const repo = new SessionRepository(dir, { ...fs, rename });
    const initial = snapshot();
    await fs.writeFile(join(dir, 'session.json'), JSON.stringify(initial));
    const store = new GameStore(initial.state, environment(), 'test', repo, initial);
    const listener = vi.fn();
    store.subscribe(listener);
    const commandId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const failed = await store.dispatch({ commandId, expectedRevision: 0, action: { type: 'setBet', amountCents: 200 } });
    expect(failed).toMatchObject({ ok: false, error: 'SAVE_FAILED', state: { revision: 0, pendingBetCents: 100 } });
    expect(listener).not.toHaveBeenCalled();
    expect(await repo.load()).toMatchObject({ kind: 'ready', snapshot: { revision: 0 } });
    expect(await store.dispatch({ commandId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', expectedRevision: 0,
      action: { type: 'setBet', amountCents: 300 },
    })).toMatchObject({ ok: false, error: 'SAVE_FAILED' });
    const success = await store.dispatch({ commandId, expectedRevision: 0, action: { type: 'setBet', amountCents: 200 } });
    expect(success).toMatchObject({ ok: true, state: { revision: 1, pendingBetCents: 200 } });
    expect(listener).toHaveBeenCalledTimes(1);
    const loaded = await repo.load();
    if (loaded.kind !== 'ready') throw new Error('missing restored session');
    const restarted = new GameStore(loaded.snapshot.state, environment(), 'test', repo, loaded.snapshot);
    expect(await restarted.dispatch({ commandId, expectedRevision: 0,
      action: { type: 'setBet', amountCents: 200 },
    })).toMatchObject({ ok: true, state: { revision: 1, pendingBetCents: 200 } });
  });

  it('keeps a failed dealer draw checkpoint and resumes it via retrySave', async () => {
    const dir = await directory();
    const initial = { ...snapshot(), state: createSession(fixtureShoe([
      card('10'), card('9', 'C'), card('7', 'D'), card('7', 'H'), card('5', 'S', '2'),
    ])) };
    let failDealer = true;
    const rename = vi.fn(async (source: Parameters<typeof fs.rename>[0], target: Parameters<typeof fs.rename>[1]) => {
      if (String(target) === join(dir, 'session.json') && failDealer) {
        const candidate = JSON.parse(await fs.readFile(source, 'utf8'));
        if (candidate.revision === 3) {
          failDealer = false;
          throw Object.assign(new Error('disk failure'), { code: 'EIO' });
        }
      }
      return fs.rename(source, target);
    });
    const repo = new SessionRepository(dir, { ...fs, rename });
    await repo.save(initial);
    const store = new GameStore(initial.state, environment(), 'test', repo, initial);
    const dealt = await store.dispatch({ commandId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expectedRevision: 0,
      action: { type: 'deal' },
    });
    if (!dealt.ok) throw new Error(dealt.message);
    const stood = await store.dispatch({ commandId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', expectedRevision: 1,
      action: { type: 'stand', handId: dealt.state.playerHands[0]!.handId },
    });
    expect(stood).toMatchObject({ ok: true, state: { phase: 'dealerTurn', revision: 2 } });
    await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({
      phase: 'dealerTurn', revision: 2, saveError: true,
    }));
    expect((await repo.load())).toMatchObject({ kind: 'ready', snapshot: { revision: 2 } });
    const retry = await store.dispatch({ commandId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', expectedRevision: 2,
      action: { type: 'retrySave' },
    });
    expect(retry).toMatchObject({ ok: true, state: { phase: 'result', revision: 3 } });
    expect((await repo.load())).toMatchObject({ kind: 'ready', snapshot: { revision: 3,
      state: { shoe: { nextIndex: 5 } },
    } });
  });
});
