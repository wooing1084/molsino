import { z } from 'zod';
import { APP_LOCALES, type AppLocale } from '../../shared/i18n';
import { AtomicSessionRepository, type FileOperations, type RepositoryLoad } from './atomic-session-repository';

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

  public async loadOrDefault(firstRunLocale: AppLocale = 'ko'): Promise<AppPreferences> {
    let loaded: RepositoryLoad<AppPreferences>;
    try {
      loaded = await this.load();
    } catch (error) {
      console.warn('Failed to read language preferences; using Korean for this launch.', error);
      return defaultPreferences();
    }
    if (loaded.kind === 'ready') return loaded.snapshot;
    const preferences: AppPreferences = loaded.kind === 'missing'
      ? { schemaVersion: 1, locale: firstRunLocale }
      : loaded.backup ?? defaultPreferences();
    try {
      await this.save(preferences);
    } catch (error) {
      console.warn('Failed to persist language preferences; keeping the selected language for this launch.', error);
    }
    return preferences;
  }
}
