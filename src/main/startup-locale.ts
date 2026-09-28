import type { AppLocale } from '../shared/i18n';

export function resolvePreferredLocale(languages: readonly string[]): AppLocale {
  for (const language of languages) {
    const tag = language.trim().replaceAll('_', '-').toLowerCase();
    const base = tag.split('-')[0];
    if (base !== 'ko' && base !== 'en') continue;
    try {
      // Validate the complete tag so malformed supported-language prefixes are skipped.
      Intl.getCanonicalLocales(tag);
    } catch {
      continue;
    }
    return base;
  }
  return 'en';
}

export function readStartupLocale(readLanguages: () => readonly string[]): AppLocale {
  try {
    return resolvePreferredLocale(readLanguages());
  } catch {
    return 'en';
  }
}
