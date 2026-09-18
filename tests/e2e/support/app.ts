// 앱 launch/relaunch 헬퍼 — 격리된 userData와 결정론적 shoe fixture를 Main이 소비한다.
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
}

export interface LaunchOptions {
  userDataDir?: string;
  shoeFixture?: string;
  snapshotDelayMs?: number;
  startAtMenu?: boolean;
  autoDelayMs?: number;
}

async function createTempUserData(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'molsino-e2e-'));
}

export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const userDataDir = options.userDataDir ?? (await createTempUserData());
  const inheritedEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const env: Record<string, string> = {
    ...inheritedEnv,
    MOLSINO_TEST_USER_DATA: userDataDir,
    MOLSINO_TEST_HIDE_DOCK: '1',
  };
  if (options.shoeFixture) env.BLACKJACK_TEST_SHOE_FIXTURE = options.shoeFixture;
  if (options.snapshotDelayMs !== undefined) env.MOLSINO_TEST_SNAPSHOT_DELAY_MS = String(options.snapshotDelayMs);
  else delete env.MOLSINO_TEST_SNAPSHOT_DELAY_MS;
  if (options.autoDelayMs !== undefined) env.MOLSINO_TEST_AUTO_DELAY_MS = String(options.autoDelayMs);
  else delete env.MOLSINO_TEST_AUTO_DELAY_MS;
  const executablePath = process.platform === 'darwin'
    ? join(process.cwd(), `out/molsino-darwin-${process.arch}/molsino.app/Contents/MacOS/molsino`)
    : join(process.cwd(), `out/molsino-win32-${process.arch}/molsino.exe`);
  const app = await electron.launch({ executablePath, args: [], env });
  const page = await app.firstWindow();
  await page.locator('#root').waitFor({ state: 'attached' });
  if (!options.startAtMenu) {
    const snapshot = await page.evaluate(() => window.molsino.getSnapshot());
    if (snapshot.screen === 'menu' && !snapshot.recovery) {
      await page.getByRole('button', { name: '블랙잭', exact: true }).click();
      await page.waitForFunction(async () => (await window.molsino.getSnapshot()).screen === 'blackjack');
    }
  }
  return { app, page, userDataDir };
}

// 저장 복원 시나리오용: 같은 userDataDir로 앱을 종료 후 재기동한다.
export async function relaunchApp(previous: LaunchedApp, options: Omit<LaunchOptions, 'userDataDir'> = {}): Promise<LaunchedApp> {
  await previous.app.close().catch(() => {});
  return launchApp({ userDataDir: previous.userDataDir, ...options });
}

export async function closeApp(launched: LaunchedApp, options: { cleanup?: boolean } = {}): Promise<void> {
  const forceClose = setTimeout(() => launched.app.process().kill('SIGKILL'), 2000);
  try { await launched.app.close().catch(() => {}); } finally { clearTimeout(forceClose); }
  if (options.cleanup !== false) await rm(launched.userDataDir, { recursive: true, force: true });
}
