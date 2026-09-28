import { blackjackSnapshot } from './support/app-game';
import { expect, test } from '@playwright/test';
import { closeApp, launchApp, relaunchApp, type LaunchedApp } from './support/app';
import { fixturePath } from './support/fixtures';
import { getPrimaryWorkArea, getWindowBounds, setWindowBounds } from './support/resize';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp({ shoeFixture: fixturePath('standard-win') });
});

test.afterEach(async () => {
  await closeApp(launched);
});

test('S10-01 접힘은 140×30 DIP이고 반복 전환 후에도 펼친 크기를 복원한다', async () => {
  const area = await getPrimaryWorkArea(launched.app);
  const expanded = { x: area.x + 100, y: area.y + 100, width: 320, height: 210 };
  await setWindowBounds(launched.app, expanded);

  await launched.page.evaluate(() => window.molsino.windowCommand('collapse'));
  await expect.poll(() => getWindowBounds(launched.app)).toMatchObject({ width: 140, height: 30 });
  await expect(launched.page.getByRole('button', { name: '펼치기' })).toBeVisible();
  await expect(launched.page.locator('.cards')).toHaveCount(0);
  await launched.page.evaluate(() => window.molsino.windowCommand('collapse'));
  await expect.poll(() => getWindowBounds(launched.app)).toMatchObject({ width: 140, height: 30 });
  await expect(launched.page.evaluate(() => window.molsino.resize({ phase: 'start', edge: 'se' }))).rejects.toThrow();

  await launched.page.getByRole('button', { name: '펼치기' }).click();
  await expect.poll(() => getWindowBounds(launched.app)).toEqual(expanded);
  await launched.page.evaluate(() => window.molsino.windowCommand('expand'));
  await expect.poll(() => getWindowBounds(launched.app)).toEqual(expanded);
});

test('S10-02 진행 중 판을 접었다 펼쳐도 카드·잔액·revision을 유지한다', async () => {
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: '스탠드' })).toBeVisible();
  const before = await launched.page.evaluate(blackjackSnapshot);

  await launched.page.evaluate(() => window.molsino.windowCommand('collapse'));
  await expect(launched.page.getByText('진행 중', { exact: false })).toBeVisible();
  expect(await launched.page.evaluate(blackjackSnapshot)).toEqual(before);
  await launched.page.getByRole('button', { name: '펼치기' }).click();
  await expect(launched.page.getByRole('button', { name: '스탠드' })).toBeVisible();
  expect(await launched.page.evaluate(blackjackSnapshot)).toEqual(before);
});

test('S10-03 슬라이더는 20–100%이고 접힘·reload 중 유지, 재실행 시 65%로 초기화한다', async () => {
  await launched.page.getByRole('button', { name: '흰색/검정 전환' }).hover();
  await expect.poll(() => launched.app.windows().length).toBe(2);
  let panel = launched.app.windows()[1]!;
  const slider = panel.getByRole('slider', { name: '불투명도' });
  await expect(slider).toHaveValue('65');
  await slider.click({ position: { x: 4, y: 12 } });
  await expect.poll(async () => (await launched.page.evaluate(() => window.molsino.getOverlayState())).opacityPercent).toBe(20);
  await expect.poll(() => launched.page.evaluate(() => getComputedStyle(document.querySelector('.overlay')!).opacity)).toBe('0.2');
  await slider.focus();
  await slider.press('Home');
  await expect(slider).toHaveValue('20');
  expect(await launched.page.evaluate(() => window.molsino.getOverlayState())).toMatchObject({ opacityPercent: 20 });
  await expect(launched.page.evaluate(() => window.molsino.setOpacity(15))).rejects.toThrow();
  await expect(launched.page.evaluate(() => window.molsino.setOpacity(21))).rejects.toThrow();

  await slider.press('End');
  await expect(slider).toHaveValue('100');
  expect(await launched.page.evaluate(() => window.molsino.getOverlayState())).toMatchObject({ opacityPercent: 100 });
  await slider.press('Home');
  await expect.poll(() => launched.page.evaluate(() => window.molsino.getOverlayState())).toMatchObject({ opacityPercent: 20 });
  await launched.page.evaluate(() => window.molsino.windowCommand('collapse'));
  await expect(launched.page.getByRole('button', { name: '펼치기' })).toBeVisible();
  await launched.page.getByRole('button', { name: '펼치기' }).click();
  await launched.page.getByRole('button', { name: '흰색/검정 전환' }).hover();
  await expect(panel.getByRole('slider', { name: '불투명도' })).toHaveValue('20');
  await launched.page.reload();
  await launched.page.getByRole('button', { name: '흰색/검정 전환' }).hover();
  await expect(panel.getByRole('slider', { name: '불투명도' })).toHaveValue('20');
  await launched.page.mouse.move(50, 50);
  await expect.poll(() => launched.page.evaluate(() => getComputedStyle(document.querySelector('.overlay')!).opacity)).toBe('1');
  await launched.page.mouse.move(-30, -30);
  await launched.page.waitForTimeout(100);
  expect(await launched.page.evaluate(() => getComputedStyle(document.querySelector('.overlay')!).opacity)).toBe('1');
  await expect.poll(() => launched.page.evaluate(() => getComputedStyle(document.querySelector('.overlay')!).opacity)).toBe('0.2');

  await launched.page.getByRole('button', { name: '베팅 올리기' }).click();
  await expect(launched.page.locator('output')).toHaveText('$2.00');
  await launched.page.evaluate(() => window.molsino.windowCommand('collapse'));
  launched = await relaunchApp(launched);
  await expect.poll(async () => (await launched.page.evaluate(() => window.molsino.getOverlayState())).visibility).toBe('expanded');
  await launched.page.mouse.move(-30, -30);
  await launched.page.getByRole('button', { name: '흰색/검정 전환' }).hover();
  await expect.poll(() => launched.app.windows().length).toBe(2);
  panel = launched.app.windows()[1]!;
  await expect(panel.getByRole('slider', { name: '불투명도' })).toHaveValue('65');
  await expect(launched.page.locator('output')).toHaveText('$2.00');
  expect(await launched.page.evaluate(() => window.molsino.getOverlayState())).toMatchObject({ visibility: 'expanded', opacityPercent: 65 });
});

test('S10-06 색상 버튼 호버의 조절창은 화면 가장자리에서 열리는 방향을 바꾼다', async () => {
  const area = await getPrimaryWorkArea(launched.app);
  const button = launched.page.getByRole('button', { name: '흰색/검정 전환' });
  await setWindowBounds(launched.app, { x: area.x + 3, y: area.y + 10, width: 220, height: 150 });
  await button.hover();
  await expect.poll(() => launched.app.windows().length).toBe(2);
  const panel = launched.app.windows()[1]!;
  const panelWindow = await launched.app.browserWindow(panel);
  const leftBounds = await panelWindow.evaluate(window => window.getBounds());
  const leftOverlay = await getWindowBounds(launched.app);
  const buttonBox = await button.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(leftBounds.x).toBeGreaterThanOrEqual(leftOverlay.x + buttonBox!.x + buttonBox!.width);
  expect(leftBounds.x + leftBounds.width).toBeLessThanOrEqual(area.x + area.width);

  await setWindowBounds(launched.app, { x: area.x + area.width - 223, y: area.y + 10, width: 220, height: 150 });
  await launched.page.mouse.move(0, 100);
  await button.hover();
  const rightBounds = await panelWindow.evaluate(window => window.getBounds());
  const rightOverlay = await getWindowBounds(launched.app);
  const rightButtonBox = await button.boundingBox();
  expect(rightButtonBox).not.toBeNull();
  expect(rightBounds.x + rightBounds.width).toBeLessThanOrEqual(rightOverlay.x + rightButtonBox!.x);
  expect(rightBounds.x).toBeGreaterThanOrEqual(area.x);
  expect(rightBounds.y).toBeGreaterThanOrEqual(area.y);
  expect(rightBounds.y + rightBounds.height).toBeLessThanOrEqual(area.y + area.height);
  await panelWindow.dispose();
});

test('S10-07 조절창으로 마우스를 옮겨도 유지되고 벗어나면 닫힌다', async () => {
  await launched.page.getByRole('button', { name: '흰색/검정 전환' }).hover();
  await expect.poll(() => launched.app.windows().length).toBe(2);
  const panel = launched.app.windows()[1]!;
  const panelWindow = await launched.app.browserWindow(panel);
  await panel.getByRole('slider', { name: '불투명도' }).hover();
  await launched.page.waitForTimeout(350);
  expect(await panelWindow.evaluate(window => window.isVisible())).toBe(true);
  await launched.page.mouse.move(-40, -40);
  await expect.poll(() => panelWindow.evaluate(window => window.isVisible())).toBe(false);
  await panelWindow.dispose();
});

test('S10-08 조절창 문서는 불투명도만 바꾸고 게임·창 명령은 실행하지 못한다', async () => {
  await launched.page.getByRole('button', { name: '흰색/검정 전환' }).hover();
  await expect.poll(() => launched.app.windows().length).toBe(2);
  const panel = launched.app.windows()[1]!;
  expect(await panel.evaluate(() => window.molsino.getOverlayState())).toMatchObject({ opacityPercent: 65 });
  await expect(panel.evaluate(blackjackSnapshot)).rejects.toThrow();
  await expect(panel.evaluate(() => window.molsino.windowCommand('hide'))).rejects.toThrow();
  await panel.evaluate(() => window.molsino.setOpacity(20));
  expect(await launched.page.evaluate(() => window.molsino.getOverlayState())).toMatchObject({ opacityPercent: 20 });
});

test('S10-09 헤더 접기 버튼은 없고 Alt+백틱 숨기기 등록·복원 경로를 유지한다', async () => {
  await expect(launched.page.getByRole('button', { name: '접기' })).toHaveCount(0);
  expect(await launched.app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Alt+`'))).toBe(true);
  const browserWindow = await launched.app.browserWindow(launched.page);
  await launched.page.getByRole('button', { name: '숨기기' }).click();
  await expect.poll(() => browserWindow.evaluate(nativeWindow => nativeWindow.isVisible())).toBe(false);
  const hiddenState = await launched.page.evaluate(() => window.molsino.getOverlayState());
  expect(hiddenState.visibility).toBe('hidden');
  await launched.page.evaluate(() => window.molsino.windowCommand('hide'));
  expect(await launched.page.evaluate(() => window.molsino.getOverlayState())).toEqual(hiddenState);
  expect(await browserWindow.evaluate(nativeWindow => nativeWindow.isVisible())).toBe(false);
  expect(await launched.app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Alt+`'))).toBe(true);
  await launched.app.evaluate(({ app }) => { app.emit('activate'); });
  await expect.poll(() => browserWindow.evaluate(nativeWindow => nativeWindow.isVisible())).toBe(true);
  await browserWindow.dispose();
});

for (const mode of ['hide', 'collapse'] as const) test(`S10-${mode === 'hide' ? '04' : '05'} ${mode === 'hide' ? '숨긴' : '접힌'} 동안에도 딜러가 계속 진행한다`, async () => {
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: '스탠드' })).toBeVisible();
  const initial = await launched.page.evaluate(blackjackSnapshot);
  const handId = initial.playerHands.find(hand => hand.active)!.handId;
  const result = await launched.page.evaluate(async value => {
    const pending = window.molsino.dispatch({ sessionId: value.sessionId, commandId: crypto.randomUUID(), expectedRevision: value.revision,
      action: { type: 'blackjack', action: { type: 'stand', handId: value.handId } } });
    await window.molsino.windowCommand(value.mode);
    return pending;
  }, { sessionId: initial.sessionId, revision: initial.revision, handId, mode });
  expect(result).toMatchObject({ ok: true, state: { blackjack: { phase: 'dealerTurn' } } });
  await expect.poll(async () => (await launched.page.evaluate(blackjackSnapshot)).phase).toBe('result');
  const completed = await launched.page.evaluate(blackjackSnapshot);
  expect(completed.revision).toBeGreaterThan(result.state.revision);

  if (mode === 'hide') await launched.app.evaluate(({ app }) => { app.emit('activate'); });
  else await launched.page.getByRole('button', { name: '펼치기' }).click();
  await expect(launched.page.getByRole('button', { name: '다음 판' })).toBeVisible();
  expect(await launched.page.evaluate(blackjackSnapshot)).toEqual(completed);
});
