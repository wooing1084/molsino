// S01: 게임 엔진과 무관한 투명 Overlay 커스텀 리사이즈 전체 배관 검증.
import { expect, test } from '@playwright/test';
import { closeApp, launchApp, type LaunchedApp } from './support/app';
import {
  dragCorner,
  getPrimaryWorkArea,
  getWindowBounds,
  installCursorStub,
  setCursorStub,
  setWindowBounds,
} from './support/resize';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await closeApp(launched);
});

test('S01-01 모서리 핸들이 IPC를 거쳐 실제 창 크기를 최댓값으로 제한한다', async () => {
  const area = await getPrimaryWorkArea(launched.app);
  const initial = { x: area.x + 80, y: area.y + 80, width: 280, height: 180 };
  await setWindowBounds(launched.app, initial);
  await installCursorStub(launched.app, { x: initial.x + initial.width, y: initial.y + initial.height });

  await dragCorner(
    launched.app,
    launched.page,
    '오른쪽 아래 모서리로 창 크기 조절',
    { x: initial.x + 1_000, y: initial.y + 1_000 },
  );

  await expect.poll(() => getWindowBounds(launched.app)).toMatchObject({
    x: initial.x,
    y: initial.y,
    width: 420,
    height: 280,
  });
});

test('S01-02 API는 최솟값을 적용하고 종료된 token의 재사용을 거부한다', async () => {
  const area = await getPrimaryWorkArea(launched.app);
  const initial = { x: area.x + 100, y: area.y + 100, width: 280, height: 180 };
  await setWindowBounds(launched.app, initial);
  await installCursorStub(launched.app, { x: initial.x, y: initial.y });

  const started = await launched.page.evaluate(() => window.blackjack.resize({ phase: 'start', edge: 'nw' }));
  expect(started.token).toBeTruthy();
  const token = started.token!;
  await setCursorStub(launched.app, { x: initial.x + 10_000, y: initial.y + 10_000 });
  await launched.page.evaluate(value => window.blackjack.resize({ phase: 'end', token: value }), token);

  const minimized = await getWindowBounds(launched.app);
  expect(minimized).toMatchObject({
    x: initial.x + initial.width - 220,
    y: initial.y + initial.height - 150,
    width: 220,
    height: 150,
  });
  await expect(launched.page.evaluate(value => window.blackjack.resize({ phase: 'update', token: value }), token))
    .rejects.toThrow();
  await expect(getWindowBounds(launched.app)).resolves.toEqual(minimized);
});

test('S01-03 cancel은 세션을 만료하고 창 크기를 유지한다', async () => {
  const before = await getWindowBounds(launched.app);
  await installCursorStub(launched.app, { x: before.x + before.width, y: before.y + before.height });
  const started = await launched.page.evaluate(() => window.blackjack.resize({ phase: 'start', edge: 'se' }));
  const token = started.token!;
  await launched.page.evaluate(value => window.blackjack.resize({ phase: 'cancel', token: value }), token);
  await setCursorStub(launched.app, { x: before.x + 1_000, y: before.y + 1_000 });

  await expect(launched.page.evaluate(value => window.blackjack.resize({ phase: 'update', token: value }), token))
    .rejects.toThrow();
  await expect(getWindowBounds(launched.app)).resolves.toEqual(before);
});

test('S01-04 220×150 DIP에서 필수 UI가 viewport 안에 남는다', async () => {
  const area = await getPrimaryWorkArea(launched.app);
  await setWindowBounds(launched.app, { x: area.x + 40, y: area.y + 40, width: 220, height: 150 });

  const selectors = ['header', '.balance', '.cards', '.bet', 'footer'];
  const layout = await launched.page.evaluate(items => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    elements: items.map(selector => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing element: ${selector}`);
      const rect = element.getBoundingClientRect();
      return { selector, top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
    }),
  }), selectors);

  expect(layout.viewport).toEqual({ width: 220, height: 150 });
  for (const rect of layout.elements) {
    expect(rect.left, rect.selector).toBeGreaterThanOrEqual(0);
    expect(rect.top, rect.selector).toBeGreaterThanOrEqual(0);
    expect(rect.right, rect.selector).toBeLessThanOrEqual(layout.viewport.width);
    expect(rect.bottom, rect.selector).toBeLessThanOrEqual(layout.viewport.height);
  }
});
