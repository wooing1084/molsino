const { _electron: electron } = require('playwright');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

(async () => {
  const executablePath = process.env.MOLSINO_SMOKE_EXECUTABLE || (process.platform === 'darwin'
    ? join(process.cwd(), `out/molsino-darwin-${process.arch}/molsino.app/Contents/MacOS/molsino`)
    : join(process.cwd(), `out/molsino-win32-${process.arch}/molsino.exe`));
  const userDataDir = await mkdtemp(join(tmpdir(), 'molsino-smoke-'));
  const env = { ...process.env, MOLSINO_TEST_USER_DATA: userDataDir, MOLSINO_TEST_HIDE_DOCK: '1' };
  let application;
  try {
    application = await electron.launch(executablePath ? { executablePath, env } : { args: ['.'], env });
    const page = await application.firstWindow();
    await page.getByRole('button', { name: '블랙잭', exact: true }).click();
    await page.getByText('베팅 후 딜하세요').waitFor();
    await page.getByRole('button', { name: '베팅 올리기' }).click();
    await page.locator('output').filter({ hasText: '$2.00' }).waitFor();
    const betting = await page.evaluate(() => window.molsino.getSnapshot());
    if (betting.blackjack?.pendingBetCents !== 200 || betting.balanceCents !== 10000) throw new Error('Betting state mismatch');
    await page.getByRole('button', { name: '딜' }).click();
    await page.locator('.hand.player .card').first().waitFor();
    const state = await page.evaluate(() => window.molsino.getSnapshot());
    if (state.blackjack?.playerHands.length < 1 || state.blackjack?.phase === 'betting') throw new Error('Deal did not reach BlackjackCore');
    const isolation = await page.evaluate(() => typeof window.require === 'undefined');
    if (!isolation) throw new Error('Node exposed to renderer');
    console.log('Smoke OK: menu, AppStore, BlackjackCore deal, IPC, Node isolation');
  } finally {
    await application?.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
