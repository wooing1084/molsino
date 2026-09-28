import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { RANKS } from '../../core/models';
import { burnShoe, createCards, createShoe, type BaccaratShoe } from '../../core/baccarat/core';

// Only Main's isolated E2E mode supplies a fixture path. Prefix includes the burn cards.
export function createBaccaratShoeFactory(fixturePath?: string): () => BaccaratShoe {
  if (!fixturePath) return () => createShoe(randomInt);
  const { ranks } = z.object({ ranks: z.array(z.enum(RANKS)) }).strict().parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
  const pool = createCards();
  const prefix = ranks.map(rank => {
    const index = pool.findIndex(c => c.rank === rank);
    if (index < 0) throw new Error('Too many fixture cards of one rank');
    return pool.splice(index, 1)[0]!;
  });
  const shoe = burnShoe([...prefix, ...pool]);
  return () => structuredClone(shoe);
}
