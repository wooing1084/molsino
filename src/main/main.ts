import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, protocol, screen, Tray } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSession } from '../core/engine';
import { channels, recoveryChoiceSchema, resizeCommandSchema, userCommandSchema, windowCommandSchema, type GameViewState } from '../shared/contracts';
import { GameStore } from './game/game-store';
import { createShoeFactory } from './game/shoe-source';
import { isTrustedDocument } from './ipc/trust';
import { SESSION_SCHEMA_VERSION, SessionRepository, type SavedSession } from './persistence/session-repository';
import { configurePlatformWindow } from './platform/adapter';
import { ResizeController } from './windows/resize-controller';

// E2E 테스트 전용: 격리된 userData로 실제 개발자 세션 파일을 건드리지 않게 한다. 미설정 시 동작 동일.
if (process.env.MOLSINO_TEST_USER_DATA) app.setPath('userData', process.env.MOLSINO_TEST_USER_DATA);

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let overlay: BrowserWindow | undefined;
let tray: Tray | undefined;
let resizeController: ResizeController | undefined;
let quitting = false;
let clickThrough = false;
let gameStore: GameStore | undefined;
const devURL = MAIN_WINDOW_VITE_DEV_SERVER_URL;
const documentURL = devURL || 'app://molsino/index.html';

function reveal(): void {
  if (!overlay || overlay.isDestroyed()) return;
  resizeController?.invalidate();
  clickThrough = false;
  overlay.setIgnoreMouseEvents(false);
  overlay.showInactive();
}
function hideOverlay(): void {
  resizeController?.invalidate();
  overlay?.hide();
}
function enableClickThrough(): void {
  resizeController?.invalidate();
  clickThrough = true;
  overlay?.setIgnoreMouseEvents(true);
}
function setSize(width: number, height: number): void {
  if (!overlay) return;
  resizeController?.invalidate();
  const bounds = overlay.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  overlay.setBounds({
    width, height,
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
  });
}
function setupTray(): void {
  // A generated monochrome bitmap avoids font/image dependencies for the starter.
  const bytes = Buffer.alloc(16 * 16 * 4);
  for (let y = 2; y < 14; y++) for (let x = 3; x < 13; x++) {
    if (x === 3 || x === 12 || y === 2 || y === 13 || (x === 8 && y > 5 && y < 10)) {
      const i = (y * 16 + x) * 4;
      bytes[i] = bytes[i + 1] = bytes[i + 2] = process.platform === 'darwin' ? 0 : 255;
      bytes[i + 3] = 255;
    }
  }
  const icon = nativeImage.createFromBitmap(bytes, { width: 16, height: 16 });
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('molsino');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '보이기 / 클릭 통과 해제', click: reveal },
    { label: '숨기기', click: hideOverlay },
    { label: '클릭 통과', click: enableClickThrough },
    { type: 'separator' },
    { label: '작게', click: () => setSize(240, 180) },
    { label: '기본 크기', click: () => setSize(280, 180) },
    { label: '크게', click: () => setSize(360, 240) },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]));
  tray.on('click', reveal);
}

async function start(): Promise<void> {
  const createGameShoe = createShoeFactory(process.env.BLACKJACK_TEST_SHOE_FIXTURE);
  const repository = new SessionRepository(app.getPath('userData'));
  let loaded = await repository.load();
  let unsubscribeGameState: (() => void) | undefined;
  const initializeGame = (snapshot: SavedSession): void => {
    unsubscribeGameState?.();
    gameStore = new GameStore(
      snapshot.state,
      { createShoe: createGameShoe, nextId: () => randomUUID() },
      process.platform, repository, snapshot,
    );
    unsubscribeGameState = gameStore.subscribe(state => {
      if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channels.state, state);
    });
    gameStore.resumeDealer();
  };
  if (loaded.kind === 'missing') {
    const state = createSession(createGameShoe());
    const snapshot: SavedSession = { schemaVersion: SESSION_SCHEMA_VERSION, revision: 0, state, lastAppliedCommand: null };
    await repository.save(snapshot);
    loaded = { kind: 'ready', snapshot };
  }
  if (loaded.kind === 'ready') initializeGame(loaded.snapshot);
  const recoveryState = (): GameViewState => ({
    revision: 0, platform: process.platform, phase: 'recovery', balanceCents: 0,
    pendingBetCents: 0, betStepCents: 100, playerHands: [], activeHandIndex: null,
    dealerHand: { cards: [], hiddenCardCount: 0 }, legalActions: [],
    recovery: { issue: loaded.kind === 'recovery' ? loaded.issue : 'corrupt',
      backupAvailable: loaded.kind === 'recovery' && Boolean(loaded.backup) },
  });
  const rendererRoot = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
  // Only the two generated asset locations are served. No arbitrary file paths.
  protocol.handle('app', request => {
    const url = new URL(request.url);
    if (url.host !== 'molsino' || request.method !== 'GET') return new Response('', { status: 403 });
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!(relative === 'index.html' || /^assets\/[a-zA-Z0-9_.-]+$/.test(relative))) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(path.join(rendererRoot, relative)).href);
  });
  const area = screen.getPrimaryDisplay().workArea;
  overlay = new BrowserWindow({
    width: 280, height: 180, x: area.x + area.width - 304, y: area.y + area.height - 204,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    alwaysOnTop: true, focusable: false, acceptFirstMouse: true, skipTaskbar: true,
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  resizeController = new ResizeController({
    now: () => performance.now(),
    getCursor: () => screen.getCursorScreenPoint(),
    getBounds: () => {
      if (!overlay || overlay.isDestroyed()) throw new Error('Overlay window is unavailable');
      return overlay.getBounds();
    },
    getWorkArea: bounds => screen.getDisplayMatching(bounds).workArea,
    setBounds: bounds => {
      if (!overlay || overlay.isDestroyed()) throw new Error('Overlay window is unavailable');
      overlay.setBounds(bounds);
    },
    createToken: randomUUID,
    setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimer: timer => clearTimeout(timer),
  });
  configurePlatformWindow(overlay);
  setupTray();
  const session = overlay.webContents.session;
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: {
    ...details.responseHeaders,
    'Content-Security-Policy': [devURL
      ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'"],
  } }));
  const requireTrusted = (event: Electron.IpcMainInvokeEvent): void => {
    if (!overlay || event.sender !== overlay.webContents || event.senderFrame !== overlay.webContents.mainFrame ||
      !isTrustedDocument(event.senderFrame.url, documentURL)) throw new Error('Untrusted IPC sender');
  };
  ipcMain.handle(channels.snapshot, event => { requireTrusted(event); return gameStore?.getSnapshot() ?? recoveryState(); });
  ipcMain.handle(channels.command, (event, value: unknown) => {
    requireTrusted(event);
    const command = userCommandSchema.parse(value);
    return gameStore?.dispatch(command) ?? {
      ok: false, error: 'RECOVERY_REQUIRED', message: '저장 복구 선택이 필요합니다.', state: recoveryState(),
    };
  });
  let recovering = false;
  ipcMain.handle(channels.recovery, async (event, value: unknown) => {
    requireTrusted(event);
    const choice = recoveryChoiceSchema.parse(value);
    if (loaded.kind !== 'recovery' || gameStore || recovering) throw new Error('Recovery is unavailable');
    if (choice === 'restoreBackup' && !loaded.backup) throw new Error('No valid backup exists');
    recovering = true;
    try {
      await repository.archivePrimary();
      const snapshot: SavedSession = choice === 'restoreBackup'
        ? (loaded.backup as SavedSession)
        : { schemaVersion: SESSION_SCHEMA_VERSION, revision: 0,
          state: createSession(createGameShoe()), lastAppliedCommand: null };
      await repository.save(snapshot);
      loaded = { kind: 'ready', snapshot };
      initializeGame(snapshot);
      const state = gameStore!.getSnapshot();
      overlay?.webContents.send(channels.state, state);
      return state;
    } finally { recovering = false; }
  });
  ipcMain.handle(channels.window, (event, value: unknown) => {
    requireTrusted(event);
    switch (windowCommandSchema.parse(value)) {
      case 'hide': hideOverlay(); break;
      case 'quit': app.quit(); break;
      case 'passthrough': enableClickThrough(); break;
      case 'small': setSize(240, 180); break;
      case 'default': setSize(280, 180); break;
      case 'large': setSize(360, 240); break;
    }
  });
  ipcMain.handle(channels.resize, (event, value: unknown) => {
    requireTrusted(event);
    if (!resizeController || !overlay) throw new Error('Resize controller is unavailable');
    const command = resizeCommandSchema.parse(value);
    switch (command.phase) {
      case 'start':
        if (!overlay.isVisible() || clickThrough) throw new Error('Overlay is not interactive');
        return resizeController.start(command.edge);
      case 'update': return resizeController.update(command.token);
      case 'end': return resizeController.end(command.token);
      case 'cancel': return resizeController.cancel(command.token);
    }
  });
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.webContents.on('will-navigate', (event, url) => { if (!isTrustedDocument(url, documentURL)) event.preventDefault(); });
  overlay.on('hide', () => resizeController?.invalidate());
  overlay.on('close', event => { resizeController?.invalidate(); if (!quitting) { event.preventDefault(); hideOverlay(); } });
  overlay.on('closed', () => { resizeController?.invalidate(); unsubscribeGameState?.(); });
  overlay.webContents.on('did-start-navigation', () => resizeController?.invalidate());
  overlay.webContents.on('render-process-gone', () => { resizeController?.invalidate(); hideOverlay(); console.error('Renderer exited; restart the app from the tray.'); });
  overlay.once('ready-to-show', reveal);
  await overlay.loadURL(documentURL);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', reveal);
  app.on('activate', reveal);
  app.on('before-quit', event => {
    if (gameStore?.isBusy()) {
      event.preventDefault();
      void gameStore.whenIdle().then(() => {
        if (gameStore?.hasPendingSave()) { reveal(); return; }
        app.quit();
      });
      return;
    }
    quitting = true; resizeController?.invalidate(); tray?.destroy();
  });
  app.on('window-all-closed', () => { /* tray owns application lifetime */ });
  app.whenReady().then(start).catch(error => { console.error(error); app.quit(); });
}
