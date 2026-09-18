import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';

export type RepositoryLoad<T> = { kind: 'missing' } | { kind: 'ready'; snapshot: T }
  | { kind: 'recovery'; issue: 'corrupt' | 'futureSchema'; backup?: T };
type RepositoryRead<T> = { kind: 'missing' | 'corrupt' | 'futureSchema' } | { kind: 'valid'; snapshot: T };
export type FileOperations = Pick<typeof fs, 'copyFile' | 'mkdir' | 'open' | 'readFile' | 'rename' | 'unlink'>;

export class AtomicSessionRepository<T> {
  private readonly primary: string;
  private readonly backup: string;

  public constructor(private readonly directory: string, private readonly basename: string,
    private readonly schemaVersion: number, private readonly parse: (value: unknown) => T,
    private readonly io: FileOperations = fs) {
    this.primary = path.join(directory, `${basename}.json`);
    this.backup = path.join(directory, `${basename}.backup.json`);
  }

  public async load(): Promise<RepositoryLoad<T>> {
    const primary = await this.readValidated(this.primary);
    if (primary.kind === 'valid') return { kind: 'ready', snapshot: primary.snapshot };
    const backup = await this.readValidated(this.backup);
    if (primary.kind === 'missing' && backup.kind === 'missing') return { kind: 'missing' };
    return {
      kind: 'recovery', issue: primary.kind === 'futureSchema' ? 'futureSchema' : 'corrupt',
      ...(backup.kind === 'valid' ? { backup: backup.snapshot } : {}),
    };
  }

  public async save(snapshot: T): Promise<void> {
    this.parse(snapshot);
    await this.io.mkdir(this.directory, { recursive: true });
    const previous = await this.readValidated(this.primary);
    // Never copy a corrupt or unsupported primary over the last good backup.
    if (previous.kind === 'valid') await this.writeAtomic(this.backup, JSON.stringify(previous.snapshot));
    await this.writeAtomic(this.primary, JSON.stringify(snapshot));
  }

  /** Preserve an unsupported or damaged primary when a person explicitly chooses recovery. */
  public async archivePrimary(): Promise<void> {
    try {
      await this.io.copyFile(this.primary, path.join(this.directory, `${this.basename}.recovery-${randomUUID()}.json`), constants.COPYFILE_EXCL);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  }

  private async readValidated(filename: string): Promise<RepositoryRead<T>> {
    let data: string;
    try { data = await this.io.readFile(filename, 'utf8'); }
    catch (error) {
      if (isMissing(error)) return { kind: 'missing' };
      throw error;
    }
    try {
      const parsed: unknown = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null && 'schemaVersion' in parsed
        && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > this.schemaVersion) {
        return { kind: 'futureSchema' };
      }
      return { kind: 'valid', snapshot: this.parse(parsed) };
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

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

function isPermissionError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'EPERM' || code === 'EACCES';
}
