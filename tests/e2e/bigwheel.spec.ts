import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeApp, launchApp, relaunchApp, type LaunchedApp } from './support/app';
import { appCommand, appSnapshot } from './support/app-game';
import { fixturePath } from './support/fixtures';
import type { AppSession } from '../../src/main/persistence/app-session-repository';
import { BIG_WHEEL_SEGMENTS } from '../../src/core/bigwheel/core';

const cases = [
  { target: 'silver', name: '실버', returned: 200 },
  { target: 'gold', name: '골드', returned: 300 },
  { target: 'emerald', name: '에메랄드', returned: 600 },
  { target: 'diamond', name: '다이아몬드', returned: 1100 },
  { target: 'crystal', name: '크리스탈', returned: 2100 },
  { target: 'joker', name: '조커', returned: 4100 },
  { target: 'mega', name: '메가', returned: 4100 },
] as const;
let launched: LaunchedApp;
test.afterEach(async () => { if (launched) await closeApp(launched); });

async function start(target: typeof cases[number]['target'] = 'silver', autoDelayMs = 0) {
  const dir = await mkdtemp(join(tmpdir(), 'molsino-bigwheel-'));
  const fixture = join(dir, 'bigwheel-segments.json');
  await writeFile(fixture, JSON.stringify({ indices: [BIG_WHEEL_SEGMENTS.indexOf(target)] }));
  const baccaratFixture = join(dir, 'baccarat-shoe.json');
  await writeFile(baccaratFixture, JSON.stringify({ ranks: ['A', 'A', '9', '2', 'K', '3'] }));
  launched = await launchApp({ startAtMenu: true, userDataDir: dir, bigwheelFixture: fixture, autoDelayMs, baccaratFixture, shoeFixture: fixturePath('player-blackjack') });
  await launched.page.getByRole('button', { name: '빅휠', exact: true }).click({ timeout: 5000 });
  await expect.poll(async () => (await appSnapshot(launched.page)).screen).toBe('bigwheel');
}
async function saved(): Promise<AppSession> { return JSON.parse(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8')); }
async function completed() {
  await expect.poll(async () => (await appSnapshot(launched.page)).bigwheel?.phase).toBe('result');
  return (await appSnapshot(launched.page)).bigwheel!;
}
async function resizeWindow(width: number, height: number) {
  const window = await launched.app.browserWindow(launched.page);
  await window.evaluate((window, size) => window.setBounds(size), { width, height });
  await expect.poll(() => window.evaluate(window => {
    const { width, height } = window.getBounds(); return { width, height };
  })).toEqual({ width, height });
  await window.dispose();
  await expect.poll(() => launched.page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width, height });
  await launched.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function balanceMetrics() {
  const metrics = await launched.page.locator('.balance strong').evaluate(el => {
    const rect = el.getBoundingClientRect();
    const parent = el.parentElement!.getBoundingClientRect();
    return { text: el.textContent, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
      strong: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
      balance: { x: parent.x, y: parent.y, width: parent.width, height: parent.height, right: parent.right, bottom: parent.bottom },
      viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio };
  });
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.strong.x).toBeGreaterThanOrEqual(0);
  expect(metrics.strong.right).toBeLessThanOrEqual(metrics.viewport.width);
  expect(metrics.strong.bottom).toBeLessThanOrEqual(metrics.viewport.height);
  return metrics;
}
async function changeBet(name: string, amount: string) {
  const p = launched.page;
  await p.getByRole('button', { name: `${name} 베팅`, exact: true }).click();
  await p.getByRole('button', { name: '베팅 금액', exact: true }).click();
  const input = p.getByRole('textbox', { name: '베팅 금액' });
  await input.fill(amount); await input.press('Enter');
}

test('BW-01 메뉴에서 빅휠을 선택하고 회전 준비 화면을 연다', async () => {
  await start();
  await expect(launched.page.getByRole('button', { name: '회전', exact: true })).toBeEnabled();
  await expect(launched.page.getByRole('button', { name: '실버 베팅', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(launched.page.getByLabel('총 베팅 금액', { exact: true })).toContainText('$1.00');
});

for (const scenario of cases) test(`BW-02 ${scenario.name} 원금 포함 ${scenario.returned}센트 반환`, async () => {
  await start(scenario.target); const p = launched.page;
  if (scenario.target !== 'silver') {
    await p.getByRole('button', { name: '선택 구역 베팅 제거', exact: true }).click();
    await changeBet(scenario.name, '1.00');
  }
  await p.getByRole('button', { name: '회전', exact: true }).click();
  const view = await completed();
  expect(view.lastResult).toMatchObject({ segmentIndex: BIG_WHEEL_SEGMENTS.indexOf(scenario.target), returnCents: scenario.returned, netCents: scenario.returned - 100 });
  expect((await saved()).wallet.balanceCents).toBe(9900 + scenario.returned);
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  await expect(p.locator('footer[role="status"]')).toContainText(scenario.name);
  await expect(p.getByLabel('최근 빅휠 결과', { exact: true })).toContainText(scenario.name);
  await expect(p.getByLabel('빅휠 54칸', { exact: true })).toHaveAttribute('data-segment-index', String(BIG_WHEEL_SEGMENTS.indexOf(scenario.target)));
  const result = await saved();
  await p.reload(); await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  expect(await saved()).toEqual(result);
});

test('BW-03 복수 구역 합계·1센트·총액 상한·무당첨·다음 판 유지', async () => {
  await start('joker'); const p = launched.page;
  await changeBet('골드', '0.01');
  await expect(p.getByLabel('총 베팅 금액', { exact: true })).toContainText('$1.01');
  expect((await saved()).wallet.balanceCents).toBe(10000);
  expect(await appCommand(p, { type: 'bigwheel', action: { type: 'setBet', target: 'silver', amountCents: 5000 } })).toMatchObject({ ok: false });
  await p.getByRole('button', { name: '회전', exact: true }).click();
  const view = await completed();
  expect(view.lastResult).toMatchObject({ totalBetCents: 101, returnCents: 0, netCents: -101 });
  expect((await saved()).wallet.balanceCents).toBe(9899);
  await p.getByRole('button', { name: '다음 판', exact: true }).click();
  expect((await saved()).games.bigwheel?.pendingBets).toMatchObject({ silver: 100, gold: 1 });
  await p.getByRole('button', { name: '선택 구역 베팅 제거', exact: true }).click();
  await expect(p.getByLabel('총 베팅 금액', { exact: true })).toContainText('$1.00');
});

test('BW-04 회전 중 Main 잠금·중복 명령·미공개 결과 보호', async () => {
  await start('silver', 2500); const p = launched.page;
  const state = await appSnapshot(p);
  const command = { sessionId: state.sessionId, commandId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'bigwheel' as const, action: { type: 'spin' as const } } };
  const results = await p.evaluate(command => Promise.all([window.molsino.dispatch(command), window.molsino.dispatch({ ...command, commandId: crypto.randomUUID() })]), command);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(await p.evaluate(command => window.molsino.dispatch(command), command)).toMatchObject({ ok: true });
  expect((await saved()).wallet.balanceCents).toBe(9900);
  const spinning = await appSnapshot(p);
  expect(spinning.bigwheel?.phase).toBe('spinning');
  expect(JSON.stringify(spinning.bigwheel)).not.toMatch(/"(?:segmentIndex|settlementKey|nextSegmentIndex)"/);
  await expect(p.getByRole('button', { name: '메뉴', exact: true })).toBeDisabled();
  for (const action of [
    { type: 'goToMenu' }, { type: 'resetAll' }, { type: 'selectLevel', level: 1 }, { type: 'selectGame', gameId: 'baccarat' },
    { type: 'bigwheel', action: { type: 'setBet', target: 'gold', amountCents: 100 } },
    { type: 'bigwheel', action: { type: 'nextRound' } },
  ] as const) expect(await appCommand(p, action)).toMatchObject({ ok: false });
  expect(await p.evaluate(async () => {
    const s = await window.molsino.getSnapshot();
    try { await window.molsino.dispatch({ sessionId: s.sessionId, commandId: crypto.randomUUID(), expectedRevision: s.revision, action: { type: 'bigwheel', action: { type: 'advanceBigWheel' } } } as never); return false; } catch { return true; }
  })).toBe(true);
  await completed();
  expect(await p.evaluate(command => window.molsino.dispatch(command), command)).toMatchObject({ ok: true });
  expect((await saved()).wallet.balanceCents).toBe(10100);
  expect((await saved()).games.bigwheel?.recentResults).toHaveLength(1);
});

for (const phase of ['spinning', 'result'] as const) test(`BW-05 ${phase} 강제 종료 후 동일 당첨 칸으로 한 번만 정산`, async () => {
  await start('gold', 2500); const p = launched.page;
  await p.getByRole('button', { name: '회전', exact: true }).click();
  await expect.poll(async () => (await saved()).games.bigwheel?.phase, { intervals: [20] }).toBe(phase);
  const checkpoint = await saved();
  expect(checkpoint.games.bigwheel?.phase).toBe(phase);
  launched.app.process().kill('SIGKILL');
  launched = await relaunchApp(launched, { startAtMenu: true, autoDelayMs: 100 });
  if (phase === 'result') await launched.page.getByRole('button', { name: '빅휠', exact: true }).click();
  const view = await completed();
  expect(view.lastResult?.roundId).toBe(checkpoint.games.bigwheel?.round?.roundId);
  expect(view.lastResult?.segmentIndex).toBe(BIG_WHEEL_SEGMENTS.indexOf('gold'));
  expect((await saved()).wallet.balanceCents).toBe(9900);
  expect(view.recentResults).toHaveLength(1);
});

test('BW-06 정산 저장 실패는 같은 후보를 재시도하고 재기동해도 중복 지급하지 않는다', async () => {
  await start('silver', 1500); const p = launched.page;
  await p.getByRole('button', { name: '회전', exact: true }).click();
  await expect.poll(async () => (await saved()).games.bigwheel?.phase, { intervals: [20] }).toBe('spinning');
  const before = await saved();
  const backup = join(launched.userDataDir, 'app-session.backup.json');
  await rm(backup, { force: true }); await mkdir(backup);
  await expect(p.getByRole('button', { name: '저장 재시도', exact: true })).toBeVisible();
  expect(await saved()).toEqual(before);
  expect(await appCommand(p, { type: 'goToMenu' })).toMatchObject({ ok: false, error: 'SAVE_FAILED' });
  await rm(backup, { recursive: true });
  await p.getByRole('button', { name: '저장 재시도', exact: true }).click();
  await completed();
  expect((await saved()).wallet.balanceCents).toBe(10100);
  expect((await saved()).games.bigwheel?.recentResults).toHaveLength(1);
  launched = await relaunchApp(launched, { startAtMenu: true });
  await launched.page.getByRole('button', { name: '빅휠', exact: true }).click();
  expect((await saved()).wallet.balanceCents).toBe(10100);
  await expect(launched.page.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
});

test('BW-07 빠른 Main 정산도 휠 연출 중 결과·기록·최종 잔액을 선행 노출하지 않는다', async () => {
  await start('silver'); const p = launched.page;
  await p.getByRole('button', { name: '회전', exact: true }).click();
  await completed();
  expect(await p.locator('.balance strong').textContent()).not.toBe('$101.00');
  await expect(p.getByLabel('최근 빅휠 결과', { exact: true })).toHaveText('최근 결과 없음');
  await expect(p.getByRole('button', { name: '메뉴', exact: true })).toBeDisabled();
  expect(await p.getByLabel('빅휠 54칸', { exact: true }).getAttribute('data-segment-index')).toBeNull();
  expect(await p.locator('footer[role="status"]').textContent()).not.toContain('반환');
  await expect(p.getByLabel('빅휠 54칸', { exact: true })).toHaveAttribute('aria-label', '빅휠 54칸');
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  await expect(p.locator('.balance strong')).toHaveText('$101.00');
  await expect(p.getByLabel('최근 빅휠 결과', { exact: true })).toContainText('실버');
});

test('BW-08 220×150 창에서 구역·금액 입력·흑백·숨김 복원에 접근한다', async ({}, testInfo) => {
  await start('silver', 2500); const p = launched.page;
  await resizeWindow(220, 150);
  for (const name of ['메뉴', '회전', '베팅 금액', ...cases.map(item => `${item.name} 베팅`)]) {
    const button = p.getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(24); expect(box!.height).toBeGreaterThanOrEqual(24);
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(220); expect(box!.y + box!.height).toBeLessThanOrEqual(150);
  }
  await p.getByRole('button', { name: '실버 베팅', exact: true }).click();
  await p.getByRole('button', { name: '베팅 금액', exact: true }).click();
  const input = p.getByRole('textbox', { name: '베팅 금액' });
  await input.fill('50.01'); await input.press('Enter'); await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('2.22'); await input.press('Escape');
  await expect(p.getByLabel('총 베팅 금액', { exact: true })).toContainText('$1.00');
  await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocusable())).toBe(false);
  await p.getByRole('button', { name: '흰색/검정 전환', exact: true }).click();
  await expect(p.locator('.overlay')).toHaveClass(/ink-dark/);
  await p.evaluate(() => window.molsino.setOpacity(40));
  await p.getByRole('button', { name: '회전', exact: true }).click();
  await p.getByRole('button', { name: '숨기기', exact: true }).click(); await completed();
  await launched.app.evaluate(({ app }) => { app.emit('activate'); });
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  expect(await p.evaluate(() => window.molsino.getOverlayState())).toMatchObject({ opacityPercent: 40, visibility: 'expanded' });
  const backing = await p.addStyleTag({ content: 'body { background: #f5f5f5; }' });
  await expect(p.locator('.balance strong')).toHaveText('$101.00');
  await writeFile(testInfo.outputPath('balance-metrics.json'), JSON.stringify(await balanceMetrics(), null, 2));
  await p.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await p.screenshot({ path: testInfo.outputPath('bigwheel-result-220x150.png') });
  await backing.evaluate(node => node.parentNode?.removeChild(node));
});

test('BW-09 세 게임 왕복은 공용 잔액과 각 게임 결과를 유지한다', async () => {
  await start(); const p = launched.page;
  await p.getByRole('button', { name: '회전', exact: true }).click();
  await p.getByRole('button', { name: '다음 판', exact: true }).waitFor({ state: 'visible' });
  const bigwheel = (await saved()).games.bigwheel;
  await p.getByRole('button', { name: '메뉴', exact: true }).click();
  await p.getByRole('button', { name: '블랙잭', exact: true }).click();
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect(p.locator('.balance strong')).toHaveText('$102.50');
  const blackjack = (await saved()).games.blackjack;
  await p.getByRole('button', { name: '메뉴', exact: true }).click();
  await p.getByRole('button', { name: '바카라', exact: true }).click();
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect(p.locator('.balance strong')).toHaveText('$103.50');
  const baccarat = (await saved()).games.baccarat;
  await p.getByRole('button', { name: '메뉴', exact: true }).click();
  await p.getByRole('button', { name: '빅휠', exact: true }).click();
  await expect(p.locator('.balance strong')).toHaveText('$103.50');
  expect((await saved()).games).toEqual({ blackjack, baccarat, bigwheel });
});

test('BW-10 Lv6 최대 총액과 한도는 최소 창에서 확인하고 편집할 수 있다', async ({}, testInfo) => {
  await start();
  const state = await saved();
  const userDataDir = launched.userDataDir;
  await launched.app.close();
  state.wallet.balanceCents = 10_000_000;
  state.table = { selectedLevel: 6, bestBankrollCents: 10_000_000 };
  await writeFile(join(userDataDir, 'app-session.json'), JSON.stringify(state));
  launched = await launchApp({ startAtMenu: true, userDataDir });
  const p = launched.page;
  await p.getByRole('button', { name: '빅휠', exact: true }).click();
  await resizeWindow(220, 150);
  await expect(p.getByLabel('현재 테이블 레벨', { exact: true })).toHaveText('Lv.6');
  await changeBet('실버', '25000.00');
  await expect(p.getByLabel('총 베팅 금액', { exact: true })).toContainText('$25000.00');
  const limits = p.locator('.bigwheel-limits');
  await expect(limits).toContainText('최소 $1000');
  await expect(limits).toContainText('최대 $25000');
  const metrics = await limits.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
  await expect(p.getByRole('button', { name: '회전', exact: true })).toBeEnabled();
  await p.getByRole('button', { name: '흰색/검정 전환', exact: true }).click();
  const backing = await p.addStyleTag({ content: 'body { background: #f5f5f5; }' });
  await expect(p.locator('.balance strong')).toHaveText('$100000.00');
  const smallMetrics = await balanceMetrics();
  await writeFile(testInfo.outputPath('balance-metrics.json'), JSON.stringify({ smallMetrics }, null, 2));
  await p.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await p.screenshot({ path: testInfo.outputPath('bigwheel-level6-220x150.png') });
  await resizeWindow(280, 180);
  const defaultMetrics = await balanceMetrics();
  await writeFile(testInfo.outputPath('balance-metrics.json'), JSON.stringify({ smallMetrics, defaultMetrics }, null, 2));
  await p.screenshot({ path: testInfo.outputPath('bigwheel-level6-280x180.png') });
  await backing.evaluate(node => node.parentNode?.removeChild(node));
});
