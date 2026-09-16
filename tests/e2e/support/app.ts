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
}

async function createTempUserData(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'blackjack-e2e-'));
}

export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const userDataDir = options.userDataDir ?? (await createTempUserData());
  const inheritedEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const env: Record<string, string> = { ...inheritedEnv, BLACKJACK_TEST_USER_DATA: userDataDir };
  if (options.shoeFixture) env.BLACKJACK_TEST_SHOE_FIXTURE = options.shoeFixture;
  const app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  await page.locator('#root').waitFor({ state: 'attached' });
  return { app, page, userDataDir };
}

// 저장 복원 시나리오용: 같은 userDataDir로 앱을 종료 후 재기동한다.
export async function relaunchApp(previous: LaunchedApp, options: Omit<LaunchOptions, 'userDataDir'> = {}): Promise<LaunchedApp> {
  await previous.app.close().catch(() => {});
  return launchApp({ userDataDir: previous.userDataDir, ...options });
}

export async function closeApp(launched: LaunchedApp, options: { cleanup?: boolean } = {}): Promise<void> {
  await launched.app.close().catch(() => {});
  if (options.cleanup !== false) await rm(launched.userDataDir, { recursive: true, force: true });
}
