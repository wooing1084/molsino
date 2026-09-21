import { expect, test } from '@playwright/test';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createSession, transition } from '../../src/core/engine';
import { createShoeFactory } from '../../src/main/game/shoe-source';
import { newAppSession } from '../../src/main/persistence/app-session-repository';
import { channels } from '../../src/shared/contracts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeApp, launchApp, relaunchApp, type LaunchedApp } from './support/app';
import { appCommand, appSnapshot } from './support/app-game';
import { fixturePath } from './support/fixtures';

let launched: LaunchedApp;
test.afterEach(async () => { if (launched) await closeApp(launched); });

test('N04-01 투명도 패널과 게임은 설정 알파를 한 번 적용한다', async () => {
  launched = await launchApp({ startAtMenu: true });
  const p = launched.page;
  await p.getByRole('button', { name: '흰색/검정 전환' }).hover();
  await expect.poll(() => launched.app.windows().length).toBe(2);
  const panel = launched.app.windows()[1]!;
  await panel.getByRole('slider', { name: '불투명도' }).hover();
  for (const percent of [20, 65, 100]) {
    await panel.evaluate(percent => window.molsino.setOpacity(percent), percent);
    await expect.poll(() => panel.locator('.opacity-popover').evaluate(el => getComputedStyle(el).opacity)).toBe(String(percent / 100));
    await expect.poll(() => p.locator('.overlay').evaluate(el => getComputedStyle(el).opacity)).toBe(String(percent / 100));
    // Child controls must not multiply the shared alpha a second time.
    expect(await panel.getByRole('slider').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  }
});

test('N04-02 최소 창에서 레벨 탐색은 적용 전 현재 레벨을 바꾸지 않는다', async () => {
  launched = await launchApp({ startAtMenu: true });
  const p = launched.page;
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ width: 220, height: 150 }));
  await expect(p.getByLabel('현재 테이블 레벨', { exact: true })).toHaveText('Lv.1');
  await p.getByRole('button', { name: '테이블 레벨', exact: true }).click();
  await expect(p.getByRole('button', { name: '이전 레벨', exact: true })).toBeDisabled();
  await p.getByRole('button', { name: '다음 레벨', exact: true }).click();
  await expect(p.getByText('$400 부족', { exact: false })).toBeVisible();
  await expect(p.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
  await expect(p.getByLabel('현재 테이블 레벨', { exact: true })).toHaveText('Lv.1');
  for (const name of ['이전 레벨', '다음 레벨', '뒤로', '적용']) {
    const box = await p.getByRole('button', { name, exact: true }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(24); expect(box!.height).toBeGreaterThanOrEqual(24);
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(220);
    expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(150);
  }
  await p.getByRole('button', { name: '뒤로', exact: true }).click();
  await p.getByRole('button', { name: '블랙잭', exact: true }).click();
  await expect(p.getByLabel('베팅 한도', { exact: true })).toHaveText('최소 $1 · 최대 $50');
});

test('N04-03 Lv1 동일 상한은 두 게임과 P/B/T의 Main 명령에 적용된다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('standard-win') });
  const p = launched.page;
  expect(await appCommand(p, { type: 'blackjack', action: { type: 'setBet', amountCents: 5000 } })).toMatchObject({ ok: true });
  const before = await appSnapshot(p);
  expect(await appCommand(p, { type: 'blackjack', action: { type: 'setBet', amountCents: 5001 } })).toMatchObject({ ok: false });
  expect((await appSnapshot(p)).revision).toBe(before.revision);
  await appCommand(p, { type: 'goToMenu' });
  await p.getByRole('button', { name: '바카라', exact: true }).click();
  await expect.poll(async () => (await appSnapshot(p)).screen).toBe('baccarat');
  for (const target of ['P', 'B', 'T'] as const) {
    expect(await appCommand(p, { type: 'baccarat', action: { type: 'setBet', target, amountCents: 5000 } })).toMatchObject({ ok: true });
    expect(await appCommand(p, { type: 'baccarat', action: { type: 'setBet', target, amountCents: 5001 } })).toMatchObject({ ok: false });
  }
});

test('N04-04 0ms Main 진행에도 바카라 첫 카드만 공개하고 결과·잔액·기록은 기다린다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'molsino-n04-'));
  const fixture = join(dir, 'baccarat-shoe.json');
  await writeFile(fixture, JSON.stringify({ ranks: ['A', 'A', '9', '2', 'K', '3'] }));
  launched = await launchApp({ startAtMenu: true, userDataDir: dir, baccaratFixture: fixture, autoDelayMs: 0 });
  const p = launched.page;
  await p.getByRole('button', { name: '바카라', exact: true }).click();
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect.poll(async () => (await appSnapshot(p)).baccarat?.phase, { intervals: [10] }).toBe('result');
  const early = await p.locator('.baccarat-hands .card').allTextContents();
  expect(early.filter(value => value !== '?')).toHaveLength(1);
  expect(early[0]).toMatch(/^9/);
  await expect(p.getByLabel('최근 바카라 결과')).toHaveText('최근 결과 없음');
  expect(await p.locator('.balance strong').textContent()).not.toBe('$101.00');
  expect(await p.getByRole('status').textContent()).not.toContain('Player 승');
  await expect(p.getByRole('button', { name: '메뉴', exact: true })).toBeDisabled();
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  await expect(p.getByRole('status')).toContainText('Player 승');
  await expect(p.locator('.balance strong')).toHaveText('$101.00');
  await expect(p.getByLabel('최근 바카라 결과')).toHaveText('P');
});

async function saved() { return JSON.parse(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8')); }
async function seeded(balanceCents: number, selectedLevel: 1 | 2 | 3 | 4 | 5 | 6 = 1, ranks = ['9', '2', 'K', '3']) {
  const dir = await mkdtemp(join(tmpdir(), 'molsino-n04-levels-'));
  const state = newAppSession();
  state.wallet.balanceCents = balanceCents;
  state.table = { selectedLevel, bestBankrollCents: Math.max(balanceCents, [100, 50000, 250000, 1000000, 5000000, 10000000][selectedLevel - 1]!) };
  await writeFile(join(dir, 'app-session.json'), JSON.stringify(state));
  const fixture = join(dir, 'baccarat-shoe.json');
  await writeFile(fixture, JSON.stringify({ ranks: ['A', 'A', ...ranks] }));
  launched = await launchApp({ startAtMenu: true, userDataDir: dir, baccaratFixture: fixture, shoeFixture: fixturePath('standard-win'), autoDelayMs: 0 });
}

test('N04-05 Lv2 입장·센트 경계·상시 한도·재시작과 새 시작', async ({}, testInfo) => {
  await seeded(50000); const p = launched.page;
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ width: 220, height: 150 }));
  await p.getByRole('button', { name: '테이블 레벨', exact: true }).click();
  await p.getByRole('button', { name: '다음 레벨', exact: true }).click();
  await p.screenshot({ path: testInfo.outputPath('levels-220x150.png') });
  await p.getByRole('button', { name: '적용', exact: true }).click();
  await expect(p.getByLabel('현재 테이블 레벨', { exact: true })).toHaveText('Lv.2');
  for (const game of ['블랙잭', '바카라']) {
    await p.getByRole('button', { name: game, exact: true }).click();
    await expect(p.getByLabel('베팅 한도', { exact: true })).toHaveText('최소 $5 · 최대 $250');
    const limits = await p.getByLabel('베팅 한도', { exact: true }).boundingBox();
    expect(limits!.y + limits!.height).toBeLessThanOrEqual(150);
    await p.getByRole('button', { name: '베팅 금액', exact: true }).click();
    const input = p.getByRole('textbox', { name: '베팅 금액' });
    for (const invalid of ['4.99', '250.01']) {
      await input.fill(invalid); await input.press('Enter'); await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(p.getByLabel('베팅 한도', { exact: true })).toBeVisible();
    }
    await input.fill('250'); await input.press('Enter');
    await expect(p.locator('output')).toHaveText('$250.00');
    await p.screenshot({ path: testInfo.outputPath(`${game}-limits-220x150.png`) });
    await p.getByRole('button', { name: '메뉴', exact: true }).click();
    await expect.poll(async () => (await appSnapshot(p)).screen).toBe('menu');
  }
  launched = await relaunchApp(launched, { startAtMenu: true });
  await expect(launched.page.getByLabel('현재 테이블 레벨', { exact: true })).toHaveText('Lv.2');
  expect((await saved()).table).toEqual({ selectedLevel: 2, bestBankrollCents: 50000 });
  await launched.page.getByRole('button', { name: '새 시작', exact: true }).click();
  await launched.page.getByRole('button', { name: '초기화 확정', exact: true }).click();
  await expect(launched.page.getByLabel('현재 테이블 레벨', { exact: true })).toHaveText('Lv.1');
  expect((await saved()).table).toEqual({ selectedLevel: 1, bestBankrollCents: 10000 });
});

test('N04-06 입장 후 손실은 방을 유지하되 나간 뒤 재입장은 현재 잔액으로 검사한다', async () => {
  await seeded(50000, 2); const p = launched.page;
  await p.getByRole('button', { name: '바카라', exact: true }).click();
  await p.getByRole('button', { name: 'Tie 베팅', exact: true }).click();
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  await expect(p.locator('.balance strong')).toHaveText('$495.00');
  await expect(p.getByLabel('현재 테이블 레벨', { exact: true })).toHaveText('Lv.2');
  expect((await saved()).table.bestBankrollCents).toBe(50000);
  await p.getByRole('button', { name: '다음 판', exact: true }).click();
  await expect(p.getByRole('button', { name: '딜', exact: true })).toBeEnabled();
  await p.getByRole('button', { name: '메뉴', exact: true }).click();
    await expect.poll(async () => (await appSnapshot(p)).screen).toBe('menu');
  expect(await appCommand(p, { type: 'selectLevel', level: 1 })).toMatchObject({ ok: true });
  expect(await appCommand(p, { type: 'selectLevel', level: 2 })).toMatchObject({ ok: false });
  expect((await appSnapshot(p)).table).toMatchObject({ selectedLevel: 1, bestLevel: 2 });
});

test('N04-07 레벨 변경 저장 실패는 이전 레벨을 유지하고 동일 후보로 재시도한다', async () => {
  await seeded(50000); const p = launched.page;
  const backup = join(launched.userDataDir, 'app-session.backup.json');
  await mkdir(backup);
  await p.getByRole('button', { name: '테이블 레벨', exact: true }).click();
  await p.getByRole('button', { name: '다음 레벨', exact: true }).click();
  await p.getByRole('button', { name: '적용', exact: true }).click();
  await expect(p.getByRole('button', { name: '저장 재시도', exact: true })).toBeVisible();
  await expect(p.getByLabel('현재 테이블 레벨', { exact: true })).toHaveText('Lv.1');
  expect((await saved()).table.selectedLevel).toBe(1);
  await rm(backup, { recursive: true });
  await p.getByRole('button', { name: '저장 재시도', exact: true }).click();
  await expect(p.getByLabel('현재 테이블 레벨', { exact: true })).toHaveText('Lv.2');
  expect((await saved()).revision).toBe(1);
  await expect(p.getByRole('button', { name: '블랙잭', exact: true })).toBeVisible();
});

for (const source of ['primary', 'backup'] as const) test(`N04-08 v2 ${source}의 $75 진행 판은 카드·슈·잔액을 보존하고 다음 판만 한도를 적용한다`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'molsino-n04-v2-'));
  const factory = createShoeFactory(fixturePath('standard-win'));
  const state = transition(createSession(factory(), { balanceCents: 20000, pendingBetCents: 7500 }), { type: 'deal' }, { createShoe: factory, nextId: () => randomUUID() }).nextState;
  const { balanceCents, ...blackjack } = state;
  const legacy = { schemaVersion: 2, sessionId: randomUUID(), revision: 7, screen: 'blackjack', wallet: { balanceCents }, activeRoundGameId: 'blackjack', games: { blackjack, baccarat: null }, lastAppliedCommand: null };
  await writeFile(join(dir, source === 'primary' ? 'app-session.json' : 'app-session.backup.json'), JSON.stringify(legacy));
  if (source === 'backup') await writeFile(join(dir, 'app-session.json'), '{broken');
  launched = await launchApp({ userDataDir: dir, startAtMenu: true, autoDelayMs: 0 }); const p = launched.page;
  if (source === 'backup') await p.getByRole('button', { name: '백업 복구', exact: true }).click();
  await expect(p.getByRole('button', { name: '스탠드', exact: true })).toBeEnabled();
  const migrated = await saved();
  expect(migrated.schemaVersion).toBe(3); expect(migrated.games.blackjack).toEqual(blackjack);
  expect(migrated.wallet.balanceCents).toBe(12500);
  expect(migrated.table).toEqual({ selectedLevel: 1, bestBankrollCents: 12500 });
  await p.getByRole('button', { name: '스탠드', exact: true }).click();
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  expect((await saved()).wallet.balanceCents).toBe(27500);
  expect((await saved()).games.blackjack.round.playerHands[0].wagerCents).toBe(7500);
  await p.getByRole('button', { name: '다음 판', exact: true }).click();
  await expect(p.locator('output')).toHaveText('$50.00');
  expect(await appCommand(p, { type: 'blackjack', action: { type: 'setBet', amountCents: 7500 } })).toMatchObject({ ok: false });
});

for (const restore of ['reload', 'hide'] as const) test(`N04-09 ${restore}는 진행 연출을 반복하지 않고 최신 저장 결과를 즉시 표시한다`, async () => {
  await seeded(10000); const p = launched.page;
  await p.getByRole('button', { name: '바카라', exact: true }).click();
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect.poll(async () => (await appSnapshot(p)).baccarat?.phase, { intervals: [10] }).toBe('result');
  expect(await p.locator('.card[data-revealed="true"]').count()).toBe(1);
  const committed = await saved();
  if (restore === 'reload') await p.reload();
  else { await p.getByRole('button', { name: '숨기기' }).click();
    await expect.poll(async () => (await p.evaluate(() => window.molsino.getOverlayState())).visibility).toBe('hidden');
    await launched.app.evaluate(({ app }) => { app.emit('activate'); }); }
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled({ timeout: 800 });
  await expect(p.locator('.balance strong')).toHaveText('$101.00');
  expect(await saved()).toEqual(committed);
});

test('N04-10 6장 공개는 450ms 순서·부분 합계·300ms 정산을 지키며 같은 revision 재전송에 반복되지 않는다', async () => {
  await seeded(10000, 1, ['2', '2', '3', '4', '6', 'A']); const p = launched.page;
  await p.getByRole('button', { name: '바카라', exact: true }).click();
  await p.getByRole('button', { name: 'Banker 베팅', exact: true }).click();
  await p.evaluate(() => {
    const trace: { at: number; faces: string[]; totals: string[]; status: string; balance: string; history: string }[] = [];
    (window as unknown as { revealTrace: typeof trace }).revealTrace = trace;
    new MutationObserver(() => {
      trace.push({ at: performance.now(), faces: [...document.querySelectorAll('.card[data-revealed="true"]')].map(e => e.textContent!),
        totals: [...document.querySelectorAll('.baccarat-hands small')].map(e => e.textContent!), status: document.querySelector('footer')?.textContent ?? '',
        balance: document.querySelector('.balance strong')?.textContent ?? '', history: document.querySelector('.baccarat-history')?.textContent ?? '' });
    }).observe(document.querySelector('#root')!, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect(p.locator('.card[data-revealed="true"]')).toHaveCount(2);
  const current = await appSnapshot(p);
  await launched.app.evaluate(({ BrowserWindow }, payload) => BrowserWindow.getAllWindows()[0]!.webContents.send(payload.channel, payload.state), { channel: channels.state, state: current });
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  const trace = await p.evaluate(() => (window as unknown as { revealTrace: { at: number; faces: string[]; totals: string[]; status: string; balance: string; history: string }[] }).revealTrace);
  const first = Array.from({ length: 6 }, (_, i) => trace.find(f => f.faces.length === i + 1)!);
  expect(first.every(Boolean)).toBe(true);
  for (let i = 1; i < 6; i++) expect(first[i]!.at - first[i - 1]!.at).toBeGreaterThanOrEqual(350);
  expect(first.map(f => f.faces.map(c => c.replace(/[♠♥♦♣]/g, '')).join(','))).toEqual(['2', '2,2', '2,3,2', '2,3,2,4', '2,3,6,2,4', '2,3,6,2,4,A']);
  // Values come from the deterministic shoe; only exposed faces may contribute to displayed totals.
  expect(first[0]!.totals).toEqual(['Player · 2', 'Banker · –']);
  const result = trace.find(f => f.status.includes('Banker 승'))!;
  expect(result.at - first[5]!.at).toBeGreaterThanOrEqual(200);
  for (const frame of trace.filter(f => f.at < result.at)) {
    expect(frame.status).not.toContain('Banker 승'); expect(frame.history).not.toBe('B'); expect(frame.balance).not.toBe('$100.95');
  }
  const settled = await saved();
  await launched.app.evaluate(({ BrowserWindow }, payload) => BrowserWindow.getAllWindows()[0]!.webContents.send(payload.channel, payload.state), { channel: channels.state, state: await appSnapshot(p) });
  await expect(p.locator('.card[data-revealed="true"]')).toHaveCount(6);
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  expect(await saved()).toEqual(settled);
});

test('N04-11 블랙잭 첫 배분은 플레이어→딜러→플레이어 순서이고 판단을 기다린다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('standard-win'), autoDelayMs: 0 }); const p = launched.page;
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect(p.locator('.card[data-revealed="true"]')).toHaveCount(1);
  await expect(p.locator('.player .card[data-revealed="true"]')).toHaveText('10♠');
  const stand = p.getByRole('button', { name: '스탠드', exact: true });
  expect(await stand.count() === 0 || !await stand.isEnabled()).toBe(true);
  expect(await p.locator('.player small').textContent()).not.toContain('19');
  await expect(p.locator('.card[data-revealed="true"]')).toHaveCount(2);
  await expect(p.locator('.dealer .card[data-revealed="true"]')).toHaveText('10♣');
  await expect(p.getByRole('button', { name: '스탠드', exact: true })).toBeEnabled();
  await expect(p.locator('.card[data-revealed="true"]')).toHaveCount(3);
  await expect(p.locator('.dealer')).not.toContainText('6♥');
  await expect(p.getByLabel('베팅 한도', { exact: true })).toHaveText('최소 $1 · 최대 $50');
});

test('N04-12 자연 블랙잭은 21·BJ·최종 잔액을 카드보다 먼저 알리지 않는다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('player-blackjack'), autoDelayMs: 0 }); const p = launched.page;
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect.poll(async () => (await appSnapshot(p)).blackjack?.phase, { intervals: [10] }).toBe('result');
  expect(await p.locator('.card[data-revealed="true"]').count()).toBe(1);
  expect(await p.locator('.player small').textContent()).not.toMatch(/21|BJ/);
  expect(await p.getByRole('status').getAttribute('title')).not.toContain('1.50');
  expect(await p.locator('.balance strong').textContent()).not.toBe('$101.50');
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  await expect(p.locator('.balance strong')).toHaveText('$101.50');
  await expect(p.locator('.player small')).toContainText('BJ');
});

test('N04-13 상한 기본 베팅의 보험은 추가 허용되고 숨겨진 홀 카드는 공개하지 않는다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('insurance-miss'), autoDelayMs: 0 }); const p = launched.page;
  expect(await appCommand(p, { type: 'blackjack', action: { type: 'setBet', amountCents: 5000 } })).toMatchObject({ ok: true });
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await expect(p.getByRole('button', { name: '보험 $25.00', exact: true })).toBeEnabled();
  await expect(p.getByLabel('베팅 한도', { exact: true })).toHaveText('최소 $1 · 최대 $50');
  await p.getByRole('button', { name: '보험 $25.00', exact: true }).click();
  await expect(p.getByRole('button', { name: '스탠드', exact: true })).toBeEnabled();
  expect((await saved()).wallet.balanceCents).toBe(2500);
  await expect(p.locator('.dealer')).not.toContainText('6♥');
  await p.getByRole('button', { name: '스탠드', exact: true }).click();
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  await expect(p.locator('.balance strong')).toHaveText('$25.00');
});

test('N04-14 스플릿은 기존 카드를 다시 감추지 않고 새 카드만 순차 공개한다', async () => {
  launched = await launchApp({ shoeFixture: fixturePath('split-pair'), autoDelayMs: 0 }); const p = launched.page;
  await p.getByRole('button', { name: '딜', exact: true }).click();
  await p.getByRole('button', { name: '스플릿', exact: true }).click();
  const oldFaces = await p.locator('.player .card[data-revealed="true"]').allTextContents();
  expect(oldFaces).toContain('8♠'); expect(oldFaces).toContain('8♦');
  await expect(p.getByRole('button', { name: '더블', exact: true })).toBeEnabled();
  // The established engine draws the second split hand only when it becomes active.
  await expect(p.locator('.player .card[data-revealed="true"]')).toHaveCount(3);
  await p.getByRole('button', { name: '더블', exact: true }).click();
  await p.getByRole('button', { name: '스탠드', exact: true }).click();
  await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
  const ledger = (await saved()).games.blackjack.ledger;
  expect(ledger).toHaveLength(2); // One settlement per split hand, not one per round.
  expect(new Set(ledger.map((entry: { componentId: string }) => entry.componentId)).size).toBe(2);
  expect(new Set(ledger.map((entry: { roundId: string }) => entry.roundId)).size).toBe(1);
});

test('N04-15 여섯 레벨의 동일 최소·최대 경계는 모든 게임과 P/B/T에 적용된다', async () => {
  await seeded(10000000); const p = launched.page;
  const limits = [[100, 5000], [500, 25000], [2500, 100000], [10000, 500000], [50000, 1000000], [100000, 2500000]];
  for (const [index, [minimum, maximum]] of limits.entries()) {
    const level = (index + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    expect(await appCommand(p, { type: 'selectLevel', level })).toMatchObject({ ok: true });
    await appCommand(p, { type: 'selectGame', gameId: 'blackjack' });
    for (const amountCents of [minimum!, maximum!]) expect(await appCommand(p, { type: 'blackjack', action: { type: 'setBet', amountCents } })).toMatchObject({ ok: true });
    for (const amountCents of [minimum! - 1, maximum! + 1]) expect(await appCommand(p, { type: 'blackjack', action: { type: 'setBet', amountCents } })).toMatchObject({ ok: false });
    await appCommand(p, { type: 'goToMenu' });
    await appCommand(p, { type: 'selectGame', gameId: 'baccarat' });
    for (const target of ['P', 'B', 'T'] as const) {
      for (const amountCents of [minimum!, maximum!]) expect(await appCommand(p, { type: 'baccarat', action: { type: 'setBet', target, amountCents } })).toMatchObject({ ok: true });
      for (const amountCents of [minimum! - 1, maximum! + 1]) {
        const rejected = await appCommand(p, { type: 'baccarat', action: { type: 'setBet', target, amountCents } }).catch(() => ({ ok: false }));
        expect(rejected).toMatchObject({ ok: false });
      }
    }
    await appCommand(p, { type: 'goToMenu' });
  }
});

test('N04-16 방 최소액 미만에서는 두 게임 딜을 막고 하위 레벨로 이동할 수 있다', async () => {
  await seeded(499, 2); const p = launched.page;
  for (const gameId of ['blackjack', 'baccarat'] as const) {
    await appCommand(p, { type: 'selectGame', gameId });
    await expect(p.getByLabel('베팅 한도', { exact: true })).toHaveText('최소 $5 · 최대 $250');
    expect(await appCommand(p, { type: gameId, action: { type: 'deal' } })).toMatchObject({ ok: false });
    await expect(p.getByRole('status')).toContainText('하위 레벨');
    await appCommand(p, { type: 'goToMenu' });
  }
  expect(await appCommand(p, { type: 'selectLevel', level: 1 })).toMatchObject({ ok: true });
  await p.getByRole('button', { name: '바카라', exact: true }).click();
  await expect(p.getByRole('button', { name: '딜', exact: true })).toBeEnabled();
});

test('N04-17 최소 창의 좌우 끝·숨김 탐색 유지·reload 복귀와 가로 스크롤', async () => {
  launched = await launchApp({ startAtMenu: true }); const p = launched.page;
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ width: 220, height: 150 }));
  await p.getByRole('button', { name: '테이블 레벨', exact: true }).click();
  for (let index = 0; index < 5; index++) await p.getByRole('button', { name: '다음 레벨', exact: true }).click();
  await expect(p.getByRole('button', { name: '다음 레벨', exact: true })).toBeDisabled();
  await expect(p.getByRole('status')).toHaveText('6 / 6');
  await p.getByRole('button', { name: '숨기기' }).click();
  await expect.poll(async () => (await p.evaluate(() => window.molsino.getOverlayState())).visibility).toBe('hidden');
  await launched.app.evaluate(({ app }) => { app.emit('activate'); });
  await expect(p.getByRole('status')).toHaveText('6 / 6');
  const track = p.getByLabel('테이블 레벨 목록', { exact: true });
  await track.hover(); await p.mouse.wheel(-2000, 0);
  await expect(p.getByRole('status')).toHaveText('1 / 6');
  await expect(p.getByRole('button', { name: '이전 레벨', exact: true })).toBeDisabled();
  await p.getByRole('button', { name: '다음 레벨', exact: true }).click();
  await p.reload();
  await expect(p.getByRole('button', { name: '블랙잭', exact: true })).toBeVisible();
  await expect(p.getByLabel('현재 테이블 레벨', { exact: true })).toHaveText('Lv.1');
});

test('N04-18 최소 창에서 Lv1·Lv6 양 게임 한도·카드와 흑백 배치를 확인한다', async ({}, testInfo) => {
  await seeded(10000000); let p = launched.page;
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ width: 220, height: 150 }));
  for (const level of [1, 6] as const) {
    if (level === 6) {
      await closeApp(launched); await seeded(10000000); p = launched.page;
      await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ width: 220, height: 150 }));
    }
    expect(await appCommand(p, { type: 'selectLevel', level })).toMatchObject({ ok: true });
    await p.getByRole('button', { name: '테이블 레벨', exact: true }).click();
    await p.screenshot({ path: testInfo.outputPath(`level${level}-picker-220x150.png`) });
    await p.getByRole('button', { name: '뒤로', exact: true }).click();
    for (const gameId of ['blackjack', 'baccarat'] as const) {
      await appCommand(p, { type: 'selectGame', gameId });
      if ((await appSnapshot(p))[gameId]?.phase === 'result') await p.getByRole('button', { name: '다음 판', exact: true }).click();
      const maximum = (await appSnapshot(p)).table.maxBetCents;
      expect(await appCommand(p, gameId === 'blackjack'
        ? { type: 'blackjack', action: { type: 'setBet', amountCents: maximum } }
        : { type: 'baccarat', action: { type: 'setBet', target: 'P', amountCents: maximum } })).toMatchObject({ ok: true });
      await expect(p.locator('output')).toHaveText(`$${(maximum / 100).toFixed(2)}`);
      const line = p.getByLabel('베팅 한도', { exact: true });
      const box = await line.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(220);
      expect(box!.y + box!.height).toBeLessThanOrEqual(150);
      expect(await line.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
      await p.screenshot({ path: testInfo.outputPath(`level${level}-${gameId}-betting-220x150.png`) });
      await p.getByRole('button', { name: '딜', exact: true }).click();
      if (gameId === 'blackjack') await p.getByRole('button', { name: '스탠드', exact: true }).click();
      await expect(p.getByRole('button', { name: '다음 판', exact: true })).toBeEnabled();
      await expect(line).toBeVisible();
      await p.screenshot({ path: testInfo.outputPath(`level${level}-${gameId}-result-220x150.png`) });
      if (level === 6) {
        await p.getByRole('button', { name: '흰색/검정 전환' }).click(); await p.mouse.move(10, 90);
        const backing = await p.addStyleTag({ content: 'body { background: #f5f5f5; }' });
        await p.screenshot({ path: testInfo.outputPath(`level${level}-${gameId}-dark-220x150.png`) });
        await backing.evaluate(node => node.parentNode?.removeChild(node));
        await p.getByRole('button', { name: '흰색/검정 전환' }).click(); await p.mouse.move(10, 90);
      }
      await p.getByRole('button', { name: '메뉴', exact: true }).click();
    await expect.poll(async () => (await appSnapshot(p)).screen).toBe('menu');
    }
  }
});
