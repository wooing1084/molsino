import { app, type BrowserWindow } from 'electron';
export function configurePlatformWindow(window: BrowserWindow): void {
  window.setMenuBarVisibility(false);
  if (process.platform === 'darwin') {
    window.setAlwaysOnTop(true, 'floating');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // setVisibleOnAllWorkspaces can flip activation policy to accessory,
    // which hides the Dock icon. Re-assert it explicitly.
    void app.dock?.show();
  } else {
    window.setAlwaysOnTop(true);
  }
}
