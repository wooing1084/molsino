import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PreferencesRepository } from '../../src/main/persistence/preferences-repository';
import type { AppLocale } from '../../src/shared/i18n';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});
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

it('persists the first-run locale only when both preference files are absent, even with an existing game file', async () => {
  const dir = await directory();
  const gameFile = '{"existingGameSession":true}';
  await writeFile(join(dir, 'app-session.json'), gameFile);
  const repository = new PreferencesRepository(dir);
  expect(await repository.loadOrDefault('en')).toEqual({ schemaVersion: 1, locale: 'en' });
  expect(JSON.parse(await readFile(join(dir, 'preferences.json'), 'utf8'))).toEqual({ schemaVersion: 1, locale: 'en' });
  expect(await readFile(join(dir, 'app-session.json'), 'utf8')).toBe(gameFile);
  expect(await repository.loadOrDefault('ko')).toEqual({ schemaVersion: 1, locale: 'en' });
});

it.each(['ko', 'en'] as const)('keeps a saved %s preference ahead of a different first-run locale and backup', async locale => {
  const dir = await directory();
  const otherLocale = locale === 'ko' ? 'en' : 'ko';
  const primary = JSON.stringify({ schemaVersion: 1, locale }, null, 2);
  await writeFile(join(dir, 'preferences.json'), primary);
  await writeFile(join(dir, 'preferences.backup.json'), JSON.stringify({ schemaVersion: 1, locale: otherLocale }));
  const repository = new PreferencesRepository(dir);
  expect(await repository.loadOrDefault(otherLocale)).toEqual({ schemaVersion: 1, locale });
  expect(await readFile(join(dir, 'preferences.json'), 'utf8')).toBe(primary);
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

it.each([
  { primary: undefined, locale: 'en' },
  { primary: '{broken', locale: 'en' },
  { primary: '{"schemaVersion":99,"locale":"ko"}', locale: 'en' },
  { primary: undefined, locale: 'ko' },
  { primary: '{broken', locale: 'ko' },
  { primary: '{"schemaVersion":99,"locale":"en"}', locale: 'ko' },
] satisfies { primary: string | undefined; locale: AppLocale }[])('restores a valid $locale backup when primary is $primary, ahead of the first-run locale', async ({ primary, locale }) => {
  const dir = await directory();
  if (primary !== undefined) await writeFile(join(dir, 'preferences.json'), primary);
  await writeFile(join(dir, 'preferences.backup.json'), JSON.stringify({ schemaVersion: 1, locale }));
  const repository = new PreferencesRepository(dir);
  expect(await repository.loadOrDefault(locale === 'ko' ? 'en' : 'ko')).toEqual({ schemaVersion: 1, locale });
  expect(JSON.parse(await readFile(join(dir, 'preferences.json'), 'utf8')).locale).toBe(locale);
});

it.each([{ schemaVersion: 99, locale: 'en' }, { schemaVersion: 1, locale: 'fr' }])('falls back to Korean for an unsupported preference without blocking startup', async value => {
  const dir = await directory();
  await writeFile(join(dir, 'preferences.json'), JSON.stringify(value));
  const repository = new PreferencesRepository(dir);
  expect(await repository.loadOrDefault('en')).toEqual({ schemaVersion: 1, locale: 'ko' });
});

it.each(['{broken', '{"schemaVersion":99,"locale":"en"}'])('keeps Korean recovery fallback when only an invalid backup exists', async backup => {
  const dir = await directory();
  await writeFile(join(dir, 'preferences.backup.json'), backup);
  const repository = new PreferencesRepository(dir);
  expect(await repository.loadOrDefault('en')).toEqual({ schemaVersion: 1, locale: 'ko' });
});

it.each(['preferences.json', 'preferences.backup.json'])('treats a read error on %s as Korean fallback rather than a first run', async failingName => {
  const dir = await directory();
  await writeFile(join(dir, 'preferences.backup.json'), JSON.stringify({ schemaVersion: 1, locale: 'en' }));
  const failedRead = vi.fn(async (filename: Parameters<typeof fs.readFile>[0], options: Parameters<typeof fs.readFile>[1]) => {
    if (String(filename) === join(dir, failingName)) throw Object.assign(new Error('read denied'), { code: 'EACCES' });
    return fs.readFile(filename, options);
  });
  const rename = vi.fn(fs.rename);
  const repository = new PreferencesRepository(dir, { ...fs, readFile: failedRead as typeof fs.readFile, rename });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await repository.loadOrDefault('en')).toEqual({ schemaVersion: 1, locale: 'ko' });
  expect(rename).not.toHaveBeenCalled();
  await expect(readFile(join(dir, 'preferences.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  expect(JSON.parse(await readFile(join(dir, 'preferences.backup.json'), 'utf8')).locale).toBe('en');
});

it('uses the first-run English locale when its initial atomic save fails and retries initialization next launch', async () => {
  const dir = await directory();
  const rename = vi.fn(async (source: Parameters<typeof fs.rename>[0], target: Parameters<typeof fs.rename>[1]) => {
    if (String(target) === join(dir, 'preferences.json')) throw Object.assign(new Error('disk unavailable'), { code: 'EIO' });
    return fs.rename(source, target);
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const repository = new PreferencesRepository(dir, { ...fs, rename });
  expect(await repository.loadOrDefault('en')).toEqual({ schemaVersion: 1, locale: 'en' });
  expect(rename).toHaveBeenCalled();
  expect(warn).toHaveBeenCalled();
  await expect(readFile(join(dir, 'preferences.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(join(dir, 'preferences.backup.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await new PreferencesRepository(dir).loadOrDefault('ko')).toEqual({ schemaVersion: 1, locale: 'ko' });
  expect(JSON.parse(await readFile(join(dir, 'preferences.json'), 'utf8')).locale).toBe('ko');
});

it.each([undefined, '{broken', '{"schemaVersion":99,"locale":"ko"}'])('uses a recovered English backup even when restoration over $0 fails', async primary => {
  const dir = await directory();
  if (primary !== undefined) await writeFile(join(dir, 'preferences.json'), primary);
  const backup = JSON.stringify({ schemaVersion: 1, locale: 'en' });
  await writeFile(join(dir, 'preferences.backup.json'), backup);
  const rename = vi.fn(async (source: Parameters<typeof fs.rename>[0], target: Parameters<typeof fs.rename>[1]) => {
    if (String(target) === join(dir, 'preferences.json')) throw Object.assign(new Error('disk unavailable'), { code: 'EIO' });
    return fs.rename(source, target);
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const repository = new PreferencesRepository(dir, { ...fs, rename });
  expect(await repository.loadOrDefault('ko')).toEqual({ schemaVersion: 1, locale: 'en' });
  expect(warn).toHaveBeenCalled();
  expect(await readFile(join(dir, 'preferences.backup.json'), 'utf8')).toBe(backup);
  if (primary === undefined) await expect(readFile(join(dir, 'preferences.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  else expect(await readFile(join(dir, 'preferences.json'), 'utf8')).toBe(primary);
  expect(await new PreferencesRepository(dir).loadOrDefault('ko')).toEqual({ schemaVersion: 1, locale: 'en' });
  expect(JSON.parse(await readFile(join(dir, 'preferences.json'), 'utf8')).locale).toBe('en');
});

it('rejects a language save when the atomic backup destination cannot be replaced', async () => {
  const dir = await directory();
  const repository = new PreferencesRepository(dir);
  await repository.save({ schemaVersion: 1, locale: 'ko' });
  await mkdir(join(dir, 'preferences.backup.json'));
  await expect(repository.save({ schemaVersion: 1, locale: 'en' })).rejects.toBeDefined();
  expect(JSON.parse(await readFile(join(dir, 'preferences.json'), 'utf8')).locale).toBe('ko');
});
