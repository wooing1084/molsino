const { _electron: electron } = require('playwright');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

(async () => {
  const executablePath = process.env.MOLSINO_SMOKE_EXECUTABLE;
  const userDataDir = await mkdtemp(join(tmpdir(), 'molsino-smoke-'));
  const env = { ...process.env, MOLSINO_TEST_USER_DATA: userDataDir };
  let application;
  try {
    application = await electron.launch(executablePath ? { executablePath, env } : { args: ['.'], env });
    const page = await application.firstWindow();
    await page.getByText('베팅 후 딜하세요').waitFor();
    await page.getByRole('button', { name: '베팅 올리기' }).click();
    await page.locator('output').filter({ hasText: '$2.00' }).waitFor();
    const betting = await page.evaluate(() => window.blackjack.getSnapshot());
    if (betting.pendingBetCents !== 200 || betting.balanceCents !== 10000) throw new Error('Betting state mismatch');
    await page.getByRole('button', { name: '딜' }).click();
    await page.locator('.hand.player .card').first().waitFor();
    const state = await page.evaluate(() => window.blackjack.getSnapshot());
    if (state.playerHands.length < 1 || state.phase === 'betting') throw new Error('Deal did not reach BlackjackCore');
    const isolation = await page.evaluate(() => typeof window.require === 'undefined');
    if (!isolation) throw new Error('Node exposed to renderer');
    console.log('Smoke OK: renderer, GameStore, BlackjackCore deal, IPC, Node isolation');
  } finally {
    await application?.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
