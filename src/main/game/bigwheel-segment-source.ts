import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { BIG_WHEEL_SEGMENTS } from '../../core/bigwheel/core';
// Main supplies a fixture path only in isolated E2E mode. The deterministic sequence repeats.
export function createBigWheelSegmentSource(fixturePath?: string): () => number {
  if (!fixturePath) return () => randomInt(BIG_WHEEL_SEGMENTS.length);
  const { indices } = z.object({ indices: z.array(z.number().int().min(0).max(53)).min(1) }).strict().parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
  let cursor = 0;
  return () => indices[cursor++ % indices.length]!;
}
