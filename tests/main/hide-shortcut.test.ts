import { describe, expect, it, vi } from 'vitest';
import { HIDE_SHORTCUT, installHideShortcut } from '../../src/main/windows/hide-shortcut';

describe('Alt+백틱 숨기기 단축키', () => {
  it('숨기기 콜백만 등록하고 실제 종료 시 해제한다', () => {
    let callback: (() => void) | undefined;
    const register = vi.fn((_accelerator: string, handler: () => void) => { callback = handler; return true; });
    const unregister = vi.fn();
    const hide = vi.fn();
    const warn = vi.fn();

    const dispose = installHideShortcut({ register, unregister }, hide, warn);
    expect(register).toHaveBeenCalledWith('Alt+`', expect.any(Function));
    callback?.();
    callback?.();
    expect(hide).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
    dispose();
    expect(unregister).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledWith(HIDE_SHORTCUT);
  });

  it('다른 앱이 점유해도 예외 없이 경고하고 해제하지 않는다', () => {
    const unregister = vi.fn();
    const warn = vi.fn();
    const dispose = installHideShortcut({ register: () => false, unregister }, vi.fn(), warn);
    expect(warn).toHaveBeenCalledOnce();
    dispose();
    expect(unregister).not.toHaveBeenCalled();
  });
});
