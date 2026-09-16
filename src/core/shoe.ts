import { RANKS, SUITS, type Card } from './models';

export const DECK_COUNT = 6;
export const CARDS_PER_DECK = 52;
export const SHOE_SIZE = DECK_COUNT * CARDS_PER_DECK;
export const CUT_CARD_INDEX = Math.floor(SHOE_SIZE * 0.75);
export const MINIMUM_REMAINING_CARDS = 78;

export type RandomInt = (maxExclusive: number) => number;
export type CardIdFactory = (deckIndex: number, cardIndex: number) => string;
export interface ShoeOptions { readonly randomInt: RandomInt; readonly idFactory?: CardIdFactory; }
export interface Shoe { readonly cards: readonly Card[]; readonly nextIndex: number; }
export interface DrawResult { readonly card: Card; readonly shoe: Shoe; }

export function createCards(idFactory: CardIdFactory = defaultCardId): Card[] {
  const cards: Card[] = [];
  const ids = new Set<string>();
  for (let deckIndex = 0; deckIndex < DECK_COUNT; deckIndex += 1) {
    for (let cardIndex = 0; cardIndex < CARDS_PER_DECK; cardIndex += 1) {
      const suit = SUITS[Math.floor(cardIndex / RANKS.length)];
      const rank = RANKS[cardIndex % RANKS.length];
      if (suit === undefined || rank === undefined) throw new Error('Invalid card definition');
      const cardId = idFactory(deckIndex, cardIndex);
      if (!cardId || ids.has(cardId)) throw new Error('Card ID factory must return unique, non-empty IDs');
      ids.add(cardId);
      cards.push({ cardId, rank, suit });
    }
  }
  return cards;
}

export function fisherYates<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Random source returned an invalid index');
    const left = result[i];
    const right = result[j];
    if (left === undefined || right === undefined) throw new Error('Invalid shuffle state');
    result[i] = right;
    result[j] = left;
  }
  return result;
}

export function createShuffledShoe(options: ShoeOptions): Shoe {
  return { cards: fisherYates(createCards(options.idFactory), options.randomInt), nextIndex: 0 };
}

export function createShoe(options: ShoeOptions): Shoe { return createShuffledShoe(options); }
export function remainingCards(shoe: Shoe): number { return shoe.cards.length - shoe.nextIndex; }
export function usedCards(shoe: Shoe): number { return shoe.nextIndex; }
export function cutReached(shoe: Shoe): boolean { return usedCards(shoe) >= CUT_CARD_INDEX; }
export function needsReshuffleAtRoundStart(shoe: Shoe): boolean {
  return cutReached(shoe) || remainingCards(shoe) < MINIMUM_REMAINING_CARDS;
}

export function drawCard(shoe: Shoe): DrawResult {
  if (!Number.isSafeInteger(shoe.nextIndex) || shoe.nextIndex < 0 || shoe.nextIndex > shoe.cards.length) {
    throw new Error('Invalid shoe index');
  }
  const card = shoe.cards[shoe.nextIndex];
  if (card === undefined) throw new Error('Shoe exhausted');
  return { card, shoe: { cards: shoe.cards, nextIndex: shoe.nextIndex + 1 } };
}

export function drawCards(shoe: Shoe, count: number): { cards: Card[]; shoe: Shoe } {
  if (!Number.isSafeInteger(count) || count < 0 || count > remainingCards(shoe)) throw new Error('Not enough cards in shoe');
  const drawn: Card[] = [];
  let current = shoe;
  for (let index = 0; index < count; index += 1) {
    const result = drawCard(current);
    drawn.push(result.card);
    current = result.shoe;
  }
  return { cards: drawn, shoe: current };
}

export function reshuffleShoe(options: ShoeOptions): Shoe { return createShuffledShoe(options); }

function defaultCardId(deckIndex: number, cardIndex: number): string {
  const suit = SUITS[Math.floor(cardIndex / RANKS.length)];
  const rank = RANKS[cardIndex % RANKS.length];
  if (suit === undefined || rank === undefined) throw new Error('Invalid card definition');
  return `d${deckIndex + 1}-${suit}-${rank}`;
}
