import type { Card, Hand, HandScore, Rank } from './models';

function rankValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

export function scoreHand(cards: readonly Card[] | Hand): HandScore {
  const cardList = 'cards' in cards ? cards.cards : cards;
  let total = 0;
  let aces = 0;
  for (const card of cardList) {
    total += rankValue(card.rank);
    if (card.rank === 'A') aces += 1;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  // Any ace that remains valued at 11 makes the best total soft (including A,A,9).
  const isSoft = aces > 0;
  return {
    total,
    ...(isSoft ? { softTotal: total } : {}),
    isSoft,
    isBust: total > 21,
  };
}

export function handValue(cards: readonly Card[] | Hand): number {
  return scoreHand(cards).total;
}
