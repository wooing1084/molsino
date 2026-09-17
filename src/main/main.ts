import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, net, protocol, screen, Tray } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSession } from '../core/engine';
import { amountEditFocusSchema, channels, opacityPercentSchema, opacityPopoverCommandSchema, recoveryChoiceSchema, resizeCommandSchema, userCommandSchema, windowCommandSchema, type GameViewState, type OpacityPopoverCommand, type OverlayViewState, type WindowBounds } from '../shared/contracts';
import { GameStore } from './game/game-store';
import { createShoeFactory } from './game/shoe-source';
import { isTrustedDocument, isTrustedIpcSender } from './ipc/trust';
import { SESSION_SCHEMA_VERSION, SessionRepository, type SavedSession } from './persistence/session-repository';
import { configurePlatformWindow } from './platform/adapter';
import { installHideShortcut } from './windows/hide-shortcut';
import { ResizeController } from './windows/resize-controller';

// E2E 테스트 전용: 격리된 userData로 실제 개발자 세션 파일을 건드리지 않게 한다. 미설정 시 동작 동일.
if (process.env.MOLSINO_TEST_USER_DATA) app.setPath('userData', process.env.MOLSINO_TEST_USER_DATA);

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let overlay: BrowserWindow | undefined;
let opacityPanel: BrowserWindow | undefined;
let opacityPanelLoading: Promise<BrowserWindow> | undefined;
let opacityHideTimer: ReturnType<typeof setTimeout> | undefined;
let tray: Tray | undefined;
let resizeController: ResizeController | undefined;
let quitting = false;
let clickThrough = false;
let amountEditing = false;
let gameStore: GameStore | undefined;
let overlayState: OverlayViewState = { revision: 0, visibility: 'hidden', opacityPercent: 65, opacityPopoverVisible: false };
let shownVisibility: 'expanded' | 'collapsed' = 'expanded';
let expandedBounds: WindowBounds | undefined;
type OpacityAnchor = Extract<OpacityPopoverCommand, { phase: 'show' }>['anchor'];
let opacityAnchor: OpacityAnchor | undefined;
const devURL = MAIN_WINDOW_VITE_DEV_SERVER_URL;
const documentURL = devURL || 'app://molsino/index.html';
const opacityDocumentURL = new URL('?panel=opacity', documentURL).toString();
const requestedSnapshotDelay = process.env.MOLSINO_TEST_USER_DATA
  ? Number(process.env.MOLSINO_TEST_SNAPSHOT_DELAY_MS ?? 0) : 0;
const snapshotDelayMs = Number.isSafeInteger(requestedSnapshotDelay)
  && requestedSnapshotDelay >= 0 && requestedSnapshotDelay <= 2_000 ? requestedSnapshotDelay : 0;

function sendGameState(state: GameViewState): void {
  if (amountEditing && state.phase !== 'betting') endAmountEdit();
  if (!overlay || overlay.isDestroyed()) return;
  const contents = overlay.webContents;
  const frame = contents.isDestroyed() ? null : contents.mainFrame;
  if (frame && isTrustedDocument(frame.url, documentURL)) {
    contents.send(channels.state, state);
  }
}

function sendOverlayState(): void {
  for (const [window, expectedURL] of [[overlay, documentURL], [opacityPanel, opacityDocumentURL]] as const) {
    if (!window || window.isDestroyed()) continue;
    const contents = window.webContents;
    const frame = contents.isDestroyed() ? null : contents.mainFrame;
    if (frame && isTrustedDocument(frame.url, expectedURL)) {
      contents.send(channels.overlayStateChanged, { ...overlayState });
    }
  }
}

function updateOverlayState(change: Partial<Pick<OverlayViewState, 'visibility' | 'opacityPercent' | 'opacityPopoverVisible'>>): void {
  overlayState = { ...overlayState, ...change, revision: overlayState.revision + 1 };
  sendOverlayState();
}

function clampBounds(bounds: WindowBounds): WindowBounds {
  const area = screen.getDisplayMatching(bounds).workArea;
  return {
    ...bounds,
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height)),
  };
}

function clearOpacityHideTimer(): void {
  if (opacityHideTimer) clearTimeout(opacityHideTimer);
  opacityHideTimer = undefined;
}

function endAmountEdit(): void {
  if (!amountEditing) return;
  amountEditing = false;
  if (!overlay || overlay.isDestroyed()) return;
  overlay.blur();
  overlay.setFocusable(false);
}

function beginAmountEdit(): void {
  const snapshot = gameStore?.getSnapshot();
  if (!overlay || overlay.isDestroyed() || !overlay.isVisible() || clickThrough
    || overlayState.visibility !== 'expanded' || snapshot?.phase !== 'betting'
    || snapshot.saveError || !snapshot.legalActions.includes('setBet')) {
    throw new Error('Bet editing is unavailable');
  }
  if (amountEditing) return;
  amountEditing = true;
  overlay.setFocusable(true);
  overlay.focus();
}

function hideOpacityPanel(): void {
  clearOpacityHideTimer();
  opacityAnchor = undefined;
  if (opacityPanel && !opacityPanel.isDestroyed()) opacityPanel.hide();
  if (overlayState.opacityPopoverVisible) updateOverlayState({ opacityPopoverVisible: false });
}

function scheduleOpacityPanelHide(): void {
  clearOpacityHideTimer();
  opacityHideTimer = setTimeout(hideOpacityPanel, 250);
}

function placeOpacityPanel(anchor: OpacityAnchor): boolean {
  if (!overlay || !opacityPanel || opacityPanel.isDestroyed()) return false;
  const parent = overlay.getBounds();
  if (anchor.x + anchor.width > parent.width + 1 || anchor.y + anchor.height > parent.height + 1) return false;
  const button = { x: parent.x + anchor.x, y: parent.y + anchor.y, width: anchor.width, height: anchor.height };
  const area = screen.getDisplayMatching(button).workArea;
  const width = Math.min(176, area.width);
  const height = Math.min(46, area.height);
  const right = button.x + button.width + 2;
  const left = button.x - width - 2;
  const x = right + width <= area.x + area.width ? right : left >= area.x ? left
    : Math.max(area.x, Math.min(right, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(button.y, area.y + area.height - height));
  opacityPanel.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
  return true;
}

async function ensureOpacityPanel(): Promise<BrowserWindow> {
  if (opacityPanelLoading) return opacityPanelLoading;
  if (opacityPanel && !opacityPanel.isDestroyed()) return opacityPanel;
  opacityPanelLoading = (async () => {
    const panel = new BrowserWindow({
      width: 176, height: 46, show: false, parent: overlay,
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      focusable: false, skipTaskbar: true, resizable: false, minimizable: false, maximizable: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
    });
    opacityPanel = panel;
    panel.setAlwaysOnTop(true, process.platform === 'darwin' ? 'floating' : 'normal');
    panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    panel.webContents.on('will-navigate', (event, url) => { if (!isTrustedDocument(url, opacityDocumentURL)) event.preventDefault(); });
    panel.on('closed', () => { if (opacityPanel === panel) opacityPanel = undefined; });
    try { await panel.loadURL(opacityDocumentURL); }
    catch (error) { panel.destroy(); throw error; }
    return panel;
  })();
  try { return await opacityPanelLoading; }
  finally { opacityPanelLoading = undefined; }
}

async function showOpacityPanel(anchor: OpacityAnchor): Promise<void> {
  if (!overlay || !overlay.isVisible() || overlayState.visibility !== 'expanded' || clickThrough) return;
  clearOpacityHideTimer();
  opacityAnchor = anchor;
  const panel = await ensureOpacityPanel();
  if (!opacityAnchor || overlayState.visibility !== 'expanded' || !overlay.isVisible() || clickThrough) return;
  if (placeOpacityPanel(opacityAnchor)) {
    panel.showInactive();
    if (!overlayState.opacityPopoverVisible) updateOverlayState({ opacityPopoverVisible: true });
  }
}

function reveal(): void {
  if (!overlay || overlay.isDestroyed()) return;
  resizeController?.invalidate();
  clickThrough = false;
  overlay.setIgnoreMouseEvents(false);
  if (overlayState.visibility === 'hidden') updateOverlayState({ visibility: shownVisibility });
  overlay.showInactive();
}
function hideOverlay(): void {
  resizeController?.invalidate();
  endAmountEdit();
  hideOpacityPanel();
  if (overlayState.visibility !== 'hidden') {
    shownVisibility = overlayState.visibility;
    updateOverlayState({ visibility: 'hidden' });
  }
  overlay?.hide();
}
function collapseOverlay(): void {
  if (!overlay || overlayState.visibility !== 'expanded') return;
  resizeController?.invalidate();
  endAmountEdit();
  hideOpacityPanel();
  expandedBounds = overlay.getBounds();
  overlay.setBounds(clampBounds({ ...expandedBounds, width: 140, height: 30 }));
  shownVisibility = 'collapsed';
  updateOverlayState({ visibility: 'collapsed' });
}
function expandOverlay(): void {
  if (!overlay || overlayState.visibility !== 'collapsed') return;
  resizeController?.invalidate();
  if (expandedBounds) overlay.setBounds(clampBounds(expandedBounds));
  shownVisibility = 'expanded';
  updateOverlayState({ visibility: 'expanded' });
}
function enableClickThrough(): void {
  resizeController?.invalidate();
  endAmountEdit();
  hideOpacityPanel();
  clickThrough = true;
  overlay?.setIgnoreMouseEvents(true);
}
function setSize(width: number, height: number): void {
  if (!overlay) return;
  resizeController?.invalidate();
  hideOpacityPanel();
  const bounds = overlayState.visibility === 'expanded' ? overlay.getBounds() : expandedBounds ?? overlay.getBounds();
  expandedBounds = clampBounds({ ...bounds, width, height });
  if (overlayState.visibility === 'expanded' || (overlayState.visibility === 'hidden' && shownVisibility === 'expanded')) {
    overlay.setBounds(expandedBounds);
  }
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
    unsubscribeGameState = gameStore.subscribe(sendGameState);
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
  const applicationIcon = nativeImage.createFromPath(app.isPackaged
    ? path.join(process.resourcesPath, 'molsino.png')
    : path.join(app.getAppPath(), 'resources/icons/molsino.png'));
  overlay = new BrowserWindow({
    icon: applicationIcon,
    width: 280, height: 180, x: area.x + area.width - 304, y: area.y + area.height - 204,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    alwaysOnTop: true, focusable: false, acceptFirstMouse: true, skipTaskbar: true,
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  expandedBounds = overlay.getBounds();
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
  if (process.platform === 'darwin') app.dock?.setIcon(applicationIcon);
  setupTray();
  const disposeHideShortcut = installHideShortcut(globalShortcut, hideOverlay, message => console.warn(message));
  app.once('will-quit', disposeHideShortcut);
  const session = overlay.webContents.session;
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: {
    ...details.responseHeaders,
    'Content-Security-Policy': [devURL
      ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'"],
  } }));
  const requireTrusted = (event: Electron.IpcMainInvokeEvent): void => {
    if (!isTrustedIpcSender(event.sender, event.senderFrame, overlay?.webContents, documentURL)) {
      throw new Error('Untrusted IPC sender');
    }
  };
  const requireOpacityTrusted = (event: Electron.IpcMainInvokeEvent): void => {
    if (!isTrustedIpcSender(event.sender, event.senderFrame, overlay?.webContents, documentURL)
      && !isTrustedIpcSender(event.sender, event.senderFrame, opacityPanel?.webContents, opacityDocumentURL)) {
      throw new Error('Untrusted opacity IPC sender');
    }
  };
  ipcMain.handle(channels.snapshot, async event => {
    requireTrusted(event);
    const snapshot = gameStore?.getSnapshot() ?? recoveryState();
    if (snapshotDelayMs > 0) await new Promise(resolve => setTimeout(resolve, snapshotDelayMs));
    return snapshot;
  });
  ipcMain.handle(channels.command, (event, value: unknown) => {
    requireTrusted(event);
    const command = userCommandSchema.parse(value);
    if (amountEditing && command.action.type === 'deal' && gameStore) {
      return { ok: false, error: 'INVALID_ACTION' as const,
        message: '베팅 금액 입력을 먼저 완료하세요.', state: gameStore.getSnapshot() };
    }
    if (amountEditing && command.action.type === 'resetSession') endAmountEdit();
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
      sendGameState(state);
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
      case 'collapse': collapseOverlay(); break;
      case 'expand': expandOverlay(); break;
    }
  });
  ipcMain.handle(channels.overlayState, event => {
    requireOpacityTrusted(event);
    return { ...overlayState };
  });
  ipcMain.handle(channels.opacity, (event, value: unknown) => {
    requireOpacityTrusted(event);
    const opacityPercent = opacityPercentSchema.parse(value);
    if (overlayState.opacityPercent !== opacityPercent) updateOverlayState({ opacityPercent });
    return { ...overlayState };
  });
  ipcMain.handle(channels.opacityPopover, async (event, value: unknown) => {
    requireOpacityTrusted(event);
    const command = opacityPopoverCommandSchema.parse(value);
    if (command.phase === 'show') {
      requireTrusted(event);
      await showOpacityPanel(command.anchor);
    } else if (command.phase === 'keep') clearOpacityHideTimer();
    else scheduleOpacityPanelHide();
  });
  ipcMain.handle(channels.amountEditFocus, (event, value: unknown) => {
    requireTrusted(event);
    const phase = amountEditFocusSchema.parse(value);
    if (phase === 'begin') beginAmountEdit();
    else endAmountEdit();
  });
  ipcMain.handle(channels.resize, (event, value: unknown) => {
    requireTrusted(event);
    if (!resizeController || !overlay) throw new Error('Resize controller is unavailable');
    const command = resizeCommandSchema.parse(value);
    switch (command.phase) {
      case 'start':
        if (!overlay.isVisible() || clickThrough || overlayState.visibility !== 'expanded') throw new Error('Overlay is not interactive');
        return resizeController.start(command.edge);
      case 'update': return resizeController.update(command.token);
      case 'end': return resizeController.end(command.token);
      case 'cancel': return resizeController.cancel(command.token);
    }
  });
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.webContents.on('will-navigate', (event, url) => { if (!isTrustedDocument(url, documentURL)) event.preventDefault(); });
  overlay.on('hide', () => { resizeController?.invalidate(); endAmountEdit(); hideOpacityPanel(); });
  overlay.on('blur', endAmountEdit);
  overlay.on('move', () => {
    if (opacityPanel?.isVisible() && opacityAnchor) placeOpacityPanel(opacityAnchor);
  });
  overlay.on('close', event => { resizeController?.invalidate(); if (!quitting) { event.preventDefault(); hideOverlay(); } });
  overlay.on('closed', () => { resizeController?.invalidate(); unsubscribeGameState?.(); });
  overlay.webContents.on('did-start-navigation', () => { resizeController?.invalidate(); endAmountEdit(); hideOpacityPanel(); });
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
    quitting = true; resizeController?.invalidate(); endAmountEdit(); hideOpacityPanel(); tray?.destroy();
  });
  app.on('window-all-closed', () => { /* tray owns application lifetime */ });
  app.whenReady().then(start).catch(error => { console.error(error); app.quit(); });
}
