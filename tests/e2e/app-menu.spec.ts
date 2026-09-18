import { expect, test } from '@playwright/test';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeApp, launchApp, relaunchApp, type LaunchedApp } from './support/app';
import { fixturePath } from './support/fixtures';
import type { AppAction } from '../../src/shared/app-contracts';
import { createSession, transition } from '../../src/core/engine';
import { createShoeFactory } from '../../src/main/game/shoe-source';
import { randomUUID } from 'node:crypto';

let launched: LaunchedApp;
test.afterEach(async () => { if (launched) await closeApp(launched); });
const saved = async () => JSON.parse(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8'));
async function command(action: AppAction) {
  return launched.page.evaluate(async action => {
    const s = await window.molsino.getSnapshot();
    return window.molsino.dispatch({ sessionId: s.sessionId, commandId: crypto.randomUUID(), expectedRevision: s.revision, action });
  }, action);
}

test('APP-04 메뉴에서 블랙잭을 플레이하고 슈·결과·공용 잔액을 유지하며 돌아온다', async () => {
  launched = await launchApp({ startAtMenu: true, shoeFixture: fixturePath('player-blackjack') });
  const p = launched.page;
  await expect(p.getByRole('button', { name: '바카라', exact: true })).toBeEnabled();
  await p.getByRole('button', { name: '블랙잭', exact: true }).click();
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect(p.locator('.balance strong')).toHaveText('$101.50');
  const result = await saved();
  expect(result.wallet.balanceCents).toBe(10150);
  expect(result.games.blackjack).not.toHaveProperty('balanceCents');
  expect(result.games.baccarat).toBeNull();
  await p.getByRole('button', { name: '메뉴', exact: true }).click();
  await p.getByRole('button', { name: '블랙잭', exact: true }).click();
  expect((await saved()).games).toEqual(result.games);
  await expect(p.getByRole('button', { name: '다음 판' })).toBeVisible();
  launched = await relaunchApp(launched, { startAtMenu: true });
  await expect(launched.page.getByRole('button', { name: '블랙잭', exact: true })).toBeVisible();
  expect((await saved()).wallet.balanceCents).toBe(10150);
});

test('APP-05 진행 중 메뉴·다른 게임·초기화를 Main에서 거부하고 재실행한다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('standard-win') });
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: '스탠드' })).toBeVisible();
  await expect(launched.page.getByRole('button', { name: '메뉴', exact: true })).toBeDisabled();
  const before = await saved();
  for (const action of [{ type: 'goToMenu' }, { type: 'resetAll' }, { type: 'selectGame', gameId: 'blackjack' }] as AppAction[]) {
    expect(await command(action)).toMatchObject({ ok: false });
  }
  expect(await saved()).toEqual(before);
  launched.app.process().kill('SIGKILL');
  launched = await relaunchApp(launched, { startAtMenu: true });
  await expect(launched.page.getByRole('button', { name: '스탠드' })).toBeVisible();
  expect(await saved()).toEqual(before);
});

test('APP-07 새 시작 취소·확정과 이전 세션/동일 초기화 재전송', async () => {
  launched = await launchApp({ startAtMenu: true });
  const p = launched.page;
  const before = await saved();
  await p.getByRole('button', { name: '새 시작', exact: true }).click();
  await p.getByRole('button', { name: '취소', exact: true }).click();
  expect(await saved()).toEqual(before);
  const reset = { sessionId: before.sessionId, commandId: randomUUID(), expectedRevision: before.revision, action: { type: 'resetAll' as const } };
  const first = await p.evaluate(c => window.molsino.dispatch(c), reset);
  expect(first.ok).toBe(true);
  expect(first.state.sessionId).not.toBe(before.sessionId);
  expect(await p.evaluate(c => window.molsino.dispatch(c), reset)).toMatchObject({ ok: true, state: { revision: first.state.revision } });
  expect(await p.evaluate(c => window.molsino.dispatch(c), { ...reset, commandId: randomUUID() })).toMatchObject({ ok: false, error: 'STALE_STATE' });
  await p.getByRole('button', { name: '새 시작', exact: true }).click();
  await p.getByRole('button', { name: '초기화 확정' }).click();
  await expect(p.locator('.balance strong')).toHaveText('$100.00');
  expect((await saved()).games).toEqual({ blackjack: null, baccarat: null });
});

for (const phase of ['insurance', 'split'] as const) test(`APP-01 ${phase} 미완료 v1 세션을 그대로 이전하고 구 파일은 보존한다`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'molsino-migration-'));
  const factory = createShoeFactory(fixturePath(phase === 'insurance' ? 'insurance-miss' : 'split-pair'));
  const env = { createShoe: factory, nextId: () => randomUUID() };
  let state = createSession(factory(), { balanceCents: 12345, pendingBetCents: 125 });
  state = transition(state, { type: 'deal' }, env).nextState;
  if (phase === 'split') state = transition(state, { type: 'split', handId: state.round!.playerHands[0]!.handId }, env).nextState;
  const lastAppliedCommand = { commandId: randomUUID(), revision: 8 };
  const legacy = JSON.stringify({ schemaVersion: 1, revision: 8, state, lastAppliedCommand });
  await writeFile(join(dir, 'session.json'), legacy);
  await writeFile(join(dir, 'app-session.json.abandoned.tmp'), 'ignored');
  launched = await launchApp({ userDataDir: dir, startAtMenu: true });
  const migrated = await saved();
  const { balanceCents, ...game } = state;
  expect(migrated).toMatchObject({ revision: 8, wallet: { balanceCents }, games: { blackjack: game, baccarat: null }, activeRoundGameId: 'blackjack' });
  expect(migrated.lastAppliedCommand.commandId).toBe(lastAppliedCommand.commandId);
  expect(await readFile(join(dir, 'session.json'), 'utf8')).toBe(legacy);
  launched = await relaunchApp(launched, { startAtMenu: true });
  expect(await saved()).toEqual(migrated);
  expect(await readFile(join(dir, 'session.json'), 'utf8')).toBe(legacy);
});

test('APP-03 실제 저장 경로 실패에서 확정 상태를 유지하고 같은 후보만 재시도한다', async () => {
  launched = await launchApp();
  const file = join(launched.userDataDir, 'app-session.backup.json');
  await rm(file, { force: true }); await mkdir(file);
  const before = await saved();
  await launched.page.getByRole('button', { name: '베팅 올리기' }).click();
  await expect(launched.page.getByRole('button', { name: '저장 재시도' })).toBeVisible();
  expect(await saved()).toEqual(before);
  expect(await command({ type: 'goToMenu' })).toMatchObject({ ok: false, error: 'SAVE_FAILED' });
  await rm(file, { recursive: true });
  await launched.page.getByRole('button', { name: '저장 재시도' }).click();
  await expect(launched.page.locator('output')).toHaveText('$2.00');
  expect((await saved()).revision).toBe(before.revision + 1);
  await expect(launched.page.getByRole('button', { name: '메뉴', exact: true })).toBeEnabled();
});

test('APP-11 금액 편집 중 메뉴 이동은 초안을 취소하고 220×150에서도 핵심 조작을 유지한다', async ({}, testInfo) => {
  launched = await launchApp();
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ width: 220, height: 150 }));
  await launched.page.getByRole('button', { name: '베팅 금액' }).click();
  await launched.page.getByRole('textbox', { name: '베팅 금액' }).fill('9.99');
  await launched.page.getByRole('button', { name: '메뉴', exact: true }).click();
  await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFocusable())).toBe(false);
  for (const name of ['블랙잭', '바카라', '새 시작']) {
    const b = await launched.page.getByRole('button', { name, exact: true }).boundingBox();
    expect(b).not.toBeNull(); expect(b!.height).toBeGreaterThanOrEqual(24); expect(b!.y + b!.height).toBeLessThanOrEqual(150);
  }
  await launched.page.screenshot({ path: testInfo.outputPath('menu-220x150.png') });
  await launched.page.getByRole('button', { name: '새 시작', exact: true }).click();
  await expect(launched.page.getByRole('button', { name: '취소', exact: true })).toBeVisible();
  await launched.page.mouse.move(210, 75);
  await launched.page.screenshot({ path: testInfo.outputPath('reset-220x150.png') });
  await launched.page.getByRole('button', { name: '취소', exact: true }).click();
  await launched.page.getByRole('button', { name: '블랙잭', exact: true }).click();
  await expect(launched.page.locator('output')).toHaveText('$1.00');
  await launched.page.screenshot({ path: testInfo.outputPath('blackjack-220x150.png') });
});

test('APP-02/12 이관 파일 접근 실패를 안내하고 재시도하여 같은 잔액을 보존한다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'molsino-migration-io-'));
  const state = createSession(createShoeFactory(fixturePath('standard-win'))(), { balanceCents: 12345 });
  const legacy = JSON.stringify({ schemaVersion: 1, revision: 6, state, lastAppliedCommand: null });
  await writeFile(join(dir, 'session.json'), legacy);
  await mkdir(join(dir, 'app-session.backup.json'));
  launched = await launchApp({ userDataDir: dir, startAtMenu: true });
  await expect(launched.page.getByRole('button', { name: '불러오기 재시도' })).toBeVisible();
  await expect(launched.page.getByRole('button', { name: '새 게임 시작' })).toHaveCount(0);
  expect(await readFile(join(dir, 'session.json'), 'utf8')).toBe(legacy);
  await rm(join(dir, 'app-session.backup.json'), { recursive: true });
  await launched.page.getByRole('button', { name: '불러오기 재시도' }).click();
  await expect(launched.page.locator('.balance strong')).toHaveText('$123.45');
  expect((await saved()).revision).toBe(6);
  expect(await readFile(join(dir, 'session.json'), 'utf8')).toBe(legacy);
});

test('APP-02 새 primary가 없어도 새 backup 복구를 우선하고 구 파일을 재이관하지 않는다', async () => {
  launched = await launchApp();
  await launched.page.getByRole('button', { name: '베팅 올리기' }).click();
  await expect(launched.page.locator('output')).toHaveText('$2.00');
  const dir = launched.userDataDir;
  const backup = JSON.parse(await readFile(join(dir, 'app-session.backup.json'), 'utf8'));
  await launched.app.close();
  const legacy = JSON.stringify({ schemaVersion: 1, revision: 0, state: createSession(createShoeFactory()(), { balanceCents: 98765 }), lastAppliedCommand: null });
  await writeFile(join(dir, 'session.json'), legacy);
  await rm(join(dir, 'app-session.json'));
  launched = await launchApp({ userDataDir: dir, startAtMenu: true });
  await expect(launched.page.getByRole('button', { name: '백업 복구' })).toBeVisible();
  await launched.page.getByRole('button', { name: '백업 복구' }).click();
  await expect(launched.page.locator('.balance strong')).toHaveText('$100.00');
  expect((await saved()).games).toEqual(backup.games);
  expect(await readFile(join(dir, 'session.json'), 'utf8')).toBe(legacy);
});

test('APP-05 딜과 메뉴 동시 요청은 하나만 적용하고 늦은 블랙잭 명령은 메뉴에서 거부한다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('standard-win') });
  const results = await launched.page.evaluate(async () => {
    const s = await window.molsino.getSnapshot();
    return Promise.all([
      window.molsino.dispatch({ sessionId: s.sessionId, commandId: crypto.randomUUID(), expectedRevision: s.revision, action: { type: 'goToMenu' } }),
      window.molsino.dispatch({ sessionId: s.sessionId, commandId: crypto.randomUUID(), expectedRevision: s.revision, action: { type: 'blackjack', action: { type: 'deal' } } }),
    ]);
  });
  expect(results.filter(r => r.ok)).toHaveLength(1);
  expect(await saved()).toMatchObject({ screen: 'menu', activeRoundGameId: null, wallet: { balanceCents: 10000 } });
  expect(await command({ type: 'blackjack', action: { type: 'deal' } })).toMatchObject({ ok: false });
});

test('APP-03 딜러 정산 저장 실패도 같은 카드 후보로 재시도하여 한 번만 지급한다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('standard-win'), autoDelayMs: 1000 });
  await launched.page.getByRole('button', { name: '딜', exact: true }).click();
  await launched.page.getByRole('button', { name: '스탠드', exact: true }).click();
  await expect.poll(async () => (await saved()).games.blackjack.round.phase).toBe('dealerTurn');
  const before = await saved();
  const file = join(launched.userDataDir, 'app-session.backup.json');
  await rm(file, { force: true }); await mkdir(file);
  await expect(launched.page.getByRole('button', { name: '저장 재시도' })).toBeVisible();
  expect(await saved()).toEqual(before);
  await rm(file, { recursive: true });
  await launched.page.getByRole('button', { name: '저장 재시도' }).click();
  await expect(launched.page.getByRole('button', { name: '다음 판' })).toBeVisible();
  const result = await saved();
  expect(result).toMatchObject({ activeRoundGameId: null, wallet: { balanceCents: 10100 }, games: { blackjack: { shoe: { nextIndex: 5 } } } });
  expect(result.games.blackjack.ledger).toHaveLength(1);
  launched = await relaunchApp(launched, { startAtMenu: true });
  expect((await saved()).wallet.balanceCents).toBe(10100);
});

test('APP-07 전체 초기화 저장 실패 후 재시도 성공하면 확인 화면을 닫는다', async () => {
  launched = await launchApp({ startAtMenu: true });
  const before = await saved();
  // A directory at the destination forces the atomic backup write to fail.
  const file = join(launched.userDataDir, 'app-session.backup.json');
  await mkdir(file);
  await launched.page.getByRole('button', { name: '새 시작', exact: true }).click();
  await launched.page.getByRole('button', { name: '초기화 확정' }).click();
  await expect(launched.page.getByRole('button', { name: '저장 재시도' })).toBeVisible();
  expect(await saved()).toEqual(before);
  await rm(file, { recursive: true });
  await launched.page.getByRole('button', { name: '저장 재시도' }).click();
  await expect(launched.page.getByRole('button', { name: '블랙잭', exact: true })).toBeEnabled();
  await expect(launched.page.getByRole('button', { name: '초기화 확정' })).toHaveCount(0);
  const after = await saved();
  expect(after.revision).toBe(before.revision + 1);
  expect(after.sessionId).not.toBe(before.sessionId);
});
