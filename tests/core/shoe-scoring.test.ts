import { describe, expect, it } from 'vitest';
import { RANKS, SUITS, type Card } from '../../src/core/models';
import { scoreHand } from '../../src/core/scoring';
import { CUT_CARD_INDEX, SHOE_SIZE, type Shoe, createCards, createShuffledShoe, drawCard, fisherYates, needsReshuffleAtRoundStart, remainingCards } from '../../src/core/shoe';

const card = (rank: Card['rank'], suit: Card['suit'] = 'S'): Card => ({ cardId: `${rank}${suit}`, rank, suit });

describe('cards and shoes', () => {
  it('defines the standard ranks and suits', () => {
    expect(RANKS).toHaveLength(13);
    expect(SUITS).toHaveLength(4);
  });

  it('creates six decks with 312 unique physical IDs', () => {
    const cards = createCards();
    expect(cards).toHaveLength(SHOE_SIZE);
    expect(new Set(cards.map(({ cardId }) => cardId)).size).toBe(SHOE_SIZE);
    expect(cards.filter(({ rank, suit }) => rank === 'A' && suit === 'S')).toHaveLength(6);
    expect(() => createCards(() => 'duplicate')).toThrow('unique');
  });

  it('uses the injected random source for Fisher-Yates', () => {
    const calls: number[] = [];
    const shuffled = fisherYates([0, 1, 2, 3], (max) => {
      calls.push(max);
      return 0;
    });
    expect(shuffled).toEqual([1, 2, 3, 0]);
    expect(calls).toEqual([4, 3, 2]);
    expect(createShuffledShoe({ randomInt: () => 0 }).cards).toHaveLength(SHOE_SIZE);
  });

  it('marks the cut at 75% and requires the 78-card safety margin', () => {
    let shoe: Shoe = { cards: createCards(), nextIndex: 0 };
    for (let index = 0; index < CUT_CARD_INDEX - 1; index += 1) shoe = drawCard(shoe).shoe;
    expect(needsReshuffleAtRoundStart(shoe)).toBe(false);
    shoe = drawCard(shoe).shoe;
    expect(needsReshuffleAtRoundStart(shoe)).toBe(true);

    let nearSafety: Shoe = { cards: createCards().slice(0, 100), nextIndex: 0 };
    for (let index = 0; index < 23; index += 1) nearSafety = drawCard(nearSafety).shoe;
    expect(remainingCards(nearSafety)).toBe(77);
    expect(needsReshuffleAtRoundStart(nearSafety)).toBe(true);
    expect(() => drawCard({ cards: createCards(), nextIndex: -1 })).toThrow('index');
  });
});

describe('hand scoring', () => {
  it('scores multiple aces without busting when an ace can be one', () => {
    expect(scoreHand([card('A'), card('A'), card('9')])).toMatchObject({ total: 21, isSoft: true, isBust: false });
    expect(scoreHand([card('A'), card('A'), card('A'), card('8')])).toMatchObject({ total: 21, isSoft: true, isBust: false });
  });

  it('distinguishes soft and hard totals and busts', () => {
    expect(scoreHand([card('A'), card('6')])).toMatchObject({ total: 17, softTotal: 17, isSoft: true });
    expect(scoreHand([card('A'), card('6'), card('10')])).toMatchObject({ total: 17, isSoft: false, isBust: false });
    expect(scoreHand([card('K'), card('9'), card('5')])).toMatchObject({ total: 24, isSoft: false, isBust: true });
  });
});
