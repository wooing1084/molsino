import { describe, expect, it } from 'vitest';
import { BIG_WHEEL_SEGMENTS } from '../../src/core/bigwheel/core';
import { WheelMotion, wheelSegmentAt, WHEEL_SPIN_MS } from '../../src/renderer/wheel-presentation';

describe('public 54-cell wheel display mapping', () => {
  it.each(Array.from({ length: 54 }, (_, i) => i))('preserves the true neighbors around index %i in every repetition', index => {
    for (const lap of [-3, 0, 1, 7]) {
      const position = lap * 54 + index;
      expect([-1, 0, 1].map(offset => wheelSegmentAt(position + offset))).toEqual([(index + 53) % 54, index, (index + 1) % 54]);
      expect(wheelSegmentAt(position + .75)).toBe(index);
    }
  });
  it('keeps adjacent occurrences separate even when all three symbols match', () => {
    const indices = [-1, 0, 1].map(offset => wheelSegmentAt(5 + offset));
    expect(indices).toEqual([4, 5, 6]);
    expect(indices.map(index => BIG_WHEEL_SEGMENTS[index])).toEqual(['silver', 'silver', 'silver']);
    expect([-1, 0, 1].map(offset => wheelSegmentAt(offset))).toEqual([53, 0, 1]);
    expect([-1, 0, 1].map(offset => wheelSegmentAt(53 + offset))).toEqual([52, 53, 0]);
  });
});

describe('continuous wheel trajectory', () => {
  it('keeps moving while a public outcome is unavailable, including beyond the normal duration', () => {
    const wheel = new WheelMotion(); wheel.start(100);
    let previous = -1;
    for (const time of [100, 101, 500, 1900, 2600, 10000]) {
      const frame = wheel.sample(time);
      expect(frame.moving).toBe(true); expect(frame.completeAt).toBeUndefined();
      expect(frame.position).toBeGreaterThan(previous); previous = frame.position;
    }
  });
  it.each([0, 100, 449, 900, 2500, 10000])('preserves position and velocity when the result arrives at %ims, then only decelerates to every target', receivedAt => {
    for (let index = 0; index < 54; index++) {
      const wheel = new WheelMotion(); wheel.start(0);
      const before = wheel.sample(receivedAt).position;
      wheel.settle(index, receivedAt);
      const starting = wheel.sample(receivedAt);
      expect(starting.position).toBe(before);
      const endAt = starting.completeAt!;
      if (receivedAt <= 449) expect(endAt).toBe(WHEEL_SPIN_MS);
      else expect(endAt).toBeGreaterThan(WHEEL_SPIN_MS);
      const duration = endAt - receivedAt;
      const epsilon = .001;
      const initialVelocity = (wheel.sample(receivedAt + epsilon).position - before) / epsilon;
      expect(initialVelocity).toBeCloseTo(.12, 5);
      let priorPosition = before, priorVelocity = .12;
      for (let step = 1; step <= 100; step++) {
        const time = receivedAt + duration * step / 100;
        const position = wheel.sample(time).position;
        const velocity = (position - priorPosition) / (duration / 100);
        expect(position).toBeGreaterThanOrEqual(priorPosition);
        expect(velocity).toBeLessThanOrEqual(priorVelocity + 1e-10);
        priorPosition = position; priorVelocity = velocity;
      }
      const final = wheel.sample(endAt);
      expect(final.moving).toBe(false); expect(Number.isInteger(final.position)).toBe(true);
      expect(wheelSegmentAt(final.position)).toBe(index);
      expect((final.position - wheel.sample(endAt - epsilon).position) / epsilon).toBeCloseTo(0, 5);
      expect(wheel.sample(endAt + 10000).position).toBe(final.position);
    }
  });
  it('never restarts deceleration on duplicate public results and can snap restored results without animation', () => {
    const wheel = new WheelMotion(); wheel.start(100); wheel.settle(53, 150);
    const expected = wheel.sample(600);
    wheel.settle(53, 600);
    expect(wheel.sample(600)).toEqual(expected);
    wheel.snap(0); expect(wheel.sample(10000)).toEqual({ position: 0, moving: false });
    wheel.snap(53); expect(wheel.sample(10001)).toEqual({ position: 53, moving: false });
    wheel.start(10002); expect(wheel.sample(10002)).toEqual({ position: 0, moving: true });
  });
});
