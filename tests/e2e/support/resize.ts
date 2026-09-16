import { expect } from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright';
import type { WindowBounds } from '../window-api';

interface Point { x: number; y: number }

export async function setWindowBounds(app: ElectronApplication, bounds: WindowBounds): Promise<void> {
  const page = app.windows()[0];
  if (!page) throw new Error('Overlay page not found');
  const window = await app.browserWindow(page);
  try { await window.evaluate((browserWindow, value) => browserWindow.setBounds(value), bounds); }
  finally { await window.dispose(); }
}

export async function getWindowBounds(app: ElectronApplication): Promise<WindowBounds> {
  const page = app.windows()[0];
  if (!page) throw new Error('Overlay page not found');
  const window = await app.browserWindow(page);
  try { return await window.evaluate(browserWindow => browserWindow.getBounds()); }
  finally { await window.dispose(); }
}

export async function getPrimaryWorkArea(app: ElectronApplication): Promise<WindowBounds> {
  return app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
}

export async function installCursorStub(app: ElectronApplication, initial: Point): Promise<void> {
  await app.evaluate(({ screen }, point) => {
    const state = globalThis as typeof globalThis & { __molsinoTestCursor?: Point };
    state.__molsinoTestCursor = point;
    screen.getCursorScreenPoint = () => ({ ...(state.__molsinoTestCursor ?? point) });
  }, initial);
}

export async function setCursorStub(app: ElectronApplication, point: Point): Promise<void> {
  await app.evaluate((_, value) => {
    const state = globalThis as typeof globalThis & { __molsinoTestCursor?: Point };
    state.__molsinoTestCursor = value;
  }, point);
}

export async function dragCorner(
  app: ElectronApplication,
  page: Page,
  name: string,
  cursorEnd: Point,
): Promise<void> {
  const handle = page.getByRole('button', { name });
  await handle.waitFor({ state: 'visible', timeout: 5_000 });
  const box = await handle.boundingBox();
  if (!box) throw new Error(`Resize handle not visible: ${name}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(handle).toHaveAttribute('data-resizing', 'true', { timeout: 5_000 });
  await setCursorStub(app, cursorEnd);
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 2);
  await page.mouse.up();
}
