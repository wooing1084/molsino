import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, launchApp, relaunchApp, type LaunchedApp } from './support/app';
import { fixturePath } from './support/fixtures';
import type { GameViewState, UserCommand } from './window-api';

let launched: LaunchedApp;

test.afterEach(async () => {
  if (launched) await closeApp(launched);
});

test('S09-01 뒤늦은 snapshot이 더 새 push 상태를 덮지 않는다', async () => {
  launched = await launchApp({ snapshotDelayMs: 1000 });
  const page = launched.page;
  await expect(page.locator('footer[role="status"]')).toHaveText('앱 연결 중…');
  // The mounted App has requested revision 0; the test-only Main delay holds that captured value.
  await page.waitForTimeout(100);
  const result = await page.evaluate(() => window.blackjack.dispatch({
    commandId: crypto.randomUUID(), expectedRevision: 0,
    action: { type: 'setBet', amountCents: 200 },
  }));
  expect(result).toMatchObject({ ok: true, state: { revision: 1, pendingBetCents: 200 } });
  await expect(page.locator('output')).toHaveText('$2.00');
  // A fresh snapshot returns after the older captured snapshot requests have finished.
  await page.evaluate(() => window.blackjack.getSnapshot());
  await expect(page.locator('output')).toHaveText('$2.00');
  expect(await page.evaluate(() => window.blackjack.getSnapshot())).toMatchObject({ revision: 1 });
});

test('S09-02 같은 revision의 늦은 복구 snapshot이 새 게임을 다시 복구 화면으로 돌리지 않는다', async () => {
  launched = await launchApp();
  await writeFile(join(launched.userDataDir, 'session.json'), '{broken');
  launched = await relaunchApp(launched, { snapshotDelayMs: 1000 });
  const page = launched.page;
  await expect(page.locator('footer[role="status"]')).toHaveText('앱 연결 중…');
  await page.waitForTimeout(100);
  const recovered = await page.evaluate(() => window.blackjack.recover('startNew'));
  expect(recovered).toMatchObject({ revision: 0, phase: 'betting' });
  await expect(page.getByRole('button', { name: '딜', exact: true })).toBeEnabled();
  await page.evaluate(() => window.blackjack.getSnapshot());
  await expect(page.getByRole('button', { name: '딜', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '새 게임 시작' })).toHaveCount(0);
});

test('S09-03 구독 해제 후 이벤트를 받지 않고 reload 뒤 최신 revision을 표시한다', async () => {
  launched = await launchApp();
  const page = launched.page;
  await expect(page.getByRole('button', { name: '딜', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const probe = window as typeof window & { __stateProbe?: { revisions: number[]; unsubscribe: () => void } };
    const revisions: number[] = [];
    probe.__stateProbe = { revisions, unsubscribe: window.blackjack.onState(state => revisions.push(state.revision)) };
  });
  await page.evaluate(() => window.blackjack.dispatch({
    commandId: crypto.randomUUID(), expectedRevision: 0,
    action: { type: 'setBet', amountCents: 200 },
  }));
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __stateProbe: { revisions: number[] } }).__stateProbe.revisions,
  )).toEqual([1]);

  await page.evaluate(() =>
    (window as typeof window & { __stateProbe: { unsubscribe: () => void } }).__stateProbe.unsubscribe(),
  );
  await page.evaluate(() => window.blackjack.dispatch({
    commandId: crypto.randomUUID(), expectedRevision: 1,
    action: { type: 'setBet', amountCents: 300 },
  }));
  await expect(page.locator('output')).toHaveText('$3.00');
  expect(await page.evaluate(() =>
    (window as typeof window & { __stateProbe: { revisions: number[] } }).__stateProbe.revisions,
  )).toEqual([1]);

  await page.reload();
  await expect(page.locator('output')).toHaveText('$3.00');
  expect(await page.evaluate(() => window.blackjack.getSnapshot())).toMatchObject({ revision: 2, pendingBetCents: 300 });
  await page.evaluate(() => window.blackjack.dispatch({
    commandId: crypto.randomUUID(), expectedRevision: 2,
    action: { type: 'setBet', amountCents: 400 },
  }));
  await expect(page.locator('output')).toHaveText('$4.00');
});

test('S09-04 snapshot·command 응답·push에서 홀 카드와 슈를 공개하지 않는다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('standard-win') });
  const page = launched.page;
  await expect(page.getByRole('button', { name: '딜', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const probe = window as typeof window & { __publicPush?: GameViewState[] };
    probe.__publicPush = [];
    window.blackjack.onState(state => probe.__publicPush?.push(state));
  });
  const result = await page.evaluate(() => window.blackjack.dispatch({
    commandId: crypto.randomUUID(), expectedRevision: 0, action: { type: 'deal' },
  }));
  expect(result).toMatchObject({ ok: true, state: { phase: 'playerTurn', revision: 1 } });
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __publicPush: GameViewState[] }).__publicPush.length,
  )).toBe(1);
  const snapshot = await page.evaluate(() => window.blackjack.getSnapshot());
  const pushes = await page.evaluate(() =>
    (window as typeof window & { __publicPush: GameViewState[] }).__publicPush,
  );
  for (const state of [result.state, snapshot, ...pushes]) {
    expect(state.dealerHand).toMatchObject({ hiddenCardCount: 1, cards: [{ cardId: '10C-1' }] });
    expect(JSON.stringify(state)).not.toContain('6H-1');
    expect(state).not.toHaveProperty('shoe');
    expect(state).not.toHaveProperty('round');
  }
  await expect(page.locator('.hand.dealer')).toContainText('?');
  await expect(page.locator('.hand.dealer')).not.toContainText('6♥');
});

test('E2E-21 격리된 Preload API가 내부 명령과 잘못된 payload를 거부한다', async () => {
  launched = await launchApp();
  const page = launched.page;
  await expect(page.getByRole('button', { name: '딜', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => ({
    require: typeof (window as typeof window & { require?: unknown }).require,
    process: typeof (window as typeof window & { process?: unknown }).process,
    ipcRenderer: typeof (window as typeof window & { ipcRenderer?: unknown }).ipcRenderer,
    api: Object.keys(window.blackjack).sort(),
  }))).toEqual({
    require: 'undefined', process: 'undefined', ipcRenderer: 'undefined',
    api: ['amountEditFocus', 'dispatch', 'getOverlayState', 'getSnapshot', 'onOverlayState', 'onState', 'opacityPopover', 'recover', 'resize', 'setOpacity', 'windowCommand'],
  });

  const invalidCommands: unknown[] = [
    { commandId: crypto.randomUUID(), expectedRevision: 0, action: { type: 'advanceDealer' } },
    { commandId: crypto.randomUUID(), expectedRevision: 0, action: { type: 'deal', extra: true } },
    { commandId: crypto.randomUUID(), expectedRevision: 0, action: { type: 'setBet', amountCents: NaN } },
    { commandId: crypto.randomUUID(), expectedRevision: 0, action: { type: 'setBet', amountCents: Number.MAX_SAFE_INTEGER + 1 } },
    { commandId: crypto.randomUUID(), expectedRevision: 0, action: { type: 'deal' }, filePath: '/tmp/session.json' },
  ];
  for (const value of invalidCommands) {
    await expect(page.evaluate(command => window.blackjack.dispatch(command as UserCommand), value)).rejects.toThrow();
  }
  await expect(page.evaluate(() => window.blackjack.windowCommand('openDevTools' as never))).rejects.toThrow();
  await expect(page.evaluate(() => window.blackjack.resize({ phase: 'update', token: 'bad' }))).rejects.toThrow();
  expect(await page.evaluate(() => window.blackjack.getSnapshot())).toMatchObject({ revision: 0, phase: 'betting' });
});

test('S09-05 비신뢰 문서에는 이후 게임 상태 push를 보내지 않는다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('dealer-many-steps') });
  const page = launched.page;
  await expect(page.getByRole('button', { name: '딜', exact: true })).toBeEnabled();
  const dealt = await page.evaluate(() => window.blackjack.dispatch({
    commandId: crypto.randomUUID(), expectedRevision: 0, action: { type: 'deal' },
  }));
  expect(dealt).toMatchObject({ ok: true, state: { phase: 'playerTurn', revision: 1 } });

  await page.addInitScript(() => {
    if (location.href !== 'about:blank') return;
    const probe = window as typeof window & { __receivedStates?: GameViewState[] };
    probe.__receivedStates = [];
    window.blackjack.onState(state => probe.__receivedStates?.push(state));
  });
  await page.evaluate(({ revision, handId }) => {
    void window.blackjack.dispatch({
      commandId: crypto.randomUUID(), expectedRevision: revision, action: { type: 'stand', handId },
    }).then(result => { if (result.ok) location.href = 'about:blank'; });
  }, { revision: dealt.state.revision, handId: dealt.state.playerHands[0]!.handId });
  await page.waitForURL('about:blank');
  await expect(page.evaluate(() => window.blackjack.getSnapshot())).rejects.toThrow('Untrusted IPC sender');

  const sessionPath = join(launched.userDataDir, 'session.json');
  const atNavigation = JSON.parse(await readFile(sessionPath, 'utf8'));
  expect(atNavigation.revision).toBeLessThan(9);
  await expect.poll(async () => {
    const saved = JSON.parse(await readFile(sessionPath, 'utf8'));
    return { revision: saved.revision, phase: saved.state.round.phase };
  }).toEqual({ revision: 9, phase: 'result' });
  expect(await page.evaluate(() =>
    (window as typeof window & { __receivedStates?: GameViewState[] }).__receivedStates?.map(state => state.revision),
  )).toEqual([]);
});
