import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, launchApp, relaunchApp, type LaunchedApp } from './support/app';
import { fixturePath } from './support/fixtures';
import { appSnapshot, appCommand } from './support/app-game';
import type { AppView } from '../../src/shared/app-contracts';
let launched: LaunchedApp;
test.afterEach(async () => { if (launched) await closeApp(launched); });

test('S09 복구 이전에 캡처한 snapshot이 새 메뉴를 복구 화면으로 되돌리지 않는다', async () => {
  launched = await launchApp();
  await launched.app.close();
  await writeFile(join(launched.userDataDir, 'app-session.json'), '{broken');
  launched = await launchApp({ userDataDir: launched.userDataDir, startAtMenu: true, snapshotDelayMs: 1000 });
  const result = await launched.page.evaluate(async () => {
    const old = window.molsino.getSnapshot();
    const recovered = await window.molsino.recover('startNew');
    return { old: await old, recovered };
  });
  expect(result.old.recovery).toBeDefined(); expect(result.recovered.recovery).toBeUndefined();
  await expect(launched.page.getByRole('button', { name: '블랙잭', exact: true })).toBeEnabled();
  await expect(launched.page.getByRole('button', { name: '새 게임 시작' })).toHaveCount(0);
});

test('APP-09 reload 뒤 viewSequence는 현재 연결 기준으로 비교하고 저장된 화면을 유지한다', async () => {
  launched = await launchApp();
  for (const amount of [200, 300, 400]) expect((await appCommand(launched.page, { type: 'blackjack', action: { type: 'setBet', amountCents: amount } })).ok).toBe(true);
  const before = await appSnapshot(launched.page);
  await launched.page.reload(); await expect(launched.page.locator('output')).toHaveText('$4.00');
  expect(await appSnapshot(launched.page)).toEqual(before);
  launched = await relaunchApp(launched, { startAtMenu: true });
  const restarted = await appSnapshot(launched.page);
  expect(restarted).toMatchObject({ screen: 'menu', viewSequence: 0, revision: before.revision + 1 });
});

test('S09 비신뢰 문서에는 자동 진행 이후 상태 push를 보내지 않는다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('dealer-many-steps'), autoDelayMs: 100 });
  const dealt = await appCommand(launched.page, { type: 'blackjack', action: { type: 'deal' } });
  expect(dealt.ok).toBe(true);
  await launched.page.addInitScript(() => {
    if (location.href !== 'about:blank') return;
    const probe = window as typeof window & { __received?: AppView[] };
    probe.__received = []; window.molsino.onState(s => probe.__received?.push(s));
  });
  await appCommand(launched.page, { type: 'blackjack', action: { type: 'stand', handId: dealt.state.blackjack!.playerHands[0]!.handId } });
  await launched.app.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.loadURL('about:blank'));
  await expect(appSnapshot(launched.page)).rejects.toThrow('Untrusted IPC sender');
  await expect.poll(async () => JSON.parse(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8')).games.blackjack.round.phase).toBe('result');
  expect(await launched.page.evaluate(() => (window as typeof window & { __received?: AppView[] }).__received)).toEqual([]);
});

test('APP-10 잘못된 envelope·게임 ID·추가 필드는 거부한다', async () => {
  launched = await launchApp();
  const s = await appSnapshot(launched.page);
  const base = { sessionId: s.sessionId, commandId: crypto.randomUUID(), expectedRevision: s.revision, action: { type: 'blackjack', action: { type: 'deal' } } };
  for (const value of [{ ...base, sessionId: 'bad' }, { ...base, expectedRevision: -1 }, { ...base, filePath: '/tmp/forbidden' },
    { ...base, action: { type: 'selectGame', gameId: 'unknown' } }, { ...base, action: { type: 'baccarat', action: { type: 'advanceBaccarat' } } }]) {
    await expect(launched.page.evaluate(c => window.molsino.dispatch(c as never), value)).rejects.toThrow();
  }
  // Baccarat is now a valid command branch, but another game's screen must still reject it.
  expect(await appCommand(launched.page, { type: 'baccarat', action: { type: 'deal' } })).toMatchObject({ ok: false, error: 'INVALID_ACTION' });
  await expect(launched.page.evaluate(() => window.molsino.windowCommand('openDevTools' as never))).rejects.toThrow();
  await expect(launched.page.evaluate(() => window.molsino.resize({ phase: 'update', token: 'bad' }))).rejects.toThrow();
  expect(await appSnapshot(launched.page)).toEqual(s);
});
