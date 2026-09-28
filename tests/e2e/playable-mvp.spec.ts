import { blackjackSnapshot } from './support/app-game';
import { expect, test } from '@playwright/test';
import { closeApp, launchApp, type LaunchedApp } from './support/app';
import { fixturePath } from './support/fixtures';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp({ shoeFixture: fixturePath('player-blackjack') });
});

test.afterEach(async () => {
  await closeApp(launched);
});

test('MVP-01 베팅을 올리고 딜해 자연 블랙잭을 정산한 뒤 다음 판으로 간다', async () => {
  await expect(launched.page.locator('footer[role="status"]')).toHaveText('베팅 후 딜하세요');
  await launched.page.getByRole('button', { name: '베팅 올리기' }).click();
  await expect(launched.page.locator('output')).toHaveText('$2.00');

  await launched.page.getByRole('button', { name: '딜', exact: true }).click();

  await expect(launched.page.locator('footer[role="status"]')).toHaveText('라운드 +$3.00');
  await expect(launched.page.locator('.balance strong')).toHaveText('$103.00');
  await expect(launched.page.getByText('BJ', { exact: false })).toBeVisible();
  const result = await launched.page.evaluate(blackjackSnapshot);
  expect(result).toMatchObject({ phase: 'result', balanceCents: 10_300 });
  expect(result.dealerHand.hiddenCardCount).toBe(0);

  await launched.page.getByRole('button', { name: '다음 판' }).click();
  await expect(launched.page.getByRole('button', { name: '딜', exact: true })).toBeEnabled();
});
