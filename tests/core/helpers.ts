import type { EngineEnvironment, SessionState } from '../../src/core/game-state';
import type { Card, Rank, Suit } from '../../src/core/models';
import { createCards, type Shoe } from '../../src/core/shoe';
import { transition } from '../../src/core/engine';

export function card(rank: Rank, suit: Suit = 'S', suffix = '1'): Card {
  return { cardId: `${rank}-${suit}-${suffix}`, rank, suit };
}

export function fixtureShoe(cards: readonly Card[], nextIndex = 0): Shoe {
  const pool = createCards();
  for (const selected of cards) {
    const match = pool.findIndex(({ rank, suit }) => rank === selected.rank && suit === selected.suit);
    if (match < 0) throw new Error(`fixture requests too many ${selected.rank}-${selected.suit} cards`);
    pool.splice(match, 1);
  }
  if (nextIndex < 0 || nextIndex + cards.length > 312) throw new Error('invalid fixture shoe index');
  return {
    cards: [...pool.slice(0, nextIndex), ...cards, ...pool.slice(nextIndex)],
    nextIndex,
  };
}

export function environment(replacementShoe: Shoe = fixtureShoe([])): EngineEnvironment {
  let round = 0;
  let hand = 0;
  return {
    createShoe: () => replacementShoe,
    nextId: (kind) => {
      if (kind === 'round') {
        round += 1;
        return `round-${round}`;
      }
      hand += 1;
      return `hand-${hand}`;
    },
  };
}

export function finishDealer(state: SessionState, env: EngineEnvironment): SessionState {
  let current = state;
  while (current.round?.phase === 'dealerTurn') {
    current = transition(current, { type: 'advanceDealer' }, env).nextState;
  }
  return current;
}
