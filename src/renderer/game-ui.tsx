import type { CardView } from '../shared/contracts';
import type { AppView } from '../shared/app-contracts';
import type { PresentationFrame } from './presentation';

export const compactUsd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const suits = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function TableLimits({ table }: { table: AppView['table'] }) {
  return <div className="table-limits" aria-label="베팅 한도">최소 {compactUsd(table.minBetCents)} · 최대 {compactUsd(table.maxBetCents)}</div>;
}

export function CardFace({ card, presentation }: { card: CardView; presentation: PresentationFrame }) {
  const revealed = presentation.revealedCardIds.has(card.cardId);
  return <span className={`card${revealed && (card.suit === 'H' || card.suit === 'D') ? ' red' : ''}`} data-revealed={revealed}>
    {revealed ? <span className={presentation.animatedCardId === card.cardId ? 'card-face revealing' : 'card-face'}>{card.rank}{suits[card.suit]}</span> : '?'}
  </span>;
}
