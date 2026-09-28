import { describe, expect, it } from 'vitest';
import { readStartupLocale, resolvePreferredLocale } from '../../src/main/startup-locale';
import type { AppLocale } from '../../src/shared/i18n';

describe('resolvePreferredLocale', () => {
  it.each([
    { languages: ['ko'], expected: 'ko' },
    { languages: ['ko-KR'], expected: 'ko' },
    { languages: ['en'], expected: 'en' },
    { languages: ['en-US'], expected: 'en' },
    { languages: ['en-GB'], expected: 'en' },
    { languages: ['fr-FR', 'ko-KR', 'en-US'], expected: 'ko' },
    { languages: ['fr-FR', 'en-GB', 'ko-KR'], expected: 'en' },
    { languages: ['fr-FR', 'ja-JP'], expected: 'en' },
    { languages: [], expected: 'en' },
    { languages: ['', ' ', '\t'], expected: 'en' },
    { languages: ['  KO_kr  ', 'en-US'], expected: 'ko' },
    { languages: ['\tEN_gb\n', 'ko-KR'], expected: 'en' },
    { languages: ['ko-Hang-KR'], expected: 'ko' },
    { languages: ['en-US-u-ca-gregory', 'ko-KR'], expected: 'en' },
    { languages: ['en--US', 'en US', '-en', 'english', 'ko-KR'], expected: 'ko' },
    { languages: ['ko--KR', 'ko KR', 'korean', 'en-GB'], expected: 'en' },
    { languages: ['ko-', 'ko_'], expected: 'en' },
  ] satisfies { languages: readonly string[]; expected: AppLocale }[])('chooses $expected for $languages', ({ languages, expected }) => {
    expect(resolvePreferredLocale(languages)).toBe(expected);
  });

  it('does not modify the caller’s preferred language list', () => {
    const languages = Object.freeze(['fr-FR', ' KO_kr ', 'en-GB']);
    expect(resolvePreferredLocale(languages)).toBe('ko');
    expect(languages).toEqual(['fr-FR', ' KO_kr ', 'en-GB']);
  });
});

describe('readStartupLocale', () => {
  it('uses the system’s preference order', () => {
    expect(readStartupLocale(() => ['fr-FR', 'ko-KR', 'en-US'])).toBe('ko');
    expect(readStartupLocale(() => ['fr-FR', 'en-GB', 'ko-KR'])).toBe('en');
  });

  it('falls back to English if the system language query throws', () => {
    expect(readStartupLocale(() => { throw new Error('system languages unavailable'); })).toBe('en');
  });

  it('falls back to English if the system provides no supported language', () => {
    expect(readStartupLocale(() => [])).toBe('en');
    expect(readStartupLocale(() => ['fr-FR', 'ja-JP'])).toBe('en');
  });
});
