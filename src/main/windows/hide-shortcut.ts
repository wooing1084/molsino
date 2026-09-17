export const HIDE_SHORTCUT = 'Alt+`';

interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export function installHideShortcut(
  shortcuts: ShortcutRegistry,
  hide: () => void,
  warn: (message: string) => void,
): () => void {
  const registered = shortcuts.register(HIDE_SHORTCUT, hide);
  if (!registered) warn(`창 숨기기 단축키 ${HIDE_SHORTCUT}를 등록할 수 없습니다.`);
  return () => { if (registered) shortcuts.unregister(HIDE_SHORTCUT); };
}
