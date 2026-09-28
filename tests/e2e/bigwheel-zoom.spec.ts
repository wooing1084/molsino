import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeApp, launchApp, type LaunchedApp } from './support/app';
import { appSnapshot } from './support/app-game';
import { channels } from '../../src/shared/contracts';
import type { AppSession } from '../../src/main/persistence/app-session-repository';

let launched: LaunchedApp;
test.afterEach(async () => { if (launched) await closeApp(launched); });
const wheel = () => launched.page.getByLabel('빅휠 세 칸 확대', { exact: true });
async function start(indices = [0], autoDelayMs = 0) {
  const dir = await mkdtemp(join(tmpdir(), 'molsino-bigwheel-zoom-'));
  const fixture = join(dir, 'segments.json');
  await writeFile(fixture, JSON.stringify({ indices }));
  launched = await launchApp({ startAtMenu: true, userDataDir: dir, bigwheelFixture: fixture, autoDelayMs });
  await launched.page.getByRole('button', { name: '빅휠', exact: true }).click();
  await expect(wheel()).toBeVisible();
}
async function saved(): Promise<AppSession> { return JSON.parse(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8')); }
async function resize(width: number, height: number) {
  const handle = await launched.app.browserWindow(launched.page);
  await handle.evaluate((window, size) => window.setBounds(size), { width, height });
  await expect.poll(() => handle.evaluate(window => { const { width, height } = window.getBounds(); return { width, height }; })).toEqual({ width, height });
  await handle.dispose();
  await expect.poll(() => launched.page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width, height });
  await paint();
}
async function paint() { await launched.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
async function settled(index: number) {
  await expect(wheel()).toHaveAttribute('data-phase', 'result');
  await expect(wheel()).toHaveAttribute('data-segment-index', String(index));
  const cells = wheel().locator('.bigwheel-cell[data-offset="-1"], .bigwheel-cell[data-offset="0"], .bigwheel-cell[data-offset="1"]');
  await expect(cells).toHaveCount(3);
  expect(await cells.evaluateAll(cells => cells.map(cell => Number(cell.getAttribute('data-cell-index'))))).toEqual([(index + 53) % 54, index, (index + 1) % 54]);
  const geometry = await wheel().evaluate(el => {
    const view = el.getBoundingClientRect();
    const pointer = el.querySelector('.bigwheel-pointer')!.getBoundingClientRect();
    const center = el.querySelector('.bigwheel-cell[data-offset="0"]')!.getBoundingClientRect();
    const visible = [...el.querySelectorAll('.bigwheel-cell')].filter(cell => { const box = cell.getBoundingClientRect(); return Math.min(box.right, view.right) - Math.max(box.left, view.left) > 1; });
    return { pointerX: pointer.x + pointer.width / 2, centerX: center.x + center.width / 2, viewportX: view.x + view.width / 2, visible: visible.length };
  });
  expect(geometry.visible).toBe(3);
  expect(Math.abs(geometry.pointerX - geometry.centerX)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.pointerX - geometry.viewportX)).toBeLessThanOrEqual(1);
}
interface Frame { at: number; phase: string; pos: number; result: string | null; status: string; balance: string; history: string; width: number; cells: { index: number; x: number }[]; }
interface Trace { frames: Frame[]; done: boolean; }
async function traceMotion() {
  await launched.page.evaluate(() => {
    const trace: Trace = { frames: [], done: false };
    (window as unknown as { wheelTrace: Trace }).wheelTrace = trace;
    let started = false;
    function sample() {
      const el = document.querySelector('.bigwheel-window')!;
      const phase = el.getAttribute('data-phase')!;
      if (phase === 'spinning') started = true;
      if (started) trace.frames.push({ at: performance.now(), phase, pos: Number(el.getAttribute('data-position')), result: el.getAttribute('data-segment-index'),
        status: document.querySelector('footer')?.textContent ?? '', balance: document.querySelector('.balance strong')?.textContent ?? '', history: document.querySelector('.bigwheel-history')?.textContent ?? '',
        width: innerWidth, cells: [...el.querySelectorAll('.bigwheel-cell')].map(cell => ({ index: Number(cell.getAttribute('data-cell-index')), x: cell.getBoundingClientRect().x })) });
      if (started && phase === 'result') trace.done = true;
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}
async function finishedTrace() {
  await launched.page.waitForFunction(() => (window as unknown as { wheelTrace: Trace }).wheelTrace.done, undefined, { timeout: 8000 });
  return launched.page.evaluate(() => (window as unknown as { wheelTrace: Trace }).wheelTrace.frames);
}
function assertForward(frames: Frame[], finalBalance: string) {
  const spinning = frames.filter(frame => frame.phase === 'spinning');
  expect(spinning.length).toBeGreaterThan(10);
  let movingPairs = 0;
  const speeds: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const before = frames[i - 1]!, after = frames[i]!;
    expect(after.pos + 0.001).toBeGreaterThanOrEqual(before.pos);
    if (after.at > before.at) speeds.push((after.pos - before.pos) / (after.at - before.at));
    if (before.width !== after.width || after.pos - before.pos >= 5) continue;
    const common = before.cells.find(cell => after.cells.some(other => other.index === cell.index));
    if (common && after.pos - before.pos > 0.01) {
      const moved = after.cells.find(cell => cell.index === common.index)!;
      expect(moved.x).toBeLessThan(common.x + 0.1);
      movingPairs++;
    }
  }
  expect(movingPairs).toBeGreaterThan(5);
  expect(Math.max(...speeds)).toBeGreaterThan(0.01);
  expect(speeds.slice(-4).reduce((a, b) => a + b, 0) / 4).toBeLessThan(Math.max(...speeds) / 2);
  for (const frame of spinning) {
    expect(frame.result).toBeNull(); expect(frame.status).not.toContain('반환');
    expect(frame.history).toBe('최근 결과 없음'); expect(frame.balance).not.toBe(finalBalance);
  }
}

test('BW-11 세 칸 확대 표시를 실제 빅휠 화면에서 제공한다', async () => { await start(); });
for (const scenario of [
  { index: 0, name: '실버', payout: '1:1', neighbors: ['메가', '실버', '실버'] },
  { index: 1, name: '실버', payout: '1:1', neighbors: ['실버', '실버', '실버'] },
  { index: 52, name: '조커', payout: '40:1', neighbors: ['크리스탈', '조커', '메가'] },
  { index: 53, name: '메가', payout: '40:1', neighbors: ['조커', '메가', '실버'] },
]) test(`BW-11 칸 ${scenario.index} ${scenario.name}의 실제 이웃 세 칸과 중앙 포인터를 정렬한다`, async () => {
  await start([scenario.index]);
  await launched.page.getByRole('button', { name: '회전', exact: true }).click();
  await settled(scenario.index);
  const cells = wheel().locator('.bigwheel-cell[data-offset="-1"], .bigwheel-cell[data-offset="0"], .bigwheel-cell[data-offset="1"]');
  expect(await cells.locator('.bigwheel-cell-name').allTextContents()).toEqual(scenario.neighbors);
  await expect(wheel().locator('.bigwheel-cell[data-offset="0"] .bigwheel-cell-payout')).toHaveText(scenario.payout);
  await expect(launched.page.locator('footer')).toContainText(scenario.name);
  expect((await saved()).games.bigwheel?.lastResult?.segmentIndex).toBe(scenario.index);
});

test('BW-12 빠른 정산도 실제 칸이 전진·감속한 뒤 결과를 함께 공개한다', async ({}, testInfo) => {
  await start();
  const backing = await launched.page.addStyleTag({ content: 'body { background: #333; }' });
  await traceMotion();
  await launched.page.getByRole('button', { name: '회전', exact: true }).click();
  await expect.poll(async () => (await appSnapshot(launched.page)).bigwheel?.phase).toBe('result');
  await expect(wheel()).toHaveAttribute('data-phase', 'spinning');
  await launched.page.screenshot({ path: testInfo.outputPath('zoom-motion-start.png') });
  await launched.page.waitForFunction(() => { const f = (window as unknown as { wheelTrace: Trace }).wheelTrace.frames; return f.length > 1 && f.at(-1)!.at - f[0]!.at > 700; });
  await launched.page.screenshot({ path: testInfo.outputPath('zoom-motion-middle.png') });
  const frames = await finishedTrace();
  await writeFile(testInfo.outputPath('motion-geometry.json'), JSON.stringify(frames, null, 2));
  assertForward(frames, '$101.00');
  expect(frames.at(-1)!.at - frames[0]!.at).toBeGreaterThanOrEqual(1600);
  await settled(0);
  await expect(launched.page.locator('.balance strong')).toHaveText('$101.00');
  await launched.page.screenshot({ path: testInfo.outputPath('zoom-motion-final.png') });
  await backing.evaluate(node => node.parentNode?.removeChild(node));
});

test('BW-12/13 늦은 정산·중복 snapshot·회전 중 resize에서도 전진을 이어간다', async () => {
  await start([0], 2500); await traceMotion();
  const p = launched.page;
  await p.getByRole('button', { name: '회전', exact: true }).click();
  await p.waitForFunction(() => { const f = (window as unknown as { wheelTrace: Trace }).wheelTrace.frames; return f.length > 1 && f.at(-1)!.at - f[0]!.at > 700; });
  await resize(280, 180);
  const handle = await launched.app.browserWindow(p);
  await handle.evaluate((window, payload) => window.webContents.send(payload.channel, payload.state), { channel: channels.state, state: await appSnapshot(p) });
  await handle.dispose();
  await p.waitForFunction(() => { const f = (window as unknown as { wheelTrace: Trace }).wheelTrace.frames; return f.length > 1 && f.at(-1)!.at - f[0]!.at > 1900; });
  await expect(wheel()).toHaveAttribute('data-phase', 'spinning');
  const frames = await finishedTrace();
  assertForward(frames, '$101.00');
  expect(frames.at(-1)!.at - frames[0]!.at).toBeGreaterThanOrEqual(3500);
  await settled(0);
  expect((await saved()).games.bigwheel?.recentResults).toHaveLength(1);
});

test('BW-12 동작 줄이기는 결과를 미리 정지 표시하지 않고 같은 시점에 공개한다', async () => {
  await start([53]); const p = launched.page;
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await traceMotion();
  await p.getByRole('button', { name: '회전', exact: true }).click();
  await expect(wheel()).toHaveAttribute('data-reduced-motion', 'true');
  const frames = await finishedTrace();
  const moving = frames.filter(frame => frame.phase === 'spinning');
  expect(moving.length).toBeGreaterThan(10);
  expect(new Set(moving.map(frame => frame.pos)).size).toBe(1);
  for (const frame of moving) { expect(frame.result).toBeNull(); expect(frame.status).not.toContain('반환'); expect(frame.history).toBe('최근 결과 없음'); }
  expect(frames.at(-1)!.at - frames[0]!.at).toBeGreaterThanOrEqual(1600);
  await settled(53);
});

test('BW-13 회전 reload와 확정 reload는 같은 판을 복원하고 다음 판은 새 이웃으로 정렬한다', async () => {
  await start([53, 52], 1300); const p = launched.page;
  await p.getByRole('button', { name: '회전', exact: true }).click();
  await expect.poll(async () => (await saved()).games.bigwheel?.phase).toBe('spinning');
  const roundId = (await saved()).games.bigwheel?.round?.roundId;
  await p.reload();
  await expect(wheel()).toHaveAttribute('data-phase', 'spinning');
  await expect(wheel()).not.toHaveAttribute('data-segment-index');
  await settled(53);
  const result = await saved();
  expect(result.games.bigwheel?.lastResult?.roundId).toBe(roundId);
  await p.reload(); await settled(53);
  expect(await saved()).toEqual(result);
  await p.getByRole('button', { name: '다음 판', exact: true }).click();
  await p.getByRole('button', { name: '회전', exact: true }).click();
  await settled(52);
  expect((await saved()).games.bigwheel?.recentResults).toHaveLength(2);
});

test('BW-13 저장 오류 중 계속 이동하고 같은 후보 재시도로 한 번만 결과를 공개한다', async () => {
  await start([52], 1000); const p = launched.page;
  await traceMotion();
  await p.getByRole('button', { name: '회전', exact: true }).click();
  await expect.poll(async () => (await saved()).games.bigwheel?.phase).toBe('spinning');
  const before = await saved();
  const backup = join(launched.userDataDir, 'app-session.backup.json');
  await rm(backup, { force: true }); await mkdir(backup);
  await expect(p.getByRole('button', { name: '저장 재시도', exact: true })).toBeEnabled();
  expect(await saved()).toEqual(before);
  const firstPosition = Number(await wheel().getAttribute('data-position'));
  await p.waitForFunction(first => Number(document.querySelector('.bigwheel-window')?.getAttribute('data-position')) > first + 10, firstPosition);
  await rm(backup, { recursive: true });
  await p.getByRole('button', { name: '저장 재시도', exact: true }).click();
  await settled(52);
  const frames = await finishedTrace();
  for (let i = 1; i < frames.length; i++) expect(frames[i]!.pos + .001).toBeGreaterThanOrEqual(frames[i - 1]!.pos);
  expect((await saved()).games.bigwheel?.recentResults).toHaveLength(1);
  expect((await saved()).wallet.balanceCents).toBe(9900);
});

test('BW-14 최소·기본 창과 흑백에서 세 칸 이름·배당·포인터·기존 조작을 확인한다', async ({}, testInfo) => {
  await start([46]); const p = launched.page;
  await p.getByRole('button', { name: '회전', exact: true }).click();
  await settled(46);
  const backing = await p.addStyleTag({ content: 'body { background: #333; }' });
  for (const [width, height] of [[220, 150], [280, 180]] as const) {
    await resize(width, height); await settled(46);
    for (const ink of ['light', 'dark']) {
      if (ink === 'dark') { await p.getByRole('button', { name: '흰색/검정 전환', exact: true }).click(); await backing.evaluate(node => { node.textContent = 'body { background: #f5f5f5; }'; }); }
      await paint();
      for (const name of ['메뉴', '다음 판']) {
        const box = await p.getByRole('button', { name, exact: true }).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(24); expect(box!.width).toBeGreaterThanOrEqual(24);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      }
      const center = wheel().locator('.bigwheel-cell[data-offset="0"] .bigwheel-cell-name');
      await expect(center).toHaveText('다이아몬드');
      expect(await center.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await p.screenshot({ path: testInfo.outputPath(`bigwheel-zoom-${width}x${height}-${ink}.png`) });
      if (ink === 'dark') { await p.getByRole('button', { name: '흰색/검정 전환', exact: true }).click(); await backing.evaluate(node => { node.textContent = 'body { background: #333; }'; }); }
    }
  }
  await backing.evaluate(node => node.parentNode?.removeChild(node));
});
