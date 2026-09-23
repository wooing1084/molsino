import type { AppView } from '../shared/app-contracts';
import type { CardView } from '../shared/contracts';
import { WheelMotion } from './wheel-presentation';

export { WHEEL_SPIN_MS } from './wheel-presentation';
const WHEEL_FRAME_MS = 1000 / 60;
export const CARD_INTERVAL_MS = 450;
export const CARD_FADE_MS = 140;
export const RESULT_DELAY_MS = 300;
const HOLE_PLACEMENT = 'blackjack:hole-placement';

export interface PresentationFrame {
  view: AppView;
  revealedCardIds: ReadonlySet<string>;
  animatedCardId?: string;
  holePlaced: boolean;
  revealing: boolean;
  settling: boolean;
  nextWakeAt?: number;
  wheelSegmentIndex?: number;
  /** Current unwrapped cell coordinate, independent of the masked final result. */
  wheelPosition?: number;
}

function game(view: AppView) {
  return view.screen === 'blackjack' ? view.blackjack : view.screen === 'baccarat' ? view.baccarat : null;
}

/** Presents only public game state. It never advances the engine or dispatches commands. */
export class PresentationTimeline {
  private latest?: AppView;
  private known = new Set<string>();
  private revealed = new Set<string>();
  private pending: string[] = [];
  private holePlaced = false;
  private holeQueued = false;
  private lastRevealAt = -Infinity;
  private lastCardId?: string;
  private priorTable?: AppView['table'];
  private priorHistory: NonNullable<AppView['baccarat']>['recentResults'] = [];

  private wheel = new WheelMotion();
  private wheelBalance = 0;
  private wheelHistory: NonNullable<AppView['bigwheel']>['recentResults'] = [];

  receive(view: AppView, now: number, snap = false): PresentationFrame {
    const previous = this.latest;
    if (previous && view.sessionId === previous.sessionId && view.viewSequence < previous.viewSequence) {
      return this.frame(now);
    }
    const currentGame = game(view);
    const previousGame = previous && game(previous);
    const changedScreen = !previous || previous.screen !== view.screen || previous.sessionId !== view.sessionId;
    this.latest = view;
    if (view.screen === 'bigwheel' && view.bigwheel) {
      if (snap || changedScreen || view.recovery || !view.bigwheel.roundId) return this.snap(now);
      if (view.bigwheel.roundId !== previous?.bigwheel?.roundId) {
        this.wheel.start(now);
        this.priorTable = previous?.table;
        this.wheelHistory = previous?.bigwheel?.recentResults ?? [];
        this.wheelBalance = view.bigwheel.phase === 'result'
          ? view.balanceCents - (view.bigwheel.lastResult?.returnCents ?? 0) : view.balanceCents;
      }
      if (view.bigwheel.lastResult) this.wheel.settle(view.bigwheel.lastResult.segmentIndex, now);
      return this.frame(now);
    }
    if (snap || changedScreen || view.recovery || !currentGame?.roundId) return this.snap(now);

    if (currentGame.roundId !== previousGame?.roundId) {
      this.known.clear();
      this.revealed.clear();
      this.pending = [];
      this.holePlaced = false;
      this.holeQueued = false;
      this.lastRevealAt = -Infinity;
      this.lastCardId = undefined;
      this.priorTable = previous.table;
      this.priorHistory = previous.baccarat?.recentResults ?? [];
    }

    // Metadata contains only already-public cards. Keep queued cards when newer
    // snapshots arrive, including terminal snapshots and split relocations.
    for (const [index, id] of currentGame.cardRevealOrder.entries()) {
      if (!this.known.has(id)) {
        this.known.add(id);
        this.pending.push(id);
      }
      if (view.screen === 'blackjack' && index === 2 && !this.holeQueued) {
        this.holeQueued = true;
        this.pending.push(HOLE_PLACEMENT);
      }
    }
    return this.advance(now);
  }

  snap(now: number): PresentationFrame {
    const wheelGame = this.latest!.screen === 'bigwheel' ? this.latest!.bigwheel : null;
    if (wheelGame?.phase === 'spinning') {
      this.wheel.start(now);
      this.wheelBalance = this.latest!.balanceCents;
      this.wheelHistory = wheelGame.recentResults;
    } else this.wheel.snap(wheelGame?.lastResult?.segmentIndex ?? 0);
    const currentGame = game(this.latest!);
    this.known = new Set(currentGame?.cardRevealOrder ?? []);
    this.revealed = new Set(this.known);
    this.pending = [];
    this.holePlaced = true;
    this.holeQueued = true;
    this.lastRevealAt = -Infinity;
    this.lastCardId = undefined;
    this.priorTable = this.latest!.table;
    this.priorHistory = this.latest!.baccarat?.recentResults ?? [];
    return this.frame(now);
  }

  advance(now: number): PresentationFrame {
    if (this.pending.length && now >= this.lastRevealAt + CARD_INTERVAL_MS) {
      const next = this.pending.shift()!;
      this.lastRevealAt = now;
      this.lastCardId = next === HOLE_PLACEMENT ? undefined : next;
      if (next === HOLE_PLACEMENT) this.holePlaced = true;
      else this.revealed.add(next);
    }
    return this.frame(now);
  }

  private frame(now: number): PresentationFrame {
    const latest = this.latest!;
    if (latest.screen === 'bigwheel' && latest.bigwheel) {
      const motion = this.wheel.sample(now);
      const revealing = motion.moving;
      return {
        view: revealing ? {
          ...latest, balanceCents: this.wheelBalance, canNavigate: false,
          table: this.priorTable ? { ...latest.table, bestLevel: this.priorTable.bestLevel, bestBankrollCents: this.priorTable.bestBankrollCents } : latest.table,
          bigwheel: { ...latest.bigwheel, phase: 'spinning', lastResult: null, recentResults: this.wheelHistory, legalActions: [] },
        } : latest,
        revealing, settling: revealing && latest.bigwheel.phase === 'result',
        revealedCardIds: new Set<string>(), holePlaced: false,
        wheelSegmentIndex: latest.bigwheel.lastResult?.segmentIndex, wheelPosition: motion.position,
        nextWakeAt: revealing ? Math.min(now + WHEEL_FRAME_MS, motion.completeAt ?? Infinity) : undefined,
      };
    }
    const terminal = game(latest)?.phase === 'result';
    const completeAt = this.lastRevealAt + (terminal ? RESULT_DELAY_MS : CARD_FADE_MS);
    const revealing = this.pending.length > 0 || now < completeAt;
    const animatedCardId = now < this.lastRevealAt + CARD_FADE_MS ? this.lastCardId : undefined;
    const wakes: number[] = [];
    if (this.pending.length) wakes.push(this.lastRevealAt + CARD_INTERVAL_MS);
    if (animatedCardId) wakes.push(this.lastRevealAt + CARD_FADE_MS);
    if (now < completeAt) wakes.push(completeAt);
    const view: AppView = revealing ? {
      ...latest,
      canNavigate: false,
      table: this.priorTable ? { ...latest.table, bestLevel: this.priorTable.bestLevel, bestBankrollCents: this.priorTable.bestBankrollCents } : latest.table,
      blackjack: latest.blackjack ? {
        ...latest.blackjack, lastResult: undefined, legalActions: [], insurance: undefined,
        playerHands: latest.blackjack.playerHands.map(hand => ({ ...hand, active: false })),
      } : null,
      baccarat: latest.baccarat ? {
        ...latest.baccarat, lastResult: null, legalActions: [], recentResults: this.priorHistory,
      } : null,
    } : latest;
    return {
      view, revealing, settling: revealing && terminal,
      revealedCardIds: new Set(this.revealed), animatedCardId, holePlaced: this.holePlaced,
      nextWakeAt: wakes.length ? Math.min(...wakes) : undefined,
    };
  }
}

export function visibleBlackjackScore(cards: readonly CardView[], revealed: ReadonlySet<string>) {
  let total = 0, aces = 0;
  for (const card of cards) {
    if (!revealed.has(card.cardId)) continue;
    if (card.rank === 'A') { total += 11; aces++; }
    else total += ['J', 'Q', 'K'].includes(card.rank) ? 10 : Number(card.rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, isSoft: aces > 0 };
}

export function visibleBaccaratScore(cards: readonly CardView[], revealed: ReadonlySet<string>): number | null {
  const visible = cards.filter(card => revealed.has(card.cardId));
  if (!visible.length) return null;
  return visible.reduce((sum, card) => sum + (card.rank === 'A' ? 1 : ['10', 'J', 'Q', 'K'].includes(card.rank) ? 0 : Number(card.rank)), 0) % 10;
}
