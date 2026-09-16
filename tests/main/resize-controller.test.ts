import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESIZE_LIMITS,
  ResizeController,
  ResizeControllerError,
  type ResizeControllerEnvironment,
  type ScreenPoint,
} from '../../src/main/windows/resize-controller';
import type { ResizeEdge, WindowBounds } from '../../src/shared/contracts';

interface Harness {
  controller: ResizeController;
  bounds: WindowBounds;
  cursor: ScreenPoint;
  setBoundsCalls: WindowBounds[];
  setWorkArea(workArea: WindowBounds): void;
}

function createHarness(options: {
  bounds?: WindowBounds;
  cursor?: ScreenPoint;
  workArea?: WindowBounds;
  tokens?: string[];
} = {}): Harness {
  let bounds = options.bounds ?? { x: 100, y: 100, width: 280, height: 180 };
  let cursor = options.cursor ?? { x: 380, y: 280 };
  let workArea = options.workArea ?? { x: 0, y: 0, width: 1_000, height: 800 };
  const tokens = [...(options.tokens ?? ['00000000-0000-4000-8000-000000000001'])];
  const setBoundsCalls: WindowBounds[] = [];
  const environment: ResizeControllerEnvironment = {
    now: () => Date.now(),
    getCursor: () => ({ ...cursor }),
    getBounds: () => ({ ...bounds }),
    getWorkArea: () => ({ ...workArea }),
    setBounds: next => {
      bounds = { ...next };
      setBoundsCalls.push({ ...next });
    },
    createToken: () => tokens.shift() ?? '00000000-0000-4000-8000-000000000002',
    setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimer: timer => clearTimeout(timer),
  };
  const controller = new ResizeController(environment);

  return {
    controller,
    get bounds() { return bounds; },
    set bounds(next) { bounds = { ...next }; },
    get cursor() { return cursor; },
    set cursor(next) { cursor = { ...next }; },
    setBoundsCalls,
    setWorkArea(next) { workArea = { ...next }; },
  };
}

function expectControllerError(action: () => unknown, code: ResizeControllerError['code']): void {
  try {
    action();
    throw new Error('Expected ResizeControllerError');
  } catch (error) {
    expect(error).toBeInstanceOf(ResizeControllerError);
    expect((error as ResizeControllerError).code).toBe(code);
  }
}

describe('ResizeController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each<{
    edge: ResizeEdge;
    startCursor: ScreenPoint;
    cursor: ScreenPoint;
    expected: WindowBounds;
  }>([
    {
      edge: 'nw',
      startCursor: { x: 100, y: 100 },
      cursor: { x: 50, y: 60 },
      expected: { x: 50, y: 60, width: 330, height: 220 },
    },
    {
      edge: 'ne',
      startCursor: { x: 380, y: 100 },
      cursor: { x: 430, y: 60 },
      expected: { x: 100, y: 60, width: 330, height: 220 },
    },
    {
      edge: 'sw',
      startCursor: { x: 100, y: 280 },
      cursor: { x: 50, y: 320 },
      expected: { x: 50, y: 100, width: 330, height: 220 },
    },
    {
      edge: 'se',
      startCursor: { x: 380, y: 280 },
      cursor: { x: 430, y: 320 },
      expected: { x: 100, y: 100, width: 330, height: 220 },
    },
  ])('keeps the opposite corner anchored while resizing $edge', ({ edge, startCursor, cursor, expected }) => {
    const harness = createHarness({ cursor: startCursor });
    const token = harness.controller.start(edge).token!;
    harness.cursor = cursor;

    expect(harness.controller.update(token).bounds).toEqual(expected);
    expect(harness.bounds).toEqual(expected);
  });

  it('clamps to product limits and the starting display work area', () => {
    const productMaximum = createHarness();
    const productMaximumToken = productMaximum.controller.start('se').token!;
    productMaximum.cursor = { x: 10_000, y: 10_000 };
    expect(productMaximum.controller.update(productMaximumToken).bounds).toEqual({
      x: 100,
      y: 100,
      width: RESIZE_LIMITS.maxWidth,
      height: RESIZE_LIMITS.maxHeight,
    });

    const workAreaMaximum = createHarness({
      cursor: { x: 380, y: 280 },
      workArea: { x: 0, y: 0, width: 500, height: 350 },
    });
    const workAreaToken = workAreaMaximum.controller.start('se').token!;
    workAreaMaximum.cursor = { x: 10_000, y: 10_000 };
    expect(workAreaMaximum.controller.update(workAreaToken).bounds).toEqual({
      x: 100,
      y: 100,
      width: 400,
      height: 250,
    });

    const minimum = createHarness({ cursor: { x: 100, y: 100 } });
    const minimumToken = minimum.controller.start('nw').token!;
    minimum.cursor = { x: 10_000, y: 10_000 };
    expect(minimum.controller.update(minimumToken).bounds).toEqual({
      x: 160,
      y: 130,
      width: RESIZE_LIMITS.minWidth,
      height: RESIZE_LIMITS.minHeight,
    });
  });

  it('accepts negative display coordinates when clamping to its work area', () => {
    const harness = createHarness({
      bounds: { x: -500, y: -300, width: 280, height: 180 },
      cursor: { x: -220, y: -120 },
      workArea: { x: -800, y: -500, width: 600, height: 400 },
    });
    const token = harness.controller.start('se').token!;
    harness.cursor = { x: 10_000, y: 10_000 };

    expect(harness.controller.update(token).bounds).toEqual({
      x: -500,
      y: -300,
      width: 300,
      height: 200,
    });
  });

  it('uses the start frame for every update instead of accumulating drift', () => {
    const harness = createHarness();
    const token = harness.controller.start('se').token!;
    harness.cursor = { x: 390, y: 290 };
    harness.controller.update(token);
    vi.advanceTimersByTime(34);
    harness.cursor = { x: 400, y: 300 };

    expect(harness.controller.update(token).bounds).toEqual({ x: 100, y: 100, width: 300, height: 200 });
  });

  it('coalesces rapid updates and applies at most one trailing value per 30Hz interval', () => {
    const harness = createHarness();
    const token = harness.controller.start('se').token!;
    harness.cursor = { x: 390, y: 290 };
    harness.controller.update(token);
    expect(harness.setBoundsCalls).toHaveLength(1);

    vi.advanceTimersByTime(5);
    harness.cursor = { x: 400, y: 300 };
    harness.controller.update(token);
    vi.advanceTimersByTime(5);
    harness.cursor = { x: 410, y: 310 };
    harness.controller.update(token);
    expect(harness.setBoundsCalls).toHaveLength(1);

    vi.advanceTimersByTime(24);
    expect(harness.setBoundsCalls).toEqual([
      { x: 100, y: 100, width: 290, height: 190 },
      { x: 100, y: 100, width: 310, height: 210 },
    ]);
  });

  it('flushes the current cursor on end and rejects replayed tokens', () => {
    const harness = createHarness();
    const token = harness.controller.start('se').token!;
    harness.cursor = { x: 390, y: 290 };
    harness.controller.update(token);
    vi.advanceTimersByTime(5);
    harness.cursor = { x: 480, y: 360 };

    expect(harness.controller.end(token).bounds).toEqual({ x: 100, y: 100, width: 380, height: 260 });
    expect(harness.controller.hasActiveSession()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(harness.setBoundsCalls).toHaveLength(2);
    expectControllerError(() => harness.controller.update(token), 'INVALID_TOKEN');
  });

  it('expires after ten seconds without a command and resets timeout on valid updates', () => {
    const expired = createHarness();
    const expiredToken = expired.controller.start('se').token!;
    vi.advanceTimersByTime(RESIZE_LIMITS.inactivityTimeoutMs);
    expect(expired.controller.hasActiveSession()).toBe(false);
    expectControllerError(() => expired.controller.update(expiredToken), 'INVALID_TOKEN');

    const active = createHarness();
    const activeToken = active.controller.start('se').token!;
    vi.advanceTimersByTime(9_000);
    active.cursor = { x: 390, y: 290 };
    active.controller.update(activeToken);
    vi.advanceTimersByTime(9_999);
    expect(active.controller.hasActiveSession()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(active.controller.hasActiveSession()).toBe(false);
  });

  it('allows one session and cancel or lifecycle invalidation discards pending work', () => {
    const harness = createHarness({
      tokens: [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ],
    });
    const firstToken = harness.controller.start('se').token!;
    expectControllerError(() => harness.controller.start('nw'), 'ACTIVE_SESSION');
    expectControllerError(() => harness.controller.cancel('00000000-0000-4000-8000-999999999999'), 'INVALID_TOKEN');

    harness.cursor = { x: 390, y: 290 };
    harness.controller.update(firstToken);
    vi.advanceTimersByTime(5);
    harness.cursor = { x: 420, y: 320 };
    harness.controller.update(firstToken);
    const beforeCancel = { ...harness.bounds };
    expect(harness.controller.cancel(firstToken).bounds).toEqual(beforeCancel);
    vi.advanceTimersByTime(100);
    expect(harness.bounds).toEqual(beforeCancel);
    expectControllerError(() => harness.controller.update(firstToken), 'INVALID_TOKEN');

    harness.controller.start('nw');
    harness.controller.invalidate();
    expect(harness.controller.hasActiveSession()).toBe(false);
  });

  it('rejects non-finite or unsafe geometry before applying bounds', () => {
    const unsafeCursor = createHarness({ cursor: { x: Number.NaN, y: 0 } });
    expectControllerError(() => unsafeCursor.controller.start('se'), 'INVALID_GEOMETRY');

    const unsafeBounds = createHarness({
      bounds: { x: 0, y: 0, width: Number.MAX_SAFE_INTEGER + 1, height: 180 },
    });
    expectControllerError(() => unsafeBounds.controller.start('se'), 'INVALID_GEOMETRY');
  });
});
