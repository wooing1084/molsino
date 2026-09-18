import { blackjackSnapshot } from './support/app-game';
import { expect, test } from '@playwright/test';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, launchApp, relaunchApp, type LaunchedApp } from './support/app';
import { fixturePath } from './support/fixtures';

let launched: LaunchedApp;

test.afterEach(async () => {
  if (launched) await closeApp(launched);
});

test('S08-01 저장된 베팅·revision·슈를 정상 종료 뒤 복원한다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('player-blackjack') });
  await launched.page.getByRole('button', { name: '베팅 올리기' }).click();
  await expect(launched.page.locator('output')).toHaveText('$2.00');
  const before = await launched.page.evaluate(blackjackSnapshot);
  const saved = JSON.parse(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8'));
  expect(saved).toMatchObject({ schemaVersion: 2, revision: before.revision, games: { blackjack: { pendingBetCents: 200 } } });

  launched = await relaunchApp(launched, { shoeFixture: fixturePath('standard-loss') });
  await expect(launched.page.locator('output')).toHaveText('$2.00');
  expect((await launched.page.evaluate(blackjackSnapshot)).blackjack).toMatchObject({ ...before.blackjack!, revision: expect.any(Number) });
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await expect(launched.page.locator('.hand.player .card').first()).toHaveText('A♠');
});

test('S08-02 손상 primary에서 backup을 선택하여 복구한다', async () => {
  launched = await launchApp();
  await launched.page.getByRole('button', { name: '베팅 올리기' }).click();
  await expect(launched.page.locator('output')).toHaveText('$2.00');
  const backup = JSON.parse(await readFile(join(launched.userDataDir, 'app-session.backup.json'), 'utf8'));
  expect(backup.revision).toBe(1);
  await writeFile(join(launched.userDataDir, 'app-session.json'), '{ broken');

  launched = await relaunchApp(launched);
  await expect(launched.page.getByRole('button', { name: '백업 복구' })).toBeVisible();
  expect(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8')).toBe('{ broken');
  await launched.page.getByRole('button', { name: '백업 복구' }).click();
  await launched.page.getByRole('button', { name: '블랙잭', exact: true }).click();
  await expect(launched.page.locator('output')).toHaveText('$1.00');
  expect(await launched.page.evaluate(blackjackSnapshot)).toMatchObject({ revision: 3, phase: 'betting' });
});

test('S08-03 미래 schema를 자동 초기화하지 않고 새 게임 선택 시 원본을 보존한다', async () => {
  launched = await launchApp();
  const primaryPath = join(launched.userDataDir, 'app-session.json');
  const future = JSON.parse(await readFile(primaryPath, 'utf8'));
  future.schemaVersion = 999;
  const original = JSON.stringify(future);
  await writeFile(primaryPath, original);

  launched = await relaunchApp(launched);
  await expect(launched.page.getByText('지원하지 않는 저장 버전', { exact: false })).toBeVisible();
  expect(await readFile(primaryPath, 'utf8')).toBe(original);
  await launched.page.getByRole('button', { name: '새 게임 시작' }).click();
  await launched.page.getByRole('button', { name: '블랙잭', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: '딜', exact: true })).toBeEnabled();
  const archived = (await readdir(launched.userDataDir)).filter(name => name.startsWith('app-session.recovery-'));
  expect(archived).toHaveLength(1);
  expect(await readFile(join(launched.userDataDir, archived[0]!), 'utf8')).toBe(original);
});

test('S08-04 강제 종료 후 플레이 중 카드·홀 카드·revision 복원과 명령 재전송 멱등', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('standard-win') });
  const initial = await launched.page.evaluate(blackjackSnapshot);
  const command = { sessionId: initial.sessionId, commandId: 'd2501bbc-64a0-4c38-a620-18846d675c4d',
    expectedRevision: initial.revision, action: { type: 'blackjack' as const, action: { type: 'deal' as const } } };
  const dealt = await launched.page.evaluate(value => window.molsino.dispatch(value), command);
  expect(dealt).toMatchObject({ ok: true, state: { revision: 2, blackjack: { phase: 'playerTurn' } } });
  const before = await launched.page.evaluate(blackjackSnapshot);
  const savedBefore = JSON.parse(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8'));
  expect(savedBefore.games.blackjack.round.dealerHand.cards).toHaveLength(2);
  expect(before.dealerHand.hiddenCardCount).toBe(1);
  launched.app.process().kill('SIGKILL');
  await launched.app.close().catch(() => {});
  launched = await launchApp({ userDataDir: launched.userDataDir, shoeFixture: fixturePath('standard-loss') });
  expect((await launched.page.evaluate(blackjackSnapshot)).blackjack).toMatchObject({ ...before.blackjack!, revision: expect.any(Number) });
  const replay = await launched.page.evaluate(value => window.molsino.dispatch(value), command);
  expect(replay).toMatchObject({ ok: true, state: { revision: 2 } });
  expect((await launched.page.evaluate(blackjackSnapshot)).blackjack).toMatchObject({ ...before.blackjack!, revision: expect.any(Number) });
});

test('S08-05 손상된 primary와 backup에서는 자동 새 세션을 만들지 않는다', async () => {
  launched = await launchApp();
  await launched.page.getByRole('button', { name: '베팅 올리기' }).click();
  await expect(launched.page.locator('output')).toHaveText('$2.00');
  await launched.app.close();
  await writeFile(join(launched.userDataDir, 'app-session.json'), '{bad primary');
  await writeFile(join(launched.userDataDir, 'app-session.backup.json'), '{bad backup');
  launched = await launchApp({ userDataDir: launched.userDataDir });
  await expect(launched.page.getByRole('button', { name: '백업 복구' })).toHaveCount(0);
  await expect(launched.page.getByRole('button', { name: '새 게임 시작' })).toBeVisible();
  expect(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8')).toBe('{bad primary');
});

test('S08-06 컷 경계 저장 세션에서 다음 판 시작 시에만 새 슈로 교체한다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('shoe-near-cut') });
  const primaryPath = join(launched.userDataDir, 'app-session.json');
  const saved = JSON.parse(await readFile(primaryPath, 'utf8'));
  const shoe = saved.games.blackjack.shoe;
  shoe.cards = [...shoe.cards.slice(4, 236), ...shoe.cards.slice(0, 4), ...shoe.cards.slice(236)];
  shoe.nextIndex = 232;
  await writeFile(primaryPath, JSON.stringify(saved));
  launched = await relaunchApp(launched);
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: '스탠드' })).toBeVisible();
  const during = JSON.parse(await readFile(primaryPath, 'utf8'));
  expect(during.games.blackjack.shoe.nextIndex).toBe(236);
  expect(during.games.blackjack.round.playerHands[0].cards[0].cardId).toBe('7S-1');
  await launched.page.getByRole('button', { name: '스탠드' }).click();
  await expect(launched.page.getByRole('button', { name: '다음 판' })).toBeVisible();
  await launched.page.getByRole('button', { name: '다음 판' }).click();
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await expect.poll(async () => {
    const checkpoint = JSON.parse(await readFile(primaryPath, 'utf8'));
    return checkpoint.games.blackjack.shoe.nextIndex as number;
  }).toBe(4);
  const after = JSON.parse(await readFile(primaryPath, 'utf8'));
  expect(after.games.blackjack.shoe.nextIndex).toBe(4);
});
