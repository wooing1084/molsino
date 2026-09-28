import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSession, transition } from '../../src/core/engine';
import { createShoeFactory } from '../../src/main/game/shoe-source';
import { newAppSession, parseAppSession } from '../../src/main/persistence/app-session-repository';
import { closeApp, launchApp, relaunchApp, type LaunchedApp } from './support/app';
import { fixturePath } from './support/fixtures';

type Locale = 'ko' | 'en';
let launched: LaunchedApp | undefined;
const directories: string[] = [];
test.afterEach(async () => {
  if (launched) await closeApp(launched);
  launched = undefined;
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function directory(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'molsino-startup-locale-'));
  directories.push(value);
  return value;
}

const preferences = (locale: Locale) => ({ schemaVersion: 1, locale });
async function savedPreferences(userDataDir: string) {
  return JSON.parse(await readFile(join(userDataDir, 'preferences.json'), 'utf8'));
}

async function expectNativeLocale(app: LaunchedApp, locale: Locale): Promise<void> {
  // Windows의 실제 트레이 표시·클릭 증거는 이 macOS 메뉴 callback 검사와 구분한다.
  if (process.platform !== 'darwin') return;
  expect(await app.app.evaluate(({ Menu }) => ({
    ko: Menu.getApplicationMenu()?.getMenuItemById('language-ko')?.checked,
    en: Menu.getApplicationMenu()?.getMenuItemById('language-en')?.checked,
  }))).toEqual({ ko: locale === 'ko', en: locale === 'en' });
}

async function expectMenuLocale(app: LaunchedApp, locale: Locale): Promise<void> {
  await expect(app.page.locator('html')).toHaveAttribute('lang', locale);
  await expect(app.page.getByRole('button', { name: locale === 'ko' ? '블랙잭' : 'Blackjack', exact: true })).toBeVisible();
  await expectNativeLocale(app, locale);
}

async function chooseLanguage(app: LaunchedApp, locale: Locale): Promise<void> {
  await app.app.evaluate(({ Menu }, id) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(`language-${id}`);
    if (!item?.click) throw new Error(`Missing native language menu item: ${id}`);
    item.click();
  }, locale);
}

for (const { languages, locale } of [
  { languages: ['ko-KR'], locale: 'ko' },
  { languages: ['en-US'], locale: 'en' },
  { languages: ['en-GB'], locale: 'en' },
] as const) {
  test(`N08-01 ${languages[0]} 첫 실행의 화면·lang·메뉴·v1 설정이 ${locale}로 일치한다`, async () => {
    launched = await launchApp({ startAtMenu: true, preferredLanguages: [...languages] });
    await expectMenuLocale(launched, locale);
    expect(await savedPreferences(launched.userDataDir)).toEqual(preferences(locale));
    const snapshot = await launched.page.evaluate(() => window.molsino.getSnapshot());
    expect(snapshot).toMatchObject({ screen: 'menu', balanceCents: 10000 });
    expect(snapshot.recovery).toBeUndefined();
  });
}

for (const { languages, locale } of [
  { languages: ['fr-FR', 'ko-KR', 'en-US'], locale: 'ko' },
  { languages: ['fr-FR', 'en-GB', 'ko-KR'], locale: 'en' },
  { languages: ['fr-FR', 'ja-JP'], locale: 'en' },
  { languages: [], locale: 'en' },
] as const) {
  test(`N08-02 ${JSON.stringify(languages)}에서 첫 지원 언어 또는 영어 fallback을 저장한다`, async () => {
    launched = await launchApp({ startAtMenu: true, preferredLanguages: [...languages] });
    await expectMenuLocale(launched, locale);
    expect(await savedPreferences(launched.userDataDir)).toEqual(preferences(locale));
  });
}

test('N08-02 시스템 선호 언어 조회 예외는 영어로 첫 실행하고 저장한다', async () => {
  launched = await launchApp({ startAtMenu: true, preferredLanguages: ['ko-KR'], systemLanguagesError: true });
  await expectMenuLocale(launched, 'en');
  expect(await savedPreferences(launched.userDataDir)).toEqual(preferences('en'));
});

for (const locale of ['ko', 'en'] as const) {
  const initialLanguages = locale === 'ko' ? ['ko-KR'] : ['en-US'];
  const changedLanguages = locale === 'ko' ? ['en-US'] : ['ko-KR'];
  test(`N08-03 첫 실행에 저장한 ${locale}는 시스템 선호가 바뀐 재실행에서도 유지된다`, async () => {
    launched = await launchApp({ startAtMenu: true, preferredLanguages: initialLanguages });
    await expectMenuLocale(launched, locale);
    const before = await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8');
    launched = await relaunchApp(launched, { startAtMenu: true, preferredLanguages: changedLanguages });
    await expectMenuLocale(launched, locale);
    expect(await savedPreferences(launched.userDataDir)).toEqual(preferences(locale));
    expect(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8')).toBe(before);
  });

  test(`N08-03 기존 N06 v1 ${locale} 설정은 반대 시스템 선호보다 우선한다`, async () => {
    const dir = await directory();
    await writeFile(join(dir, 'preferences.json'), JSON.stringify(preferences(locale)));
    // 게임 파일의 존재를 첫 실행 판정에 사용하지 않는다.
    await writeFile(join(dir, 'app-session.json'), '{broken');
    launched = await launchApp({ userDataDir: dir, startAtMenu: true, preferredLanguages: changedLanguages });
    await expect(launched.page.locator('html')).toHaveAttribute('lang', locale);
    await expect(launched.page.getByRole('button', { name: locale === 'ko' ? '새 게임 시작' : 'Start New Game', exact: true })).toBeVisible();
    await expectNativeLocale(launched, locale);
    expect(await savedPreferences(dir)).toEqual(preferences(locale));
  });
}

test('N08-03 실제 이전 패키지에서 선택한 언어가 같은 userData의 새 패키지에서도 유지된다', async () => {
  test.skip(process.platform !== 'darwin', 'macOS native application menu callback automation');
  const previousExecutablePath = process.env.MOLSINO_E2E_PREVIOUS_EXECUTABLE_PATH;
  test.skip(!previousExecutablePath, 'Set MOLSINO_E2E_PREVIOUS_EXECUTABLE_PATH to a separately preserved previous package');
  launched = await launchApp({ startAtMenu: true, executablePath: previousExecutablePath, preferredLanguages: ['ko-KR'] });
  await chooseLanguage(launched, 'en');
  await expectMenuLocale(launched, 'en');
  const before = await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8');
  launched = await relaunchApp(launched, { startAtMenu: true, preferredLanguages: ['ko-KR'] });
  await expectMenuLocale(launched, 'en');
  expect(await savedPreferences(launched.userDataDir)).toEqual(preferences('en'));
  expect(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8')).toBe(before);
});

const primaryStates = [
  { name: '없음', contents: undefined },
  { name: '손상', contents: '{broken' },
  { name: '미래 형식', contents: JSON.stringify({ schemaVersion: 99, locale: 'ko' }) },
] as const;

for (const primary of primaryStates) {
  test(`N08-04 primary ${primary.name}에서 영어 backup이 한국어 시스템보다 우선하고 복원된다`, async () => {
    const dir = await directory();
    if (primary.contents !== undefined) await writeFile(join(dir, 'preferences.json'), primary.contents);
    await writeFile(join(dir, 'preferences.backup.json'), JSON.stringify(preferences('en')));
    launched = await launchApp({ userDataDir: dir, startAtMenu: true, preferredLanguages: ['ko-KR'] });
    await expectMenuLocale(launched, 'en');
    expect(await savedPreferences(dir)).toEqual(preferences('en'));
  });
}

for (const primary of primaryStates.slice(1)) {
  test(`N08-04 유효 backup 없는 ${primary.name} 설정은 한국어 fallback으로 게임 복구 안내를 계속 표시한다`, async () => {
    const dir = await directory();
    await writeFile(join(dir, 'preferences.json'), primary.contents!);
    await writeFile(join(dir, 'preferences.backup.json'), '{broken');
    await writeFile(join(dir, 'app-session.json'), '{broken');
    launched = await launchApp({ userDataDir: dir, startAtMenu: true, preferredLanguages: ['en-US'] });
    await expect(launched.page.locator('html')).toHaveAttribute('lang', 'ko');
    await expect(launched.page.getByRole('button', { name: '새 게임 시작', exact: true })).toBeVisible();
    await expectNativeLocale(launched, 'ko');
    await launched.page.getByRole('button', { name: '새 게임 시작', exact: true }).click();
    await expectMenuLocale(launched, 'ko');
  });
}

test('N08-04 설정 파일 읽기 실패는 첫 실행으로 취급하지 않고 한국어로 게임 로드를 계속한다', async () => {
  const dir = await directory();
  await mkdir(join(dir, 'preferences.json'));
  await writeFile(join(dir, 'preferences.backup.json'), JSON.stringify(preferences('en')));
  launched = await launchApp({ userDataDir: dir, startAtMenu: true, preferredLanguages: ['en-US'] });
  await expectMenuLocale(launched, 'ko');
  expect(await launched.page.evaluate(() => window.molsino.getSnapshot())).toMatchObject({ screen: 'menu', balanceCents: 10000 });
});

test('N08-05 첫 실행 저장 실패에도 영어로 실행하며 파일이 없으면 다음 실행에서 다시 결정한다', async () => {
  launched = await launchApp({ startAtMenu: true, preferredLanguages: ['en-US'], preferencesWriteFailure: true });
  await expectMenuLocale(launched, 'en');
  await expect(readFile(join(launched.userDataDir, 'preferences.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  const gameBefore = await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8');

  launched = await relaunchApp(launched, { startAtMenu: true, preferredLanguages: ['ko-KR'] });
  await expectMenuLocale(launched, 'ko');
  expect(await savedPreferences(launched.userDataDir)).toEqual(preferences('ko'));
  expect(await readFile(join(launched.userDataDir, 'app-session.json'), 'utf8')).toBe(gameBefore);
  launched = await relaunchApp(launched, { startAtMenu: true, preferredLanguages: ['en-US'] });
  await expectMenuLocale(launched, 'ko');
});

test('N08-05 영어 backup 복원 저장 실패에도 이번 실행은 영어이고 정상 경로 복구 뒤 실제로 저장된다', async () => {
  const dir = await directory();
  const damagedPrimary = '{broken';
  const englishBackup = JSON.stringify(preferences('en'));
  await writeFile(join(dir, 'preferences.json'), damagedPrimary);
  await writeFile(join(dir, 'preferences.backup.json'), englishBackup);
  launched = await launchApp({ userDataDir: dir, startAtMenu: true, preferredLanguages: ['ko-KR'], preferencesWriteFailure: true });
  await expectMenuLocale(launched, 'en');
  expect(await readFile(join(dir, 'preferences.json'), 'utf8')).toBe(damagedPrimary);
  expect(await readFile(join(dir, 'preferences.backup.json'), 'utf8')).toBe(englishBackup);

  launched = await relaunchApp(launched, { startAtMenu: true, preferredLanguages: ['ko-KR'] });
  await expectMenuLocale(launched, 'en');
  expect(await savedPreferences(dir)).toEqual(preferences('en'));
  launched = await relaunchApp(launched, { startAtMenu: true, preferredLanguages: ['ko-KR'] });
  await expectMenuLocale(launched, 'en');
});

for (const { languages, selected } of [
  { languages: ['en-US'], selected: 'ko' },
  { languages: ['ko-KR'], selected: 'en' },
] as const) {
  test(`N08-06 ${languages[0]}에서 메뉴로 선택한 ${selected}는 재실행·reload·전체 새 시작에서 유지된다`, async () => {
    test.skip(process.platform !== 'darwin', 'macOS native application menu callback automation');
    launched = await launchApp({ startAtMenu: true, preferredLanguages: [...languages] });
    const before = await launched.page.evaluate(() => window.molsino.getSnapshot());
    await chooseLanguage(launched, selected);
    await expectMenuLocale(launched, selected);
    expect(await launched.page.evaluate(() => window.molsino.getSnapshot())).toEqual(before);
    await launched.page.reload();
    await expectMenuLocale(launched, selected);
    expect(await launched.page.evaluate(() => window.molsino.getSnapshot())).toEqual(before);
    launched = await relaunchApp(launched, { startAtMenu: true, preferredLanguages: [...languages] });
    await expectMenuLocale(launched, selected);
    await launched.page.getByRole('button', { name: selected === 'ko' ? '새 시작' : 'Start Over', exact: true }).click();
    await launched.page.getByRole('button', { name: selected === 'ko' ? '초기화 확정' : 'Confirm Reset', exact: true }).click();
    await expectMenuLocale(launched, selected);
    expect(await savedPreferences(launched.userDataDir)).toEqual(preferences(selected));
    // 진행 판의 카드·행동·잔액·타임라인 불변은 N06-03 회귀를 재사용한다.
  });
}

test('N08-07 실행 중 변경 저장 실패는 첫 실행 영어·기존 메뉴 선택·영어 경고를 유지한다', async () => {
  test.skip(process.platform !== 'darwin', 'macOS native application menu callback automation');
  launched = await launchApp({ startAtMenu: true, preferredLanguages: ['en-US'] });
  await expectMenuLocale(launched, 'en');
  const before = await launched.page.evaluate(() => window.molsino.getSnapshot());
  await mkdir(join(launched.userDataDir, 'preferences.backup.json'));
  await launched.app.evaluate(({ dialog }) => {
    (globalThis as { startupLocaleWarning?: string }).startupLocaleWarning = undefined;
    dialog.showMessageBox = ((options: Electron.MessageBoxOptions) => {
      (globalThis as { startupLocaleWarning?: string }).startupLocaleWarning = options.message;
      return Promise.resolve({ response: 0, checkboxChecked: false });
    }) as typeof dialog.showMessageBox;
  });
  await chooseLanguage(launched, 'ko');
  await expect.poll(() => launched!.app.evaluate(() => (globalThis as { startupLocaleWarning?: string }).startupLocaleWarning))
    .toBe('Could not save the language setting.');
  await expectMenuLocale(launched, 'en');
  expect(await savedPreferences(launched.userDataDir)).toEqual(preferences('en'));
  expect(await launched.page.evaluate(() => window.molsino.getSnapshot())).toEqual(before);
  // 한국어에서 영어로 변경 실패하는 반대 방향은 기존 N06-07이 담당한다.
});

interface DOMSample {
  at: number;
  lang: string;
  body: string;
  buttons: string[];
  labels: string[];
  titles: string[];
}
interface DOMProbe { samples: DOMSample[]; }

// self-contained callback: reload/new panel에는 init script로, 첫 창에는 지연 중 baseline으로 설치한다.
function observeStartupDOM(): void {
  const probeWindow = window as typeof window & { __startupLocaleProbe?: DOMProbe };
  if (probeWindow.__startupLocaleProbe) return;
  const probe: DOMProbe = { samples: [] };
  probeWindow.__startupLocaleProbe = probe;
  let previous = '';
  const record = () => {
    const root = document.getElementById('root');
    const sample = {
      lang: document.documentElement?.lang ?? '',
      body: root?.innerText ?? '',
      buttons: root ? Array.from(root.querySelectorAll('button, [role="button"]'), element => element.textContent?.trim() ?? '') : [],
      labels: root ? Array.from(root.querySelectorAll('[aria-label]'), element => element.getAttribute('aria-label') ?? '') : [],
      titles: root ? Array.from(root.querySelectorAll('[title]'), element => element.getAttribute('title') ?? '') : [],
    };
    const value = JSON.stringify(sample);
    if (value !== previous) {
      probe.samples.push({ at: performance.now(), ...sample });
      previous = value;
    }
  };
  new MutationObserver(record).observe(document, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['lang', 'aria-label', 'title'],
  });
  document.addEventListener('DOMContentLoaded', record, { once: true });
  record();
}

async function expectEnglishFirstDisplay(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const samples = await page.evaluate(() => (window as typeof window & { __startupLocaleProbe?: DOMProbe }).__startupLocaleProbe?.samples ?? []);
  await testInfo.attach(name, { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
  expect(samples.length, 'The initial DOM probe must record the document').toBeGreaterThan(0);
  let translatedSamples = 0;
  for (const sample of samples) {
    const text = [sample.body, ...sample.buttons, ...sample.labels, ...sample.titles].join('\n');
    expect(text, `Unexpected Korean at ${sample.at}ms`).not.toMatch(/[가-힣]/);
    if (sample.buttons.length || sample.labels.length || sample.titles.length) {
      translatedSamples += 1;
      expect(sample.lang, `lang must match the first translated controls at ${sample.at}ms`).toBe('en');
    }
  }
  expect(translatedSamples, 'The probe must include translated controls, not only a neutral waiting state').toBeGreaterThan(0);
  expect(samples.some(sample => !sample.body.trim() && !sample.buttons.length && !sample.labels.length && !sample.titles.length),
    'The probe must observe neutral waiting before translated controls, not attach after startup').toBe(true);
}

async function seedActiveBlackjack(dir: string): Promise<void> {
  const createShoe = createShoeFactory(fixturePath('standard-win'));
  const initial = createSession(createShoe());
  const dealt = transition(initial, { type: 'deal' }, { createShoe, nextId: () => randomUUID() }).nextState;
  const { balanceCents, ...blackjack } = dealt;
  const initialApp = newAppSession();
  const session = parseAppSession({
    ...initialApp,
    wallet: { ...initialApp.wallet, balanceCents },
    games: { ...initialApp.games, blackjack },
    screen: 'blackjack', activeRoundGameId: 'blackjack',
  });
  await writeFile(join(dir, 'app-session.json'), JSON.stringify(session));
}

for (const savedLocale of [false, true]) {
  for (const screen of ['game', 'recovery'] as const) {
    test(`N08-08 ${savedLocale ? '저장된 영어' : '첫 실행 영어'} ${screen} snapshot이 먼저 도착해도 최초 DOM·reload는 영어로 표시한다`, async ({}, testInfo) => {
      const dir = await directory();
      if (savedLocale) await writeFile(join(dir, 'preferences.json'), JSON.stringify(preferences('en')));
      if (screen === 'recovery') await writeFile(join(dir, 'app-session.json'), '{broken');
      else await seedActiveBlackjack(dir);
      launched = await launchApp({ userDataDir: dir, startAtMenu: true, preferredLanguages: ['en-US'], overlayStateDelayMs: 1500 });
      await launched.page.evaluate(observeStartupDOM);
      await launched.app.context().addInitScript(observeStartupDOM);
      const early = await launched.page.evaluate(() => window.molsino.getSnapshot());
      if (screen === 'recovery') expect(early.recovery).toBeDefined();
      else expect(early).toMatchObject({ screen: 'blackjack', activeRoundGameId: 'blackjack' });

      const initialButton = screen === 'recovery' ? 'Start New Game' : 'Stand';
      await expect(launched.page.getByRole('button', { name: initialButton, exact: true })).toBeVisible();
      await expect(launched.page.locator('html')).toHaveAttribute('lang', 'en');
      await expectEnglishFirstDisplay(launched.page, testInfo, 'startup-dom.json');
      await launched.page.reload();
      await expect(launched.page.getByRole('button', { name: initialButton, exact: true })).toBeVisible();
      await expectEnglishFirstDisplay(launched.page, testInfo, 'reload-dom.json');

      await launched.page.getByRole('button', { name: 'Toggle black/white', exact: true }).hover();
      await expect.poll(() => launched!.app.windows().length).toBe(2);
      const panel = launched.app.windows()[1]!;
      await expect(panel.getByRole('slider', { name: 'Opacity', exact: true })).toBeVisible();
      await expectEnglishFirstDisplay(panel, testInfo, 'opacity-dom.json');
      await panel.reload();
      await expect(panel.getByRole('slider', { name: 'Opacity', exact: true })).toBeVisible();
      await expectEnglishFirstDisplay(panel, testInfo, 'opacity-reload-dom.json');
    });
  }
}

test('N08-08 최초 창 상태 조회 실패는 영구 빈 화면으로 남지 않고 정상 push 뒤 영어로 회복한다', async () => {
  launched = await launchApp({
    startAtMenu: true, preferredLanguages: ['en-US'], overlayStateError: true, overlayStateDelayMs: 1500,
  });
  await expect(launched.page.getByRole('status')).toContainText('Could not load window settings.');
  await expect(launched.page.getByRole('status')).toContainText('창 설정을 불러올 수 없습니다.');
  await expectMenuLocale(launched, 'en');
  await launched.page.reload();
  await expect(launched.page.getByRole('status')).toContainText('Could not load window settings.');
  await expect(launched.page.getByRole('status')).toContainText('창 설정을 불러올 수 없습니다.');
  await expectMenuLocale(launched, 'en');
  await launched.page.getByRole('button', { name: 'Toggle black/white', exact: true }).hover();
  await expect.poll(() => launched!.app.windows().length).toBe(2);
  const panel = launched.app.windows()[1]!;
  await expect(panel.getByRole('status')).toContainText('Could not load window settings.');
  await expect(panel.getByRole('status')).toContainText('창 설정을 불러올 수 없습니다.');
  await expect(panel.getByRole('slider', { name: 'Opacity', exact: true })).toBeVisible();
  await expect(panel.locator('html')).toHaveAttribute('lang', 'en');
});
