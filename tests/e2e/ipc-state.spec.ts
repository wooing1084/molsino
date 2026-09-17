import { expect, test } from '@playwright/test';
import { closeApp, launchApp, type LaunchedApp } from './support/app';
import { fixturePath } from './support/fixtures';

let launched: LaunchedApp;
test.afterEach(async () => {
  if (launched) await closeApp(launched);
});

test('S09-01 늦은 초기 snapshot은 먼저 도착한 최신 push를 덮지 않는다', async () => {
  launched = await launchApp({ snapshotDelayMs: 500 });
  await expect(launched.page.locator('footer[role="status"]')).toHaveText('앱 연결 중…');
  await launched.page.waitForTimeout(50);
  const raced = await launched.page.evaluate(async () => {
    const staleSnapshot = window.blackjack.getSnapshot();
    let unsubscribe: (() => void) | undefined;
    const push = new Promise<number>(resolve => {
      unsubscribe = window.blackjack.onState(state => resolve(state.revision));
    });
    const result = await window.blackjack.dispatch({
      commandId: crypto.randomUUID(), expectedRevision: 0,
      action: { type: 'setBet', amountCents: 200 },
    });
    const pushRevision = await push;
    unsubscribe?.();
    return { result, pushRevision, staleRevision: (await staleSnapshot).revision };
  });
  expect(raced).toMatchObject({
    result: { ok: true, state: { revision: 1, pendingBetCents: 200 } },
    pushRevision: 1, staleRevision: 0,
  });
  await expect(launched.page.locator('output')).toHaveText('$2.00');
  await launched.page.waitForTimeout(600);
  await expect(launched.page.locator('output')).toHaveText('$2.00');
});

test('S09-02 구독 해제 후에는 push를 받지 않고 reload는 최신 revision을 읽는다', async () => {
  launched = await launchApp();
  const counts = await launched.page.evaluate(async () => {
    let count = 0;
    const unsubscribe = window.blackjack.onState(() => { count += 1; });
    const initial = await window.blackjack.getSnapshot();
    const first = await window.blackjack.dispatch({
      commandId: crypto.randomUUID(), expectedRevision: initial.revision,
      action: { type: 'setBet', amountCents: 200 },
    });
    if (!first.ok) throw new Error(first.message);
    await new Promise(resolve => setTimeout(resolve, 50));
    const beforeUnsubscribe = count;
    unsubscribe();
    const second = await window.blackjack.dispatch({
      commandId: crypto.randomUUID(), expectedRevision: first.state.revision,
      action: { type: 'setBet', amountCents: 300 },
    });
    if (!second.ok) throw new Error(second.message);
    await new Promise(resolve => setTimeout(resolve, 50));
    return { beforeUnsubscribe, afterUnsubscribe: count, revision: second.state.revision };
  });
  expect(counts).toEqual({ beforeUnsubscribe: 1, afterUnsubscribe: 1, revision: 2 });
  await launched.page.reload();
  await expect(launched.page.locator('output')).toHaveText('$3.00');
  expect(await launched.page.evaluate(() => window.blackjack.getSnapshot())).toMatchObject({
    revision: 2, pendingBetCents: 300,
  });
});

test('S09-03 E2E-21 Node 격리와 내부·비정상 명령 거부를 확인한다', async () => {
  launched = await launchApp();
  const boundary = await launched.page.evaluate(() => ({
    hasRequire: 'require' in window,
    hasProcess: 'process' in window,
    hasIpcRenderer: 'ipcRenderer' in window || 'ipcRenderer' in window.blackjack,
    apiKeys: Object.keys(window.blackjack).sort(),
  }));
  expect(boundary).toEqual({
    hasRequire: false, hasProcess: false, hasIpcRenderer: false,
    apiKeys: ['dispatch', 'getOverlayState', 'getSnapshot', 'onOverlayState', 'onState', 'opacityPopover', 'recover', 'resize', 'setOpacity', 'windowCommand'],
  });
  const before = await launched.page.evaluate(() => window.blackjack.getSnapshot());
  await expect(launched.page.evaluate(() => window.blackjack.dispatch({
    commandId: crypto.randomUUID(), expectedRevision: 0,
    action: { type: 'advanceDealer' },
  } as never))).rejects.toThrow();
  await expect(launched.page.evaluate(() => window.blackjack.dispatch({
    commandId: crypto.randomUUID(), expectedRevision: -1,
    action: { type: 'deal', extra: true },
  } as never))).rejects.toThrow();
  expect(await launched.page.evaluate(() => window.blackjack.getSnapshot())).toEqual(before);
});

test('S09-04 공개 snapshot과 push에는 슈·딜러 홀 카드가 없다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('standard-win') });
  const visibility = await launched.page.evaluate(async () => {
    let pushed: Awaited<ReturnType<typeof window.blackjack.getSnapshot>> | undefined;
    const unsubscribe = window.blackjack.onState(state => { pushed = state; });
    const initial = await window.blackjack.getSnapshot();
    const result = await window.blackjack.dispatch({
      commandId: crypto.randomUUID(), expectedRevision: initial.revision,
      action: { type: 'deal' },
    });
    if (!result.ok) throw new Error(result.message);
    await new Promise(resolve => setTimeout(resolve, 50));
    unsubscribe();
    return { returned: result.state, pushed, snapshot: await window.blackjack.getSnapshot() };
  });
  for (const state of [visibility.returned, visibility.pushed, visibility.snapshot]) {
    expect(state).toBeDefined();
    expect(state).toMatchObject({ phase: 'playerTurn', dealerHand: { hiddenCardCount: 1 } });
    expect(JSON.stringify(state)).not.toContain('shoe');
    expect(JSON.stringify(state)).not.toContain('6H-1');
  }
});

test('S09-05 직접 로드된 비신뢰 문서는 같은 preload API로도 IPC를 호출할 수 없다', async () => {
  launched = await launchApp();
  await launched.app.evaluate(async ({ BrowserWindow }) => {
    const overlay = BrowserWindow.getAllWindows()[0];
    if (!overlay) throw new Error('Overlay window is unavailable');
    await overlay.webContents.loadURL('data:text/html,<title>untrusted</title>');
  });
  await expect(launched.page).toHaveTitle('untrusted');
  const hasBridge = await launched.page.evaluate(() => 'blackjack' in window);
  expect(hasBridge).toBe(true);
  await expect(launched.page.evaluate(() => window.blackjack.getSnapshot()))
    .rejects.toThrow('Untrusted IPC sender');
});
