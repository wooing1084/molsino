import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeApp, launchApp, relaunchApp, type LaunchedApp } from './support/app';
import { fixturePath } from './support/fixtures';

let launched: LaunchedApp;
test.afterEach(async () => { if (launched) await closeApp(launched); });

async function chooseLanguage(locale: 'ko' | 'en'): Promise<void> {
  await launched.app.evaluate(({ Menu }, id) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(`language-${id}`);
    if (!item?.click) throw new Error(`Missing native language menu item: ${id}`);
    item.click();
  }, locale);
}

test('N06-01/02 네이티브 메뉴의 영어가 즉시 적용되고 재실행·reload·새 시작 뒤 유지된다', async () => {
  test.skip(process.platform !== 'darwin', 'macOS application menu callback automation');
  launched = await launchApp({ startAtMenu: true });
  const before = await launched.page.evaluate(() => window.molsino.getSnapshot());
  await expect(launched.page.getByRole('button', { name: /언어|language/i })).toHaveCount(0);

  await chooseLanguage('en');
  await expect(launched.page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(launched.page.getByRole('button', { name: 'Blackjack', exact: true })).toBeVisible();
  await expect(launched.page.getByRole('button', { name: 'Start Over', exact: true })).toBeVisible();
  expect(await launched.page.evaluate(() => window.molsino.getSnapshot())).toEqual(before);
  expect(JSON.parse(await readFile(join(launched.userDataDir, 'preferences.json'), 'utf8'))).toEqual({ schemaVersion: 1, locale: 'en' });

  await launched.page.reload();
  await expect(launched.page.getByRole('button', { name: 'Start Over', exact: true })).toBeVisible();
  launched = await relaunchApp(launched, { startAtMenu: true });
  await expect(launched.page.locator('html')).toHaveAttribute('lang', 'en');
  await launched.page.getByRole('button', { name: 'Start Over', exact: true }).click();
  await launched.page.getByRole('button', { name: 'Confirm Reset', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: 'Start Over', exact: true })).toBeVisible();
  expect(JSON.parse(await readFile(join(launched.userDataDir, 'preferences.json'), 'utf8')).locale).toBe('en');
});

test('N06-03 진행 중 전환은 판과 공개 상태를 유지하고 사용자 문구만 바꾼다', async () => {
  test.skip(process.platform !== 'darwin', 'macOS application menu callback automation');
  launched = await launchApp({ shoeFixture: fixturePath('standard-win') });
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: '스탠드', exact: true })).toBeVisible();
  const before = await launched.page.evaluate(() => window.molsino.getSnapshot());

  await chooseLanguage('en');
  await expect(launched.page.getByRole('button', { name: 'Stand', exact: true })).toBeVisible();
  expect(await launched.page.evaluate(() => window.molsino.getSnapshot())).toEqual(before);
  await launched.page.getByRole('button', { name: 'Stand', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: 'Next Round', exact: true })).toBeVisible();
  expect(await launched.page.locator('body').innerText()).not.toMatch(/[가-힣]/);

  await chooseLanguage('ko');
  await expect(launched.page.getByRole('button', { name: '다음 판', exact: true })).toBeVisible();
});

test('N06-04/06 영어 메인·레벨·세 게임이 최소 창에서 핵심 조작을 유지한다', async ({}, testInfo) => {
  test.skip(process.platform !== 'darwin', 'macOS application menu callback automation');
  launched = await launchApp({ startAtMenu: true });
  await chooseLanguage('en');
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ width: 220, height: 150 }));

  await launched.page.getByRole('button', { name: 'Table level', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  await expect(launched.page.getByRole('region', { name: 'Table level selector' })).toBeVisible();
  await launched.page.getByRole('button', { name: 'Back', exact: true }).click();

  await launched.page.getByRole('button', { name: 'Blackjack', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: 'Deal', exact: true })).toBeVisible();
  await expect(launched.page.getByLabel('Betting limits')).toContainText('Min $1');
  await launched.page.getByRole('button', { name: 'Menu', exact: true }).click();

  await launched.page.getByRole('button', { name: 'Baccarat', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: 'Player bet', exact: true })).toBeVisible();
  await launched.page.getByRole('button', { name: 'Menu', exact: true }).click();

  await launched.page.getByRole('button', { name: 'Big Wheel', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: 'Spin', exact: true })).toBeVisible();
  await expect(launched.page.getByText('Silver 1:1', { exact: true })).toBeVisible();
  expect(await launched.page.locator('body').innerText()).not.toMatch(/[가-힣]/);
  const spin = await launched.page.getByRole('button', { name: 'Spin', exact: true }).boundingBox();
  expect(spin).not.toBeNull();
  expect(spin!.y + spin!.height).toBeLessThanOrEqual(150);
  await launched.page.screenshot({ path: testInfo.outputPath('english-bigwheel-220x150.png') });
});

test('N06-05 영어 복구·금액 오류·불투명도 조절창은 한국어 raw 문구를 노출하지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'molsino-localization-'));
  await writeFile(join(dir, 'preferences.json'), JSON.stringify({ schemaVersion: 1, locale: 'en' }));
  await writeFile(join(dir, 'app-session.json'), '{broken');
  launched = await launchApp({ userDataDir: dir, startAtMenu: true });
  await expect(launched.page.getByRole('button', { name: 'Start New Game', exact: true })).toBeVisible();
  expect(await launched.page.locator('body').innerText()).not.toMatch(/[가-힣]/);
  await launched.page.getByRole('button', { name: 'Start New Game', exact: true }).click();
  await launched.page.getByRole('button', { name: 'Blackjack', exact: true }).click();
  await launched.page.getByRole('button', { name: 'Bet amount', exact: true }).click();
  await launched.page.getByRole('textbox', { name: 'Bet amount', exact: true }).fill('oops');
  await launched.page.getByRole('textbox', { name: 'Bet amount', exact: true }).press('Enter');
  await expect(launched.page.getByRole('status')).toContainText('Enter a number with up to two decimal places.');

  await launched.page.getByRole('button', { name: 'Toggle black/white', exact: true }).hover();
  await expect.poll(() => launched.app.windows().length).toBe(2);
  const panel = launched.app.windows()[1]!;
  await expect(panel.getByRole('slider', { name: 'Opacity', exact: true })).toBeVisible();
});

test('N06-07 설정 저장 실패는 현재 언어와 메뉴 체크 상태를 유지한다', async () => {
  test.skip(process.platform !== 'darwin', 'macOS application menu callback automation');
  launched = await launchApp({ startAtMenu: true });
  await mkdir(join(launched.userDataDir, 'preferences.backup.json'));
  await launched.app.evaluate(({ dialog }) => {
    (globalThis as { localeWarning?: string }).localeWarning = undefined;
    dialog.showMessageBox = ((options: Electron.MessageBoxOptions) => {
      (globalThis as { localeWarning?: string }).localeWarning = options.message;
      return Promise.resolve({ response: 0, checkboxChecked: false });
    }) as typeof dialog.showMessageBox;
  });

  await chooseLanguage('en');
  await expect.poll(() => launched.app.evaluate(() => (globalThis as { localeWarning?: string }).localeWarning)).toBe('언어 설정을 저장할 수 없습니다.');
  await expect(launched.page.getByRole('button', { name: '블랙잭', exact: true })).toBeVisible();
  expect(await launched.page.locator('html').getAttribute('lang')).toBe('ko');
  expect(JSON.parse(await readFile(join(launched.userDataDir, 'preferences.json'), 'utf8')).locale).toBe('ko');
  expect(await launched.app.evaluate(({ Menu }) => ({
    ko: Menu.getApplicationMenu()?.getMenuItemById('language-ko')?.checked,
    en: Menu.getApplicationMenu()?.getMenuItemById('language-en')?.checked,
  }))).toEqual({ ko: true, en: false });
});
