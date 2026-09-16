import type { ResizeEdge, ResizeResult, WindowBounds } from '../../shared/contracts';

export interface ScreenPoint {
  x: number;
  y: number;
}

export type ResizeTimer = ReturnType<typeof setTimeout>;

export interface ResizeControllerEnvironment {
  now(): number;
  getCursor(): ScreenPoint;
  getBounds(): WindowBounds;
  getWorkArea(bounds: WindowBounds): WindowBounds;
  setBounds(bounds: WindowBounds): void;
  createToken(): string;
  setTimer(callback: () => void, delayMs: number): ResizeTimer;
  clearTimer(timer: ResizeTimer): void;
}

export type ResizeControllerErrorCode = 'ACTIVE_SESSION' | 'INVALID_TOKEN' | 'INVALID_GEOMETRY';

export class ResizeControllerError extends Error {
  constructor(readonly code: ResizeControllerErrorCode, message: string) {
    super(message);
    this.name = 'ResizeControllerError';
  }
}

export const RESIZE_LIMITS = Object.freeze({
  minWidth: 220,
  minHeight: 150,
  maxWidth: 420,
  maxHeight: 280,
  inactivityTimeoutMs: 10_000,
  updateIntervalMs: 1_000 / 30,
});

interface ResizeSession {
  token: string;
  edge: ResizeEdge;
  startBounds: WindowBounds;
  startCursor: ScreenPoint;
  workArea: WindowBounds;
  lastAppliedAt: number;
  pendingCursor?: ScreenPoint;
  updateTimer?: ResizeTimer;
  timeoutTimer?: ResizeTimer;
}

const cloneBounds = (bounds: WindowBounds): WindowBounds => ({ ...bounds });
const clonePoint = (point: ScreenPoint): ScreenPoint => ({ ...point });
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(value, maximum));

function assertSafeNumber(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new ResizeControllerError('INVALID_GEOMETRY', `${label} must be a safe integer`);
  }
}

function assertPoint(point: ScreenPoint): void {
  assertSafeNumber(point.x, 'cursor.x');
  assertSafeNumber(point.y, 'cursor.y');
}

function assertBounds(bounds: WindowBounds, label: string): void {
  assertSafeNumber(bounds.x, `${label}.x`);
  assertSafeNumber(bounds.y, `${label}.y`);
  assertSafeNumber(bounds.width, `${label}.width`);
  assertSafeNumber(bounds.height, `${label}.height`);
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new ResizeControllerError('INVALID_GEOMETRY', `${label} must have a positive size`);
  }
}

function sameBounds(left: WindowBounds, right: WindowBounds): boolean {
  return left.x === right.x && left.y === right.y &&
    left.width === right.width && left.height === right.height;
}

/**
 * Owns the lifetime and geometry of a single custom resize gesture.
 * Renderer coordinates never enter this class; all cursor positions come from Main.
 */
export class ResizeController {
  private active?: ResizeSession;

  constructor(private readonly environment: ResizeControllerEnvironment) {}

  start(edge: ResizeEdge): ResizeResult {
    if (this.active) {
      throw new ResizeControllerError('ACTIVE_SESSION', 'A resize session is already active');
    }

    const startBounds = cloneBounds(this.environment.getBounds());
    const startCursor = clonePoint(this.environment.getCursor());
    const workArea = cloneBounds(this.environment.getWorkArea(startBounds));
    assertBounds(startBounds, 'bounds');
    assertPoint(startCursor);
    assertBounds(workArea, 'workArea');

    const token = this.environment.createToken();
    if (!token) {
      throw new ResizeControllerError('INVALID_GEOMETRY', 'Resize token must not be empty');
    }

    const now = this.readNow();
    const session: ResizeSession = {
      token,
      edge,
      startBounds,
      startCursor,
      workArea,
      // There has been no setBounds call yet, so the first update may be applied immediately.
      lastAppliedAt: now - RESIZE_LIMITS.updateIntervalMs,
    };
    this.active = session;
    this.armTimeout(session);
    return { token, bounds: cloneBounds(startBounds) };
  }

  update(token: string): ResizeResult {
    const session = this.requireSession(token);
    const cursor = this.readCursor();
    const now = this.readNow();
    this.armTimeout(session);

    const elapsed = now - session.lastAppliedAt;
    if (elapsed >= RESIZE_LIMITS.updateIntervalMs) {
      this.clearUpdateTimer(session);
      session.pendingCursor = undefined;
      return { bounds: this.applyCursor(session, cursor, now) };
    }

    session.pendingCursor = cursor;
    if (!session.updateTimer) {
      const delay = Math.max(0, RESIZE_LIMITS.updateIntervalMs - elapsed);
      session.updateTimer = this.environment.setTimer(() => this.flushPending(session), delay);
    }
    return { bounds: this.readBounds() };
  }

  end(token: string): ResizeResult {
    const session = this.requireSession(token);
    const cursor = this.readCursor();
    this.clearUpdateTimer(session);
    session.pendingCursor = undefined;

    try {
      const bounds = this.applyCursor(session, cursor, this.readNow());
      return { bounds };
    } finally {
      this.expire(session);
    }
  }

  cancel(token: string): ResizeResult {
    const session = this.requireSession(token);
    const bounds = this.readBounds();
    this.expire(session);
    return { bounds };
  }

  /** Invalidates the current gesture for Main-owned lifecycle events. */
  invalidate(): void {
    if (this.active) this.expire(this.active);
  }

  hasActiveSession(): boolean {
    return this.active !== undefined;
  }

  private requireSession(token: string): ResizeSession {
    if (!this.active || this.active.token !== token) {
      throw new ResizeControllerError('INVALID_TOKEN', 'Resize token is invalid or expired');
    }
    return this.active;
  }

  private readNow(): number {
    const now = this.environment.now();
    if (!Number.isFinite(now)) {
      throw new ResizeControllerError('INVALID_GEOMETRY', 'Clock must return a finite value');
    }
    return now;
  }

  private readCursor(): ScreenPoint {
    const cursor = clonePoint(this.environment.getCursor());
    assertPoint(cursor);
    return cursor;
  }

  private readBounds(): WindowBounds {
    const bounds = cloneBounds(this.environment.getBounds());
    assertBounds(bounds, 'bounds');
    return bounds;
  }

  private armTimeout(session: ResizeSession): void {
    if (session.timeoutTimer) this.environment.clearTimer(session.timeoutTimer);
    session.timeoutTimer = this.environment.setTimer(() => {
      if (this.active === session) this.expire(session);
    }, RESIZE_LIMITS.inactivityTimeoutMs);
  }

  private flushPending(session: ResizeSession): void {
    session.updateTimer = undefined;
    if (this.active !== session || !session.pendingCursor) return;

    const cursor = session.pendingCursor;
    session.pendingCursor = undefined;
    this.applyCursor(session, cursor, this.readNow());
  }

  private applyCursor(session: ResizeSession, cursor: ScreenPoint, now: number): WindowBounds {
    const target = this.calculateBounds(session, cursor);
    const current = this.readBounds();
    if (!sameBounds(target, current)) {
      this.environment.setBounds(cloneBounds(target));
      session.lastAppliedAt = now;
    }
    return this.readBounds();
  }

  private calculateBounds(session: ResizeSession, cursor: ScreenPoint): WindowBounds {
    const { startBounds, startCursor, workArea, edge } = session;
    const west = edge === 'nw' || edge === 'sw';
    const north = edge === 'nw' || edge === 'ne';
    const anchorX = west ? startBounds.x + startBounds.width : startBounds.x;
    const anchorY = north ? startBounds.y + startBounds.height : startBounds.y;
    const deltaX = cursor.x - startCursor.x;
    const deltaY = cursor.y - startCursor.y;
    const requestedWidth = startBounds.width + (west ? -deltaX : deltaX);
    const requestedHeight = startBounds.height + (north ? -deltaY : deltaY);
    const availableWidth = west
      ? anchorX - workArea.x
      : workArea.x + workArea.width - anchorX;
    const availableHeight = north
      ? anchorY - workArea.y
      : workArea.y + workArea.height - anchorY;
    const maximumWidth = Math.max(
      RESIZE_LIMITS.minWidth,
      Math.min(RESIZE_LIMITS.maxWidth, availableWidth),
    );
    const maximumHeight = Math.max(
      RESIZE_LIMITS.minHeight,
      Math.min(RESIZE_LIMITS.maxHeight, availableHeight),
    );
    const width = clamp(requestedWidth, RESIZE_LIMITS.minWidth, maximumWidth);
    const height = clamp(requestedHeight, RESIZE_LIMITS.minHeight, maximumHeight);

    return {
      x: west ? anchorX - width : anchorX,
      y: north ? anchorY - height : anchorY,
      width,
      height,
    };
  }

  private clearUpdateTimer(session: ResizeSession): void {
    if (!session.updateTimer) return;
    this.environment.clearTimer(session.updateTimer);
    session.updateTimer = undefined;
  }

  private expire(session: ResizeSession): void {
    this.clearUpdateTimer(session);
    if (session.timeoutTimer) {
      this.environment.clearTimer(session.timeoutTimer);
      session.timeoutTimer = undefined;
    }
    session.pendingCursor = undefined;
    if (this.active === session) this.active = undefined;
  }
}
