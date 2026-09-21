import { describe, expect, it } from 'vitest';
import type { AppView } from '../../src/shared/app-contracts';
import type { GameViewState } from '../../src/shared/contracts';
import { PresentationTimeline, visibleBaccaratScore, visibleBlackjackScore } from '../../src/renderer/presentation';
import { card } from '../core/helpers';

const cards = [card('A', 'S', '1'), card('9', 'S', '2'), card('K', 'S', '3'), card('7', 'S', '4'), card('2', 'S', '5'), card('3', 'S', '6')];
const order = cards.map(c => c.cardId);

function baccarat(sequence: number, dealing = false, result = false): AppView {
  return {
    sessionId: 'session', revision: sequence, viewSequence: sequence, platform: 'darwin',
    screen: 'baccarat', activeRoundGameId: dealing && !result ? 'baccarat' : null,
    balanceCents: result ? 10100 : 9900, canNavigate: !dealing || result, saveError: false,
    table: { selectedLevel: 1, minBetCents: 100, maxBetCents: 5000, entryBalanceCents: 100, bestLevel: result ? 2 : 1, bestBankrollCents: result ? 50000 : 10000 },
    blackjack: null, bigwheel: null,
    baccarat: {
      roundId: dealing ? 'round' : null,
      cardRevealOrder: dealing ? order : [],
      phase: result ? 'result' : dealing ? 'dealing' : 'betting',
      pendingBet: { target: 'P', amountCents: 100 },
      player: { cards: dealing ? [cards[0]!, cards[2]!, cards[4]!] : [], total: dealing ? 3 : null },
      banker: { cards: dealing ? [cards[1]!, cards[3]!, cards[5]!] : [], total: dealing ? 9 : null },
      lastResult: result ? { outcome: 'B', bet: { target: 'P', amountCents: 100 }, returnCents: 0, netCents: -100 } : null,
      recentResults: result ? [{ roundId: 'round', outcome: 'B' }] : [],
      legalActions: result ? ['nextRound'] : dealing ? [] : ['deal', 'setBet'],
    },
  };
}

function blackjack(sequence: number, phase: GameViewState['phase']): AppView {
  const base = baccarat(sequence);
  const playing = phase !== 'betting';
  return {
    ...base, screen: 'blackjack', baccarat: null, activeRoundGameId: playing && phase !== 'result' ? 'blackjack' : null,
    blackjack: {
      revision: sequence, platform: 'darwin', balanceCents: 9900, pendingBetCents: 100, betStepCents: 100,
      phase, roundId: playing ? 'round' : null,
      cardRevealOrder: playing ? order.slice(0, phase === 'result' ? 4 : 3) : [],
      dealerHand: { cards: playing ? phase === 'result' ? [cards[1]!, cards[3]!] : [cards[1]!] : [], hiddenCardCount: playing && phase !== 'result' ? 1 : 0 },
      playerHands: playing ? [{ handId: 'hand-1', cards: [cards[0]!, cards[2]!], total: 21, isSoft: true, wagerCents: 100, status: 'playing', active: phase === 'playerTurn', fromSplit: false, doubled: false }] : [],
      activeHandIndex: playing ? 0 : null, legalActions: phase === 'playerTurn' ? ['stand'] : ['deal'],
      lastResult: phase === 'result' ? { roundId: 'round', netCents: 150, entries: [{ componentId: 'hand-1', outcome: 'blackjack', wagerCents: 100, returnedCents: 250, netCents: 150 }] } : undefined,
    },
  };
}

describe('public card presentation timeline', () => {
  it('queues fast six-card terminal snapshots and withholds every result surface until 300ms after the last card', () => {
    const timeline = new PresentationTimeline();
    timeline.receive(baccarat(0), 0);
    let frame = timeline.receive(baccarat(1, true, true), 100);
    expect([...frame.revealedCardIds]).toEqual(order.slice(0, 1));
    expect(frame.view.baccarat?.lastResult).toBeNull();
    expect(frame.view.baccarat?.recentResults).toEqual([]);
    expect(frame.view.table.bestLevel).toBe(1);
    expect(frame.settling).toBe(true);
    expect(frame.view.canNavigate).toBe(false);
    for (let index = 1; index < 6; index++) {
      expect(timeline.advance(100 + index * 450 - 1).revealedCardIds.size).toBe(index);
      frame = timeline.advance(100 + index * 450);
      expect([...frame.revealedCardIds]).toEqual(order.slice(0, index + 1));
    }
    expect(timeline.advance(2649).revealing).toBe(true);
    frame = timeline.advance(2650);
    expect(frame.revealing).toBe(false);
    expect(frame.view.baccarat?.lastResult?.outcome).toBe('B');
    expect(frame.view.baccarat?.recentResults).toHaveLength(1);
    expect(frame.view.table.bestLevel).toBe(2);
  });

  it('appends newer snapshots without replacing queued cards or replaying duplicate deliveries', () => {
    const timeline = new PresentationTimeline();
    timeline.receive(baccarat(0), 0);
    const initial = baccarat(1, true);
    initial.baccarat!.cardRevealOrder = order.slice(0, 4);
    initial.baccarat!.player.cards = initial.baccarat!.player.cards.slice(0, 2);
    initial.baccarat!.banker.cards = initial.baccarat!.banker.cards.slice(0, 2);
    timeline.receive(initial, 100);
    timeline.receive(baccarat(2, true, true), 101);
    expect(timeline.receive(baccarat(2, true, true), 300).revealedCardIds.size).toBe(1);
    expect([...timeline.advance(550).revealedCardIds]).toEqual(order.slice(0, 2));
    expect(timeline.receive(initial, 600).view.revision).toBe(2);
    expect([...timeline.advance(1000).revealedCardIds]).toEqual(order.slice(0, 3));
  });

  it('initial load, reentry and hiding snap to current public cards without any replay', () => {
    const timeline = new PresentationTimeline();
    let frame = timeline.receive(baccarat(1, true, true), 0);
    expect(frame.revealedCardIds.size).toBe(6);
    expect(frame.revealing).toBe(false);
    timeline.receive(baccarat(2), 10);
    frame = timeline.receive(baccarat(3, true, true), 20);
    expect(frame.revealing).toBe(true);
    frame = timeline.snap(30);
    expect(frame.revealing).toBe(false);
    expect(frame.revealedCardIds.size).toBe(6);
    expect(timeline.receive(baccarat(4, true, true), 40).revealing).toBe(false);
  });

  it('places the blackjack hole back after initial cards and hides immediate natural payout and actions', () => {
    const timeline = new PresentationTimeline();
    timeline.receive(blackjack(0, 'betting'), 0);
    let frame = timeline.receive(blackjack(1, 'result'), 100);
    expect(frame.view.blackjack?.lastResult).toBeUndefined();
    expect(frame.view.blackjack?.legalActions).toEqual([]);
    timeline.advance(550);
    frame = timeline.advance(1000);
    expect(frame.holePlaced).toBe(false);
    frame = timeline.advance(1450);
    expect(frame.holePlaced).toBe(true);
    expect(frame.revealedCardIds.has(cards[3]!.cardId)).toBe(false);
    frame = timeline.advance(1900);
    expect(frame.revealedCardIds.has(cards[3]!.cardId)).toBe(true);
    expect(timeline.advance(2199).view.blackjack?.lastResult).toBeUndefined();
    expect(timeline.advance(2200).view.blackjack?.lastResult?.netCents).toBe(150);
  });

  it('keeps moved split cards visible and reveals only genuinely new draws', () => {
    const timeline = new PresentationTimeline();
    const initial = blackjack(1, 'playerTurn');
    timeline.receive(initial, 0); // A restored/current decision does not replay.
    const split = blackjack(2, 'playerTurn');
    split.blackjack!.cardRevealOrder = [...order.slice(0, 3), cards[4]!.cardId];
    const original = split.blackjack!.playerHands[0]!;
    split.blackjack!.playerHands = [
      { ...original, cards: [cards[0]!, cards[4]!] },
      { ...original, handId: 'hand-2', cards: [cards[2]!], active: false },
    ];
    const frame = timeline.receive(split, 100);
    expect(frame.revealedCardIds.has(cards[2]!.cardId)).toBe(true);
    expect(frame.animatedCardId).toBe(cards[4]!.cardId);
    expect(frame.holePlaced).toBe(true);
    expect(timeline.advance(240).revealing).toBe(false);
  });

  it('shows save failures immediately without publishing uncommitted card or outcome candidates', () => {
    const timeline = new PresentationTimeline();
    timeline.receive(baccarat(0), 0);
    const committed = baccarat(1, true);
    committed.baccarat!.cardRevealOrder = order.slice(0, 4);
    timeline.receive(committed, 100);
    const failed = { ...committed, viewSequence: 2, saveError: true };
    const frame = timeline.receive(failed, 110);
    expect(frame.view.saveError).toBe(true);
    expect(frame.view.baccarat?.lastResult).toBeNull();
    expect(frame.revealedCardIds.size).toBe(1);
    expect(timeline.receive({ ...committed, viewSequence: 3 }, 120).revealedCardIds.size).toBe(1);
  });

  it('computes scores exclusively from visible identities, including blackjack aces and baccarat modulo ten', () => {
    expect(visibleBlackjackScore([cards[0]!, cards[2]!], new Set([cards[0]!.cardId]))).toEqual({ total: 11, isSoft: true });
    expect(visibleBaccaratScore([cards[1]!, cards[3]!], new Set([cards[1]!.cardId]))).toBe(9);
    expect(visibleBaccaratScore([cards[1]!, cards[3]!], new Set([cards[1]!.cardId, cards[3]!.cardId]))).toBe(6);
    expect(visibleBaccaratScore(cards, new Set())).toBeNull();
  });

  it('retains a future deadline after a fractional early wake and completes on the re-armed tick', () => {
    const timeline = new PresentationTimeline();
    timeline.receive(baccarat(0), 0);
    timeline.receive(baccarat(1, true, true), 100.25);
    for (let index = 1; index < 6; index++) timeline.advance(100.25 + index * 450);
    const early = timeline.advance(2650.1);
    expect(early.revealing).toBe(true);
    expect(early.nextWakeAt).toBe(2650.25);
    const final = timeline.advance(2651.1);
    expect(final.revealing).toBe(false);
    expect(final.nextWakeAt).toBeUndefined();
  });
});

function bigwheel(sequence: number, phase: 'betting' | 'spinning' | 'result'): AppView {
  const bets = { silver: 100, gold: 0, emerald: 0, diamond: 0, crystal: 0, joker: 0, mega: 0 };
  return {
    ...baccarat(sequence), screen: 'bigwheel', baccarat: null,
    balanceCents: phase === 'result' ? 10100 : phase === 'spinning' ? 9900 : 10000,
    activeRoundGameId: phase === 'spinning' ? 'bigwheel' : null,
    bigwheel: {
      roundId: phase === 'betting' ? null : 'wheel-round', phase, pendingBets: bets, totalBetCents: 100,
      lastResult: phase === 'result' ? { roundId: 'wheel-round', outcome: 'silver', segmentIndex: 3, bets, totalBetCents: 100, returnCents: 200, netCents: 100 } : null,
      recentResults: phase === 'result' ? [{ roundId: 'wheel-round', outcome: 'silver' }] : [],
      legalActions: phase === 'result' ? ['nextRound'] : phase === 'betting' ? ['setBet', 'spin'] : [],
    },
  };
}

describe('big wheel presentation timeline', () => {
  it('withholds a fast result, wallet, records and best achievement until the same 1.8 second deadline', () => {
    const timeline = new PresentationTimeline();
    timeline.receive(bigwheel(0, 'betting'), 0);
    const result = bigwheel(1, 'result');
    result.table.bestBankrollCents = 10100;
    let frame = timeline.receive(result, 100);
    expect(frame.revealing).toBe(true);
    expect(frame.view.balanceCents).toBe(9900);
    expect(frame.view.bigwheel?.lastResult).toBeNull();
    expect(frame.view.bigwheel?.recentResults).toEqual([]);
    expect(frame.view.bigwheel?.legalActions).toEqual([]);
    expect(frame.view.table.bestBankrollCents).toBe(10000);
    expect(frame.view.canNavigate).toBe(false);
    expect(timeline.advance(1899).revealing).toBe(true);
    frame = timeline.advance(1900);
    expect(frame.revealing).toBe(false);
    expect(frame.view.balanceCents).toBe(10100);
    expect(frame.view.bigwheel?.lastResult?.segmentIndex).toBe(3);
    expect(frame.view.bigwheel?.recentResults).toHaveLength(1);
    expect(frame.view.table.bestBankrollCents).toBe(10100);
  });

  it('does not restart its deadline on settlement, duplicates, save failure or stale updates', () => {
    const timeline = new PresentationTimeline();
    timeline.receive(bigwheel(0, 'betting'), 0);
    timeline.receive(bigwheel(1, 'spinning'), 100);
    const failed = { ...bigwheel(2, 'spinning'), saveError: true };
    expect(timeline.receive(failed, 150).view.saveError).toBe(true);
    timeline.receive(bigwheel(3, 'result'), 200);
    timeline.receive(bigwheel(3, 'result'), 300);
    expect(timeline.receive(failed, 500).view.revision).toBe(3);
    expect(timeline.advance(1899.5).nextWakeAt).toBe(1900);
    expect(timeline.advance(1900).revealing).toBe(false);
  });

  it('restores and snaps public results without replay or dispatching settlement', () => {
    const timeline = new PresentationTimeline();
    expect(timeline.receive(bigwheel(0, 'result'), 0).revealing).toBe(false);
    timeline.receive(bigwheel(1, 'betting'), 10);
    expect(timeline.receive(bigwheel(2, 'spinning'), 20).revealing).toBe(true);
    expect(timeline.snap(30).revealing).toBe(false);
    expect(timeline.receive(bigwheel(3, 'result'), 40).revealing).toBe(false);
  });
});
