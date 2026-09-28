import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { buildApplicationMenuTemplate, buildTrayMenuTemplate, type NativeMenuActions } from '../../src/main/native-menu';

function actions(): NativeMenuActions {
  return {
    reveal: vi.fn(), hide: vi.fn(), passthrough: vi.fn(), setSmall: vi.fn(), setDefault: vi.fn(), setLarge: vi.fn(),
    quit: vi.fn(), selectLocale: vi.fn(),
  };
}

function submenu(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] {
  const item = template.find(entry => entry.label === label);
  if (!item || !Array.isArray(item.submenu)) throw new Error(`Missing submenu: ${label}`);
  return item.submenu;
}

describe('native localization menus', () => {
  it('uses a macOS application menu but no Windows window menu bar', () => {
    const callback = vi.fn();
    const mac = buildApplicationMenuTemplate('darwin', 'ko', callback);
    expect(mac?.map(item => item.role ?? item.label)).toEqual(['appMenu', '언어 / Language', 'editMenu', 'windowMenu']);
    expect(buildApplicationMenuTemplate('win32', 'ko', callback)).toBeNull();
  });

  it.each(['darwin', 'win32'] as const)('puts Korean and English radio choices in the %s tray menu', platform => {
    const callbacks = actions();
    const template = buildTrayMenuTemplate('en', callbacks);
    expect(template.map(item => item.label).filter(Boolean)).toContain('Show / Disable Click-through');
    const languages = submenu(template, '언어 / Language');
    expect(languages.map(item => ({ id: item.id, checked: item.checked }))).toEqual([
      { id: 'language-ko', checked: false }, { id: 'language-en', checked: true },
    ]);
    languages[0]!.click?.({} as never, undefined as never, {} as never);
    expect(callbacks.selectLocale).toHaveBeenCalledWith('ko');
    expect(platform).toMatch(/darwin|win32/);
  });

  it('localizes tray commands when Korean is selected', () => {
    const template = buildTrayMenuTemplate('ko', actions());
    expect(template.map(item => item.label).filter(Boolean)).toEqual([
      '보이기 / 클릭 통과 해제', '숨기기', '클릭 통과', '작게', '기본 크기', '크게', '언어 / Language', '종료',
    ]);
  });
});
