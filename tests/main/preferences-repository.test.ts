import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PreferencesRepository } from '../../src/main/persistence/preferences-repository';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });
async function directory(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'molsino-preferences-'));
  directories.push(value);
  return value;
}

it('creates Korean defaults independently from the game session', async () => {
  const dir = await directory();
  const repository = new PreferencesRepository(dir);
  expect(await repository.loadOrDefault()).toEqual({ schemaVersion: 1, locale: 'ko' });
  expect(JSON.parse(await readFile(join(dir, 'preferences.json'), 'utf8'))).toEqual({ schemaVersion: 1, locale: 'ko' });
});

it('loads an English preference and atomically persists a language change', async () => {
  const dir = await directory();
  const repository = new PreferencesRepository(dir);
  await repository.save({ schemaVersion: 1, locale: 'en' });
  expect(await repository.loadOrDefault()).toEqual({ schemaVersion: 1, locale: 'en' });
  await repository.save({ schemaVersion: 1, locale: 'ko' });
  expect(JSON.parse(await readFile(join(dir, 'preferences.json'), 'utf8')).locale).toBe('ko');
  expect(JSON.parse(await readFile(join(dir, 'preferences.backup.json'), 'utf8')).locale).toBe('en');
});

it('restores a valid preference backup over a damaged primary', async () => {
  const dir = await directory();
  await writeFile(join(dir, 'preferences.json'), '{broken');
  await writeFile(join(dir, 'preferences.backup.json'), JSON.stringify({ schemaVersion: 1, locale: 'en' }));
  const repository = new PreferencesRepository(dir);
  expect(await repository.loadOrDefault()).toEqual({ schemaVersion: 1, locale: 'en' });
  expect(JSON.parse(await readFile(join(dir, 'preferences.json'), 'utf8')).locale).toBe('en');
});

it.each([{ schemaVersion: 99, locale: 'en' }, { schemaVersion: 1, locale: 'fr' }])('falls back to Korean for an unsupported preference without blocking startup', async value => {
  const dir = await directory();
  await writeFile(join(dir, 'preferences.json'), JSON.stringify(value));
  const repository = new PreferencesRepository(dir);
  expect(await repository.loadOrDefault()).toEqual({ schemaVersion: 1, locale: 'ko' });
});

it('rejects a language save when the atomic backup destination cannot be replaced', async () => {
  const dir = await directory();
  const repository = new PreferencesRepository(dir);
  await repository.save({ schemaVersion: 1, locale: 'ko' });
  await mkdir(join(dir, 'preferences.backup.json'));
  await expect(repository.save({ schemaVersion: 1, locale: 'en' })).rejects.toBeDefined();
  expect(JSON.parse(await readFile(join(dir, 'preferences.json'), 'utf8')).locale).toBe('ko');
});
