import { app, type BrowserWindow } from 'electron';
export function configurePlatformWindow(window: BrowserWindow): void {
  window.setMenuBarVisibility(false);
  if (process.platform === 'darwin') {
    window.setAlwaysOnTop(true, 'floating');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // setVisibleOnAllWorkspaces can change the process type and hide the Dock icon.
    // Repeated E2E launches should not leave Dock icons; keep the normal app policy.
    if (process.env.MOLSINO_TEST_HIDE_DOCK === '1') app.dock?.hide();
    else void app.dock?.show();
  } else {
    window.setAlwaysOnTop(true);
  }
}
