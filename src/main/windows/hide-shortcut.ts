export const TOGGLE_SHORTCUT = 'Alt+`';

interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export function installToggleShortcut(
  shortcuts: ShortcutRegistry,
  toggle: () => void,
  warn: (message: string) => void,
): () => void {
  const registered = shortcuts.register(TOGGLE_SHORTCUT, toggle);
  if (!registered) warn(`창 숨기기/복원 단축키 ${TOGGLE_SHORTCUT}를 등록할 수 없습니다.`);
  return () => { if (registered) shortcuts.unregister(TOGGLE_SHORTCUT); };
}
