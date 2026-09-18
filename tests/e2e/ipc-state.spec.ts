import { expect, test } from '@playwright/test';
import { closeApp, launchApp, type LaunchedApp } from './support/app';
import { fixturePath } from './support/fixtures';
import { appSnapshot, appCommand } from './support/app-game';
let launched: LaunchedApp;
test.afterEach(async () => { if (launched) await closeApp(launched); });

test('S09-01 늦은 초기 snapshot은 먼저 도착한 최신 push를 덮지 않는다', async () => {
  launched = await launchApp({ snapshotDelayMs: 500 });
  const sessionId = (await appSnapshot(launched.page)).sessionId;
  await launched.page.reload();
  const raced = await launched.page.evaluate(async sessionId => {
    const stale = window.molsino.getSnapshot();
    const result = await window.molsino.dispatch({ sessionId, commandId: crypto.randomUUID(), expectedRevision: 1,
      action: { type: 'blackjack', action: { type: 'setBet', amountCents: 200 } } });
    return { result, stale: await stale };
  }, sessionId);
  expect(raced.result).toMatchObject({ ok: true, state: { revision: 2, blackjack: { pendingBetCents: 200 } } });
  expect(raced.stale.revision).toBe(1);
  await expect(launched.page.locator('output')).toHaveText('$2.00');
});

test('S09-02 구독 해제 후에는 push를 받지 않고 reload는 최신 상태를 읽는다', async () => {
  launched = await launchApp();
  const counts = await launched.page.evaluate(async () => {
    let count = 0;
    const unsubscribe = window.molsino.onState(() => count++);
    const initial = await window.molsino.getSnapshot();
    const first = await window.molsino.dispatch({ sessionId: initial.sessionId, commandId: crypto.randomUUID(), expectedRevision: initial.revision,
      action: { type: 'blackjack', action: { type: 'setBet', amountCents: 200 } } });
    const before = count; unsubscribe();
    await window.molsino.dispatch({ sessionId: initial.sessionId, commandId: crypto.randomUUID(), expectedRevision: first.state.revision,
      action: { type: 'blackjack', action: { type: 'setBet', amountCents: 300 } } });
    return { before, after: count };
  });
  expect(counts.before).toBeGreaterThan(0); expect(counts.after).toBe(counts.before);
  await launched.page.reload();
  await expect(launched.page.locator('output')).toHaveText('$3.00');
  expect(await appSnapshot(launched.page)).toMatchObject({ revision: 3, blackjack: { pendingBetCents: 300 } });
});

test('S09-03 Node 격리와 내부·비정상 명령 거부를 확인한다', async () => {
  launched = await launchApp();
  const boundary = await launched.page.evaluate(() => ({
    require: 'require' in window, process: 'process' in window, ipcRenderer: 'ipcRenderer' in window || 'ipcRenderer' in window.molsino,
    oldAPI: 'blackjack' in window, keys: Object.keys(window.molsino).sort(),
  }));
  expect(boundary).toEqual({ require: false, process: false, ipcRenderer: false, oldAPI: false,
    keys: ['amountEditFocus', 'dispatch', 'getOverlayState', 'getSnapshot', 'onOverlayState', 'onState', 'opacityPopover', 'recover', 'resize', 'setOpacity', 'windowCommand'] });
  const before = await appSnapshot(launched.page);
  for (const action of [{ type: 'advanceDealer' }, { type: 'deal', extra: true }, { type: 'resetSession' }, { type: 'setBet', amountCents: NaN }]) {
    await expect(launched.page.evaluate(({ before, action }) => window.molsino.dispatch({ sessionId: before.sessionId, commandId: crypto.randomUUID(), expectedRevision: before.revision,
      action: { type: 'blackjack', action } } as never), { before, action })).rejects.toThrow();
  }
  expect(await appSnapshot(launched.page)).toEqual(before);
});

test('S09-04 snapshot·응답·push에는 슈·딜러 홀 카드가 없다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('standard-win') });
  const views = await launched.page.evaluate(async () => {
    const pushes: unknown[] = [];
    const unsubscribe = window.molsino.onState(s => pushes.push(s));
    const s = await window.molsino.getSnapshot();
    const result = await window.molsino.dispatch({ sessionId: s.sessionId, commandId: crypto.randomUUID(), expectedRevision: s.revision, action: { type: 'blackjack', action: { type: 'deal' } } });
    unsubscribe(); return { result, pushes, snapshot: await window.molsino.getSnapshot() };
  });
  expect(views.result).toMatchObject({ ok: true, state: { blackjack: { phase: 'playerTurn', dealerHand: { hiddenCardCount: 1 } } } });
  for (const view of [views.result, views.snapshot, ...views.pushes]) {
    expect(JSON.stringify(view)).not.toContain('shoe'); expect(JSON.stringify(view)).not.toContain('6H-1');
  }
  await expect(launched.page.locator('.hand.dealer')).toContainText('?');
});

test('S09-05 비신뢰 문서는 같은 preload API로도 IPC를 호출할 수 없다', async () => {
  launched = await launchApp();
  await appCommand(launched.page, { type: 'goToMenu' });
  await launched.app.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.loadURL('data:text/html,<title>untrusted</title>'));
  await expect(launched.page).toHaveTitle('untrusted');
  await expect(appSnapshot(launched.page)).rejects.toThrow('Untrusted IPC sender');
});
