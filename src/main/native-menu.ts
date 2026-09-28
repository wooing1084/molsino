import type { MenuItemConstructorOptions } from 'electron';
import { translate, type AppLocale } from '../shared/i18n';

export interface NativeMenuActions {
  reveal(): void;
  hide(): void;
  passthrough(): void;
  setSmall(): void;
  setDefault(): void;
  setLarge(): void;
  quit(): void;
  selectLocale(locale: AppLocale): void;
}

function languageItems(locale: AppLocale, selectLocale: NativeMenuActions['selectLocale']): MenuItemConstructorOptions[] {
  return [
    { id: 'language-ko', label: '한국어', type: 'radio', checked: locale === 'ko', click: () => selectLocale('ko') },
    { id: 'language-en', label: 'English', type: 'radio', checked: locale === 'en', click: () => selectLocale('en') },
  ];
}

export function buildTrayMenuTemplate(locale: AppLocale, actions: NativeMenuActions): MenuItemConstructorOptions[] {
  return [
    { label: translate(locale, 'tray.show'), click: actions.reveal },
    { label: translate(locale, 'tray.hide'), click: actions.hide },
    { label: translate(locale, 'tray.passthrough'), click: actions.passthrough },
    { type: 'separator' },
    { label: translate(locale, 'tray.small'), click: actions.setSmall },
    { label: translate(locale, 'tray.default'), click: actions.setDefault },
    { label: translate(locale, 'tray.large'), click: actions.setLarge },
    { type: 'separator' },
    { label: translate(locale, 'language.label'), submenu: languageItems(locale, actions.selectLocale) },
    { type: 'separator' },
    { label: translate(locale, 'common.quit'), click: actions.quit },
  ];
}

export function buildApplicationMenuTemplate(platform: NodeJS.Platform, locale: AppLocale,
  selectLocale: NativeMenuActions['selectLocale']): MenuItemConstructorOptions[] | null {
  if (platform !== 'darwin') return null;
  return [
    { role: 'appMenu' },
    { label: translate(locale, 'language.label'), submenu: languageItems(locale, selectLocale) },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
}
