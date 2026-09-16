import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { RANKS, SUITS, type Card } from '../../core/models';
import { createCards, createShoe, type Shoe } from '../../core/shoe';

const fixtureSchema = z.object({
  cards: z.array(z.object({
    cardId: z.string().min(1),
    rank: z.enum(RANKS),
    suit: z.enum(SUITS),
  }).strict()),
}).passthrough();

export function createShoeFactory(fixturePath?: string): () => Shoe {
  if (!fixturePath) return () => createShoe({ randomInt });
  const parsed = fixtureSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
  const fixtureShoe = buildFixtureShoe(parsed.cards);
  return () => ({ cards: fixtureShoe.cards.map((card) => ({ ...card })), nextIndex: 0 });
}

function buildFixtureShoe(selectedCards: readonly Card[]): Shoe {
  const pool = createCards();
  const selectedIds = new Set<string>();
  for (const selected of selectedCards) {
    if (selectedIds.has(selected.cardId)) throw new Error('Fixture card IDs must be unique');
    selectedIds.add(selected.cardId);
    const match = pool.findIndex((card) => card.rank === selected.rank && card.suit === selected.suit);
    if (match < 0) throw new Error(`Fixture requests too many ${selected.rank}-${selected.suit} cards`);
    pool.splice(match, 1);
  }
  if (pool.some((card) => selectedIds.has(card.cardId))) throw new Error('Fixture card ID collides with generated shoe');
  return { cards: [...selectedCards.map((card) => ({ ...card })), ...pool], nextIndex: 0 };
}
