import { expect, test } from '@playwright/test';
import { closeApp, launchApp, type LaunchedApp } from './support/app';

test.skip(process.platform !== 'darwin', 'macOS Dock 전용 검증');

let launched: LaunchedApp;

test.afterEach(async () => {
  if (launched) await closeApp(launched);
});

test('macOS E2E 앱은 실행 중 Dock 아이콘을 표시하지 않는다', async () => {
  launched = await launchApp();
  await expect.poll(() => launched.app.evaluate(({ app }) => app.dock?.isVisible())).toBe(false);
  expect(await launched.app.evaluate(() => process.env.MOLSINO_TEST_HIDE_DOCK)).toBe('1');
});
