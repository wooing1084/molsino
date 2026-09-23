import { z } from 'zod';
import { APP_LOCALES, type AppLocale } from '../../shared/i18n';
import { AtomicSessionRepository, type FileOperations } from './atomic-session-repository';

const preferencesSchema = z.object({
  schemaVersion: z.literal(1),
  locale: z.enum(APP_LOCALES),
}).strict();

export interface AppPreferences { schemaVersion: 1; locale: AppLocale; }
export const defaultPreferences = (): AppPreferences => ({ schemaVersion: 1, locale: 'ko' });
export const parsePreferences = (value: unknown): AppPreferences => preferencesSchema.parse(value);

export class PreferencesRepository extends AtomicSessionRepository<AppPreferences> {
  public constructor(directory: string, io?: FileOperations) {
    super(directory, 'preferences', 1, parsePreferences, io);
  }

  public async loadOrDefault(): Promise<AppPreferences> {
    try {
      const loaded = await this.load();
      if (loaded.kind === 'ready') return loaded.snapshot;
      const preferences = loaded.kind === 'recovery' && loaded.backup ? loaded.backup : defaultPreferences();
      await this.save(preferences);
      return preferences;
    } catch {
      return defaultPreferences();
    }
  }
}
