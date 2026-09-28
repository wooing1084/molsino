import { blackjackSnapshot } from './support/app-game';
import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, launchApp, relaunchApp, type LaunchedApp } from './support/app';
import { fixturePath } from './support/fixtures';
import { getPrimaryWorkArea, setWindowBounds } from './support/resize';

let launched: LaunchedApp;

test.afterEach(async () => {
  if (launched) await closeApp(launched);
});

test('S10.5-01 금액 숫자칸을 텍스트 필드로 바꿔 센트 베팅을 저장한다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('player-blackjack') });
  expect(await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocusable())).toBe(false);
  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  const field = launched.page.getByRole('textbox', { name: '베팅 금액' });
  await expect(field).toBeVisible();
  await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocusable())).toBe(true);
  await field.fill('1');
  await field.press('Enter');
  await expect(launched.page.locator('.bet output')).toHaveText('$1.00');
  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  await field.fill('1.5');
  await field.press('Enter');
  await expect(launched.page.locator('.bet output')).toHaveText('$1.50');
  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  await field.fill('1.25');
  await field.press('Enter');
  await expect(launched.page.locator('.bet output')).toHaveText('$1.25');
  await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocusable())).toBe(false);
  expect(await launched.page.evaluate(blackjackSnapshot)).toMatchObject({ pendingBetCents: 125 });
  const saved = JSON.parse(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8'));
  expect(saved.games.blackjack.pendingBetCents).toBe(125);
  launched = await relaunchApp(launched);
  await expect(launched.page.locator('.bet output')).toHaveText('$1.25');
  const area = await getPrimaryWorkArea(launched.app);
  await setWindowBounds(launched.app, { x: area.x + 40, y: area.y + 40, width: 220, height: 150 });
  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  const editorBox = await launched.page.getByRole('textbox', { name: '베팅 금액' }).boundingBox();
  const betBox = await launched.page.locator('.bet').boundingBox();
  expect(editorBox).not.toBeNull();
  expect(betBox).not.toBeNull();
  expect(editorBox!.x).toBeGreaterThanOrEqual(betBox!.x);
  expect(editorBox!.x + editorBox!.width).toBeLessThanOrEqual(betBox!.x + betBox!.width);
  expect(editorBox!.y + editorBox!.height).toBeLessThanOrEqual(150);
});

test('S10.5-02 잘못된 입력을 거부하고 취소·숨김에서 포커스를 해제한다', async () => {
  launched = await launchApp();
  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  const field = launched.page.getByRole('textbox', { name: '베팅 금액' });
  for (const invalid of ['', '0.99', '1.001', '1e2', '-1', 'abc', '100.01']) {
    await field.fill(invalid);
    await field.press('Enter');
    await expect(field).toBeVisible();
    await expect(launched.page.getByRole('button', { name: '딜', exact: true })).toBeDisabled();
  }
  const rejectedDeal = await launched.page.evaluate(async () => {
    const state = await window.molsino.getSnapshot().then(s => ({ ...s, ...s.blackjack!, phase: s.recovery ? 'recovery' as const : s.blackjack?.phase ?? 'betting' as const }));
    return window.molsino.dispatch({ sessionId: state.sessionId, commandId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'blackjack', action: { type: 'deal' } } });
  });
  expect(rejectedDeal).toMatchObject({ ok: false, error: 'INVALID_ACTION' });
  expect(await launched.page.evaluate(blackjackSnapshot)).toMatchObject({ pendingBetCents: 100 });
  await field.press('Escape');
  await expect(launched.page.locator('.bet output')).toHaveText('$1.00');
  await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocusable())).toBe(false);

  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  await launched.page.getByRole('textbox', { name: '베팅 금액' }).fill('1.50');
  await launched.page.locator('.cards').click();
  await expect(launched.page.locator('.bet output')).toHaveText('$1.00');
  await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocusable())).toBe(false);

  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  await launched.page.evaluate(() => window.molsino.windowCommand('collapse'));
  await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocusable())).toBe(false);
  await launched.page.getByRole('button', { name: '펼치기' }).click();
  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  await launched.page.reload();
  await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocusable())).toBe(false);

  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  await launched.page.evaluate(() => window.molsino.windowCommand('hide'));
  await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocusable())).toBe(false);

  launched = await relaunchApp(launched);
  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  await launched.page.evaluate(() => window.molsino.windowCommand('passthrough'));
  await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocusable())).toBe(false);
});

test('S10.5-03 $1.01 자연 블랙잭 반환금을 센트로 반올림한다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('player-blackjack') });
  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  const field = launched.page.getByRole('textbox', { name: '베팅 금액' });
  await field.fill('1.01');
  await field.press('Enter');
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await expect(launched.page.locator('.balance strong')).toHaveText('$101.52');
  expect(await launched.page.evaluate(blackjackSnapshot)).toMatchObject({
    phase: 'result', balanceCents: 10_152,
    lastResult: { entries: [{ wagerCents: 101, returnedCents: 253 }] },
  });
});

test('S10.5-05 Lv3 한도 안에서 잔액 전체까지 센트 베팅한다', async () => {
  launched = await launchApp();
  const savedPath = join(launched.userDataDir, 'app-session.json');
  const saved = JSON.parse(await readFile(savedPath, 'utf8'));
  saved.wallet.balanceCents = 60_001;
  // N04: retain an already entered Lv3 after losses; its $1,000 cap exceeds the current bankroll.
  saved.table = { selectedLevel: 3, bestBankrollCents: 250_000 };
  await writeFile(savedPath, JSON.stringify(saved));
  launched = await relaunchApp(launched);
  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  const field = launched.page.getByRole('textbox', { name: '베팅 금액' });
  await field.fill('600.02');
  await field.press('Enter');
  await expect(field).toBeVisible();
  await field.fill('600.01');
  await field.press('Enter');
  await expect(launched.page.locator('.bet output')).toHaveText('$600.01');
  await expect(launched.page.getByRole('button', { name: '베팅 올리기' })).toBeDisabled();
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await expect.poll(async () => (await launched.page.evaluate(blackjackSnapshot)).playerHands[0]?.wagerCents).toBe(60_001);
});

test('S10.5-06 $1.01 서렌더 반환금을 반 센트 올림한다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('late-surrender-eligible') });
  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  const field = launched.page.getByRole('textbox', { name: '베팅 금액' });
  await field.fill('1.01');
  await field.press('Enter');
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await launched.page.getByRole('button', { name: '서렌더' }).click();
  await expect(launched.page.locator('.balance strong')).toHaveText('$99.50');
  expect(await launched.page.evaluate(blackjackSnapshot)).toMatchObject({
    phase: 'result', lastResult: { entries: [{ wagerCents: 101, returnedCents: 51 }] },
  });
});

for (const balanceAfterLoss of [100, 99]) {
  test(`S10.5-04 패배 후 잔액 ${balanceAfterLoss}센트의 다음 판 경계`, async () => {
    launched = await launchApp({ shoeFixture: fixturePath('standard-loss') });
    const savedPath = join(launched.userDataDir, 'app-session.json');
    const saved = JSON.parse(await readFile(savedPath, 'utf8'));
    saved.wallet.balanceCents = balanceAfterLoss + 100;
    await writeFile(savedPath, JSON.stringify(saved));
    launched = await relaunchApp(launched, { shoeFixture: fixturePath('standard-loss') });
    await launched.page.getByRole('button', { name: '딜', exact: true }).click();
    await launched.page.getByRole('button', { name: '스탠드' }).click();
    await expect(launched.page.locator('.balance strong')).toHaveText(balanceAfterLoss === 100 ? '$1.00' : '$0.99');
    if (balanceAfterLoss === 100) {
      await launched.page.getByRole('button', { name: '다음 판' }).click();
      await expect(launched.page.getByRole('button', { name: '딜', exact: true })).toBeEnabled();
      await launched.page.getByRole('button', { name: '딜', exact: true }).click();
      await expect.poll(async () => (await launched.page.evaluate(blackjackSnapshot)).phase).not.toBe('betting');
    } else {
      await expect(launched.page.getByRole('button', { name: '다음 판' })).toHaveCount(0);
      await expect(launched.page.locator('footer[role="status"]')).toContainText('잔액 부족');
      await expect(launched.page.getByRole('button', { name: '메뉴에서 새 시작' })).toBeVisible();
      const rejectedNextRound = await launched.page.evaluate(async () => {
        const state = await window.molsino.getSnapshot().then(s => ({ ...s, ...s.blackjack!, phase: s.recovery ? 'recovery' as const : s.blackjack?.phase ?? 'betting' as const }));
        return window.molsino.dispatch({ sessionId: state.sessionId, commandId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'blackjack', action: { type: 'nextRound' } } });
      });
      expect(rejectedNextRound).toMatchObject({ ok: false, error: 'INVALID_ACTION' });
      await launched.page.getByRole('button', { name: '메뉴에서 새 시작' }).click();
      await launched.page.getByRole('button', { name: '새 시작', exact: true }).click();
      await launched.page.getByRole('button', { name: '초기화 확정' }).click();
      await expect(launched.page.locator('.balance strong')).toHaveText('$100.00');
    }
  });
}
