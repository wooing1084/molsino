export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

/** A physical playing card. `cardId` is unique within a shoe. */
export interface Card {
  readonly cardId: string;
  readonly rank: Rank;
  readonly suit: Suit;
}

export interface Hand {
  readonly cards: readonly Card[];
}

export type HandScore = {
  readonly total: number;
  /** The best total before lowering an ace from 11 to 1, when that total is valid. */
  readonly softTotal?: number;
  readonly isSoft: boolean;
  readonly isBust: boolean;
};
