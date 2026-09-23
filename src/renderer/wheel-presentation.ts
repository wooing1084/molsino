import { BIG_WHEEL_SEGMENTS } from '../core/bigwheel/core';

export const WHEEL_SPIN_MS = 1800;
const SEGMENT_COUNT = BIG_WHEEL_SEGMENTS.length;
/** Public display velocity in cells per millisecond; it does not select a result. */
const CRUISE_SPEED = 0.12;
// A full 54-cell range guarantees a matching target within the monotone Hermite interval.
const MIN_BRAKE_MS = 3 * SEGMENT_COUNT / CRUISE_SPEED;

/** The array index at an absolute cell occurrence, including repeats and the left neighbor of zero. */
export function wheelSegmentAt(position: number): number {
  return ((Math.floor(position) % SEGMENT_COUNT) + SEGMENT_COUNT) % SEGMENT_COUNT;
}

interface Deceleration {
  startedAt: number;
  startPosition: number;
  endAt: number;
  endPosition: number;
}
export interface WheelMotionFrame {
  /** Unwrapped position under the stationary pointer. Increasing values move the strip left. */
  position: number;
  moving: boolean;
  completeAt?: number;
}

/** A deterministic display trajectory over the public wheel; no timers, randomness or game commands. */
export class WheelMotion {
  private startedAt = 0;
  private startPosition = 0;
  private active = false;
  private deceleration?: Deceleration;

  start(now: number): void {
    this.startedAt = now;
    this.startPosition = 0;
    this.active = true;
    this.deceleration = undefined;
  }

  snap(segmentIndex = 0): void {
    this.startPosition = segmentIndex;
    this.active = false;
    this.deceleration = undefined;
  }

  /** Called only once a committed public result is available. Duplicate snapshots keep the trajectory. */
  settle(segmentIndex: number, now: number): void {
    if (!this.active || this.deceleration) return;
    const startPosition = this.sample(now).position;
    const duration = Math.max(this.startedAt + WHEEL_SPIN_MS - now, MIN_BRAKE_MS);
    const minimumEnd = startPosition + CRUISE_SPEED * duration / 3;
    const endPosition = segmentIndex + SEGMENT_COUNT * Math.ceil((minimumEnd - segmentIndex) / SEGMENT_COUNT);
    this.deceleration = { startedAt: now, startPosition, endAt: now + duration, endPosition };
  }

  sample(now: number): WheelMotionFrame {
    if (!this.active) return { position: this.startPosition, moving: false };
    const stop = this.deceleration;
    if (!stop || now < stop.startedAt) return { position: this.startPosition + Math.max(0, now - this.startedAt) * CRUISE_SPEED, moving: true };
    if (now >= stop.endAt) return { position: stop.endPosition, moving: false, completeAt: stop.endAt };
    const duration = stop.endAt - stop.startedAt;
    const u = Math.max(0, (now - stop.startedAt) / duration), u2 = u * u, u3 = u2 * u;
    const distance = stop.endPosition - stop.startPosition;
    // Cubic Hermite: matching initial cruise velocity, zero terminal velocity.
    // vT/3 <= distance <= 2vT/3 makes its velocity nonnegative and nonincreasing.
    const position = stop.startPosition + (u3 - 2 * u2 + u) * CRUISE_SPEED * duration + (-2 * u3 + 3 * u2) * distance;
    return { position, moving: true, completeAt: stop.endAt };
  }
}
