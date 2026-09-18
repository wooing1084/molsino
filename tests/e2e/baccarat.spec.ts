import { expect, test } from '@playwright/test';
import { closeApp, launchApp, relaunchApp, type LaunchedApp } from './support/app';

import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Rank } from '../../src/core/models';
import type { Target } from '../../src/core/baccarat/core';
import type { AppSession } from '../../src/main/persistence/app-session-repository';
import { appCommand, appSnapshot } from './support/app-game';
import { fixturePath } from './support/fixtures';

let launched: LaunchedApp;
async function start(ranks: Rank[] = ['9', '2', 'K', '3'], autoDelayMs = 0) {
  const dir = await mkdtemp(join(tmpdir(), 'molsino-baccarat-'));
  const fixture = join(dir, 'baccarat-shoe.json');
  await writeFile(fixture, JSON.stringify({ ranks: ['A', 'A', ...ranks] }));
  launched = await launchApp({ startAtMenu: true, userDataDir: dir, baccaratFixture: fixture, autoDelayMs, shoeFixture: fixturePath('player-blackjack') });
  await launched.page.getByRole('button', { name: '바카라', exact: true }).click();
  await expect.poll(async () => (await appSnapshot(launched.page)).screen).toBe('baccarat');
}
async function saved(): Promise<AppSession> { return JSON.parse(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8')); }
async function completed() { await expect.poll(async () => (await appSnapshot(launched.page)).baccarat?.phase).toBe('result'); return (await appSnapshot(launched.page)).baccarat!; }

test.afterEach(async () => { if (launched) await closeApp(launched); });

test('BAC-01 메뉴에서 바카라를 선택하고 실제 화면으로 한 판을 완료한다', async () => {
  await start();
  const p = launched.page;
  await expect(p.getByRole('button', { name: 'Player 베팅', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeVisible();
  await expect(p.getByLabel('최근 바카라 결과')).toContainText(/[PBT]/);
  await p.getByRole('button', { name: '메뉴', exact: true }).click();
  await expect(p.getByRole('button', { name: '블랙잭', exact: true })).toBeEnabled();
});

for (const scenario of [
  { target: 'P', ranks: ['9', '2', 'K', '3'], wager: 100, outcome: 'P', returned: 200 },
  { target: 'P', ranks: ['2', '9', '3', 'K'], wager: 100, outcome: 'B', returned: 0 },
  { target: 'B', ranks: ['2', '9', '3', 'K'], wager: 101, outcome: 'B', returned: 197 },
  { target: 'B', ranks: ['2', '9', '3', 'K'], wager: 110, outcome: 'B', returned: 215 },
  { target: 'T', ranks: ['9', '9', 'K', 'K'], wager: 100, outcome: 'T', returned: 900 },
  { target: 'T', ranks: ['9', '2', 'K', '3'], wager: 100, outcome: 'P', returned: 0 },
  { target: 'P', ranks: ['9', '9', 'K', 'K'], wager: 100, outcome: 'T', returned: 100 },
  { target: 'B', ranks: ['9', '9', 'K', 'K'], wager: 100, outcome: 'T', returned: 100 },
] as { target: Target; ranks: Rank[]; wager: number; outcome: Target; returned: number }[]) test(`BAC-01/02/03 ${scenario.target} ${scenario.wager} → ${scenario.outcome} 반환 ${scenario.returned}`, async () => {
  await start(scenario.ranks);
  const p = launched.page;
  const targetName = { P: 'Player', B: 'Banker', T: 'Tie' }[scenario.target];
  await p.getByRole('button', { name: `${targetName} 베팅`, exact: true }).click();
  if (scenario.wager !== 100) {
    await p.getByRole('button', { name: '베팅 금액', exact: true }).click();
    const input = p.getByRole('textbox', { name: '베팅 금액' });
    await input.fill((scenario.wager / 100).toFixed(2)); await input.press('Enter');
    await expect(p.locator('output')).toHaveText(`$${(scenario.wager / 100).toFixed(2)}`);
  }
  const before = await saved();
  expect(before.wallet.balanceCents).toBe(10000);
  await p.getByRole('button', { name: '딜', exact: true }).click();
  const view = await completed();
  expect(view.lastResult).toMatchObject({ outcome: scenario.outcome, returnCents: scenario.returned, netCents: scenario.returned - scenario.wager });
  expect((await saved()).wallet.balanceCents).toBe(10000 - scenario.wager + scenario.returned);
  if (scenario.target === 'B' && scenario.outcome === 'B') await expect(p.getByRole('status')).toContainText('수수료 5%');
  await expect(p.getByLabel('최근 바카라 결과')).toHaveText(scenario.outcome);
  const committed = await saved();
  await p.reload(); await expect(p.getByRole('button', { name: '다음 판' })).toBeVisible();
  expect(await saved()).toEqual(committed);
});

for (const stage of ['initial', 'playerThird', 'bankerThird', 'settle', 'settled'] as const) test(`BAC-04/07 ${stage} 저장 후 강제 종료에서 정확히 이어간다`, async () => {
  await start(['2', '2', '3', '4', '6', 'A'], 900);
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await expect.poll(async () => (await saved()).games.baccarat?.round?.stage, { intervals: [20] }).toBe(stage);
  const checkpoint = await saved();
  launched.app.process().kill('SIGKILL');
  launched = await relaunchApp(launched, { startAtMenu: true, autoDelayMs: 900 });
  if (stage === 'settled') {
    await launched.page.getByRole('button', { name: '바카라', exact: true }).click();
  } else {
    expect((await saved()).games.baccarat).toEqual(checkpoint.games.baccarat);
    await expect(launched.page.getByRole('button', { name: '메뉴', exact: true })).toBeDisabled();
    expect(await appCommand(launched.page, { type: 'goToMenu' })).toMatchObject({ ok: false });
  }
  const view = await completed();
  expect(view.player.cards.map(c => c.rank)).toEqual(['2', '3', '6']);
  expect(view.banker.cards.map(c => c.rank)).toEqual(['2', '4', 'A']);
  expect((await saved()).wallet.balanceCents).toBe(9900);
  expect(view.recentResults).toHaveLength(1);
  expect((await saved()).games.baccarat?.round?.roundId).toBe(checkpoint.games.baccarat?.round?.roundId);
});

for (const stage of ['initial', 'settle'] as const) test(`BAC-08 ${stage} 다음 저장 실패에서 같은 후보를 재시도한다`, async () => {
  await start(['2', '2', '3', '4', '6', 'A'], 700);
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await expect.poll(async () => (await saved()).games.baccarat?.round?.stage, { intervals: [20] }).toBe(stage);
  const before = await saved();
  const backup = join(launched.userDataDir, 'app-session.backup.json');
  await rm(backup, { force: true }); await mkdir(backup);
  await expect(launched.page.getByRole('button', { name: '저장 재시도' })).toBeVisible();
  expect(await saved()).toEqual(before);
  expect(await appCommand(launched.page, { type: 'goToMenu' })).toMatchObject({ ok: false, error: 'SAVE_FAILED' });
  await rm(backup, { recursive: true });
  await launched.page.getByRole('button', { name: '저장 재시도' }).click();
  await completed();
  expect((await saved()).wallet.balanceCents).toBe(9900);
  expect((await saved()).games.baccarat?.recentResults).toHaveLength(1);
  launched = await relaunchApp(launched, { startAtMenu: true });
  expect((await saved()).wallet.balanceCents).toBe(9900);
  await launched.page.getByRole('button', { name: '바카라', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: '다음 판' })).toBeVisible();
});

test('BAC-05/06/14 중복·동시 딜·내부 행동 위조·다른 게임·이전 세션을 거부하고 미래 카드를 숨긴다', async () => {
  await start(undefined, 700);
  const p = launched.page;
  for (const action of [{ type: 'advanceBaccarat' }, { type: 'setBet', target: ['P', 'B'], amountCents: 100 }, { type: 'setBet', target: 'T', amountCents: 99 }]) {
    expect(await p.evaluate(async action => {
      const s = await window.molsino.getSnapshot();
      try { await window.molsino.dispatch({ sessionId: s.sessionId, commandId: crypto.randomUUID(), expectedRevision: s.revision, action: { type: 'baccarat', action } } as never); return false; } catch { return true; }
    }, action)).toBe(true);
  }
  await p.evaluate(() => { (window as unknown as { views: unknown[] }).views = []; window.molsino.onState(s => (window as unknown as { views: unknown[] }).views.push(s)); });
  const s = await appSnapshot(p);
  const c = { sessionId: s.sessionId, commandId: randomUUID(), expectedRevision: s.revision, action: { type: 'baccarat' as const, action: { type: 'deal' as const } } };
  const responses = await p.evaluate(async c => Promise.all([window.molsino.dispatch(c), window.molsino.dispatch({ ...c, commandId: crypto.randomUUID() })]), c);
  expect(responses.filter(r => r.ok)).toHaveLength(1);
  expect(await p.evaluate(c => window.molsino.dispatch(c), c)).toMatchObject({ ok: true });
  expect((await saved()).wallet.balanceCents).toBe(9900);
  expect(await appCommand(p, { type: 'baccarat', action: { type: 'setBet', target: 'B', amountCents: 100 } })).toMatchObject({ ok: false });
  expect(await appCommand(p, { type: 'selectGame', gameId: 'blackjack' })).toMatchObject({ ok: false });
  await completed();
  expect(await p.evaluate(c => window.molsino.dispatch(c), c)).toMatchObject({ ok: true });
  expect((await saved()).wallet.balanceCents).toBe(10100);
  const payload = JSON.stringify([responses, await appSnapshot(p), await p.evaluate(() => (window as unknown as { views: unknown[] }).views)]);
  for (const secret of ['shoe', 'burnCount', 'nextIndex', 'settlementKey', 'startIndex']) expect(payload).not.toContain(`"${secret}"`);
  await appCommand(p, { type: 'goToMenu' });
  expect(await appCommand(p, { type: 'baccarat', action: { type: 'deal' } })).toMatchObject({ ok: false });
  await appCommand(p, { type: 'resetAll' });
  expect(await p.evaluate(c => window.molsino.dispatch(c), c)).toMatchObject({ ok: false, error: 'STALE_STATE' });
});

test('APP-08/BAC-09/11 두 게임 왕복이 공용 잔액·각 슈·결과를 유지한다', async () => {
  await start(); const p = launched.page;
  await p.getByRole('button', { name: '메뉴', exact: true }).click();
  await p.getByRole('button', { name: '블랙잭', exact: true }).click();
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect(p.locator('.balance strong')).toHaveText('$101.50');
  const blackjack = (await saved()).games.blackjack;
  await p.getByRole('button', { name: '메뉴', exact: true }).click();
  await p.getByRole('button', { name: '바카라', exact: true }).click();
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await completed();
  await expect(p.locator('.balance strong')).toHaveText('$102.50');
  const baccarat = (await saved()).games.baccarat;
  expect(baccarat?.shoe.nextIndex).toBe(6);
  await p.getByRole('button', { name: '메뉴', exact: true }).click();
  await p.getByRole('button', { name: '블랙잭', exact: true }).click();
  await expect(p.locator('.balance strong')).toHaveText('$102.50');
  expect((await saved()).games).toEqual({ blackjack, baccarat });
});

test('BAC-10 기록 20개 순서·Tie·재실행·전체 초기화', async () => {
  await start(['9', '9', 'K', 'K']); const p = launched.page;
  const outcomes: string[] = [];
  for (let i = 0; i < 22; i++) {
    expect(await appCommand(p, { type: 'baccarat', action: { type: 'deal' } })).toMatchObject({ ok: true });
    outcomes.push((await completed()).lastResult!.outcome);
    if (i < 21) await appCommand(p, { type: 'baccarat', action: { type: 'nextRound' } });
  }
  expect(outcomes[0]).toBe('T');
  const game = (await saved()).games.baccarat!;
  expect(game.recentResults.map(r => r.outcome)).toEqual(outcomes.slice(-20));
  await expect(p.getByLabel('최근 바카라 결과').locator('span')).toHaveCount(20);
  launched = await relaunchApp(launched, { startAtMenu: true });
  await launched.page.getByRole('button', { name: '바카라', exact: true }).click();
  expect((await saved()).games.baccarat).toEqual(game);
  await launched.page.getByRole('button', { name: '메뉴', exact: true }).click();
  await launched.page.getByRole('button', { name: '새 시작', exact: true }).click();
  await launched.page.getByRole('button', { name: '초기화 확정' }).click();
  await expect(launched.page.locator('.balance strong')).toHaveText('$100.00');
  expect((await saved()).games).toEqual({ blackjack: null, baccarat: null });
});

for (const balance of [99, 100]) test(`BAC-12 잔액 ${balance}센트의 딜 경계와 전체 새 시작`, async () => {
  await start(['2', '9', '3', 'K']);
  const state = await saved();
  await launched.app.close(); state.wallet.balanceCents = balance;
  await writeFile(join(launched.userDataDir, 'app-session.json'), JSON.stringify(state));
  launched = await launchApp({ userDataDir: launched.userDataDir, startAtMenu: true });
  const p = launched.page;
  await p.getByRole('button', { name: '바카라', exact: true }).click();
  if (balance === 100) {
    await p.getByRole('button', { name: '딜', exact: true }).click(); await completed();
    expect((await saved()).wallet.balanceCents).toBe(0);
    await p.getByRole('button', { name: '메뉴에서 새 시작' }).click();
  } else {
    await expect(p.getByRole('button', { name: '딜', exact: true })).toBeDisabled();
    expect(await appCommand(p, { type: 'baccarat', action: { type: 'deal' } })).toMatchObject({ ok: false });
    await p.getByRole('button', { name: '메뉴', exact: true }).click();
  }
  await p.getByRole('button', { name: '새 시작', exact: true }).click();
  await p.getByRole('button', { name: '초기화 확정' }).click();
  await expect(p.locator('.balance strong')).toHaveText('$100.00');
});

test('BAC-05/13 최소·기본·최대 크기, 입력 취소·검증, 흑백·불투명도·숨김 중 진행', async ({}, testInfo) => {
  await start(['2', '2', '3', '4', '6', 'A'], 200); const p = launched.page;
  for (const [width, height] of [[220, 150], [280, 180], [420, 280]]) {
    await launched.app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0]!.setBounds(bounds), { width: width!, height: height! });
    for (const name of ['메뉴', 'Player 베팅', 'Banker 베팅', 'Tie 베팅', '베팅 금액', '딜']) {
      const box = await p.getByRole('button', { name, exact: true }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(24); expect(box!.height).toBeGreaterThanOrEqual(24);
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width!);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height!);
    }
    await p.screenshot({ path: testInfo.outputPath(`baccarat-${width}x${height}.png`) });
  }
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ width: 220, height: 150 }));
  await p.getByRole('button', { name: '베팅 금액', exact: true }).click();
  const input = p.getByRole('textbox', { name: '베팅 금액' });
  await input.fill('0.99'); await input.press('Enter'); await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('100.01'); await input.press('Enter'); await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('2.22'); await input.press('Escape'); await expect(p.locator('output')).toHaveText('$1.00');
  await p.getByRole('button', { name: '베팅 금액', exact: true }).click(); await input.fill('3.33');
  await p.getByLabel('Player 패', { exact: true }).click(); await expect(p.locator('output')).toHaveText('$1.00');
  await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocusable())).toBe(false);
  await p.getByRole('button', { name: '흰색/검정 전환' }).click(); await expect(p.locator('.overlay')).toHaveClass(/ink-dark/);
  await p.evaluate(() => window.molsino.setOpacity(40));
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await p.getByRole('button', { name: '숨기기' }).click(); await completed();
  await launched.app.evaluate(({ app }) => { app.emit('activate'); });
  await expect(p.getByRole('button', { name: '다음 판' })).toBeVisible();
  expect(await p.evaluate(() => window.molsino.getOverlayState())).toMatchObject({ opacityPercent: 40, visibility: 'expanded' });
  await p.screenshot({ path: testInfo.outputPath('baccarat-result-220x150.png') });
});
