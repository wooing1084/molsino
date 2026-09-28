import { z } from 'zod';
import { RANKS, SUITS, type Card } from '../models';
import type { RandomInt } from '../shoe';

export const RULE_SET = 'baccarat-8d-commission5-tie8-v1';
export const SHOE_SIZE = 416;
export const CUT_INDEX = 402;
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const targetSchema = z.enum(['P', 'B', 'T']);
export type Target = z.infer<typeof targetSchema>;
const cardSchema = z.object({ cardId: z.string().min(1), rank: z.enum(RANKS), suit: z.enum(SUITS) }).strict();
const betSchema = z.object({ target: targetSchema, amountCents: integer.min(100) }).strict();
export const baccaratActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setBet'), target: targetSchema, amountCents: integer.min(100) }).strict(),
  z.object({ type: z.literal('deal') }).strict(), z.object({ type: z.literal('nextRound') }).strict(),
]);
export type BaccaratAction = z.infer<typeof baccaratActionSchema>;
const resultSchema = z.object({
  roundId: z.string().min(1), number: integer.min(1), outcome: targetSchema, bet: betSchema,
  returnCents: integer, netCents: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  settlementKey: z.object({ sessionId: z.uuid(), gameId: z.literal('baccarat'), roundId: z.string().min(1), componentId: z.literal('main') }).strict(),
}).strict();
export const baccaratStateSchema = z.object({
  ruleSetId: z.literal(RULE_SET),
  shoe: z.object({ cards: z.array(cardSchema).length(SHOE_SIZE), nextIndex: integer.max(SHOE_SIZE), burnCount: integer.min(2).max(11) }).strict(),
  pendingBet: betSchema, phase: z.enum(['betting', 'dealing', 'result']), settledRoundCount: integer,
  round: z.object({ roundId: z.string().min(1), number: integer.min(1), bet: betSchema,
    startIndex: integer, stage: z.enum(['initial', 'playerThird', 'bankerThird', 'settle', 'settled']),
    player: z.array(cardSchema).max(3), banker: z.array(cardSchema).max(3),
  }).strict().nullable(),
  lastResult: resultSchema.nullable(),
  recentResults: z.array(z.object({ roundId: z.string().min(1), number: integer.min(1), outcome: targetSchema }).strict()).max(20),
}).strict();
export type BaccaratState = z.infer<typeof baccaratStateSchema>;
export type BaccaratShoe = BaccaratState['shoe'];
export interface BaccaratEnvironment { createShoe(): BaccaratShoe; nextId(): string; }

export function cardValue(card: Card): number { return card.rank === 'A' ? 1 : ['10', 'J', 'Q', 'K'].includes(card.rank) ? 0 : Number(card.rank); }
export function score(cards: readonly Card[]): number { return cards.reduce((n, c) => n + cardValue(c), 0) % 10; }
export function bankerDraws(total: number, playerThird?: number): boolean {
  if (playerThird === undefined) return total <= 5;
  return total <= 2 || total === 3 && playerThird !== 8 || total === 4 && playerThird >= 2 && playerThird <= 7
    || total === 5 && playerThird >= 4 && playerThird <= 7 || total === 6 && (playerThird === 6 || playerThird === 7);
}
export function createCards(): Card[] {
  return Array.from({ length: 8 }, (_, deck) => SUITS.flatMap(suit => RANKS.map(rank => ({ cardId: `bac-${deck}-${suit}-${rank}`, rank, suit })))).flat();
}
export function burnShoe(cards: Card[]): BaccaratShoe {
  const value = cardValue(cards[0]!);
  const burnCount = 1 + (value === 0 ? 10 : value);
  return { cards, nextIndex: burnCount, burnCount };
}
export function createShoe(randomInt: RandomInt): BaccaratShoe {
  const cards = createCards();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid random index');
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return burnShoe(cards);
}
function safe(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('안전하게 계산할 수 있는 금액을 초과했습니다.');
  return n;
}
export function payout(target: Target, outcome: Target, wager: number): number {
  safe(wager);
  if (outcome === 'T' && target !== 'T') return wager;
  if (target !== outcome) return 0;
  if (target === 'P') return safe(wager * 2);
  if (target === 'T') return safe(wager * 9);
  const product = safe(wager * 95);
  return safe(wager + Math.floor(product / 100) + (product % 100 >= 50 ? 1 : 0));
}
export function checkBet(bet: BaccaratState['pendingBet'], balance: number): void {
  safe(balance);
  if (!Number.isSafeInteger(bet.amountCents) || bet.amountCents < 100 || bet.amountCents > balance) throw new Error('베팅은 $1 이상, 현재 잔액 이하여야 합니다.');
  safe(balance - bet.amountCents + payout(bet.target, bet.target, bet.amountCents));
}
export function createBaccarat(shoe: BaccaratShoe): BaccaratState {
  return { ruleSetId: RULE_SET, shoe, pendingBet: { target: 'P', amountCents: 100 }, phase: 'betting', round: null,
    settledRoundCount: 0, lastResult: null, recentResults: [] };
}
function draw(s: BaccaratState): Card {
  const card = s.shoe.cards[s.shoe.nextIndex++];
  if (!card) throw new Error('Baccarat shoe exhausted');
  return { ...card };
}
function advanceCards(s: BaccaratState): void {
  const r = s.round!;
  if (r.stage === 'initial') {
    r.player.push(draw(s)); r.banker.push(draw(s)); r.player.push(draw(s)); r.banker.push(draw(s));
    r.stage = score(r.player) >= 8 || score(r.banker) >= 8 ? 'settle' : 'playerThird';
  } else if (r.stage === 'playerThird') {
    if (score(r.player) <= 5) r.player.push(draw(s));
    r.stage = 'bankerThird';
  } else if (r.stage === 'bankerThird') {
    if (bankerDraws(score(r.banker), r.player[2] ? cardValue(r.player[2]) : undefined)) r.banker.push(draw(s));
    r.stage = 'settle';
  } else throw new Error('Invalid baccarat stage');
}
function outcome(s: BaccaratState): Target {
  const p = score(s.round!.player), b = score(s.round!.banker);
  return p > b ? 'P' : p < b ? 'B' : 'T';
}
export function transitionBaccarat(state: BaccaratState, balance: number, action: BaccaratAction | { type: 'advanceBaccarat' }, env: BaccaratEnvironment, sessionId: string): { game: BaccaratState; balance: number; active: boolean } {
  const s = structuredClone(state);
  if (action.type === 'setBet') {
    if (s.phase !== 'betting') throw new Error('베팅 단계가 아닙니다.');
    const bet = { target: action.target, amountCents: action.amountCents };
    checkBet(bet, balance); s.pendingBet = bet;
  } else if (action.type === 'deal') {
    if (s.phase !== 'betting') throw new Error('이미 진행 중인 판입니다.');
    checkBet(s.pendingBet, balance);
    if (s.shoe.nextIndex >= CUT_INDEX || SHOE_SIZE - s.shoe.nextIndex < 6) s.shoe = env.createShoe();
    s.round = { roundId: env.nextId(), number: safe(s.settledRoundCount + 1), bet: { ...s.pendingBet },
      startIndex: s.shoe.nextIndex, stage: 'initial', player: [], banker: [] };
    balance -= s.pendingBet.amountCents; s.phase = 'dealing';
  } else if (action.type === 'nextRound') {
    if (s.phase !== 'result') throw new Error('결과 단계가 아닙니다.');
    s.phase = 'betting'; s.round = null;
    s.pendingBet.amountCents = Math.max(100, Math.min(s.pendingBet.amountCents, balance));
  } else {
    if (s.phase !== 'dealing' || !s.round) throw new Error('자동 진행 단계가 아닙니다.');
    if (s.round.stage === 'settle') {
      const r = s.round, winner = outcome(s);
      const returnCents = payout(r.bet.target, winner, r.bet.amountCents);
      balance = safe(balance + returnCents);
      s.lastResult = { roundId: r.roundId, number: r.number, outcome: winner, bet: { ...r.bet }, returnCents,
        netCents: returnCents - r.bet.amountCents, settlementKey: { sessionId, gameId: 'baccarat', roundId: r.roundId, componentId: 'main' } };
      s.settledRoundCount = r.number;
      s.recentResults = [...s.recentResults, { roundId: r.roundId, number: r.number, outcome: winner }].slice(-20);
      r.stage = 'settled'; s.phase = 'result';
    } else advanceCards(s);
  }
  return { game: s, balance, active: s.phase === 'dealing' };
}

/** Validate persisted evidence, including a deterministic replay of the current round's consumed prefix. */
export function validateBaccarat(s: BaccaratState, sessionId: string, balance: number): void {
  const fail = () => { throw new Error('Invalid baccarat state'); };
  const { shoe, round: r } = s;
  if (new Set(shoe.cards.map(c => c.cardId)).size !== SHOE_SIZE) fail();
  for (const suit of SUITS) for (const rank of RANKS) if (shoe.cards.filter(c => c.suit === suit && c.rank === rank).length !== 8) fail();
  if (shoe.burnCount !== 1 + (cardValue(shoe.cards[0]!) || 10) || shoe.nextIndex < shoe.burnCount) fail();
  if (s.recentResults.length !== Math.min(20, s.settledRoundCount) || new Set(s.recentResults.map(r => r.roundId)).size !== s.recentResults.length) fail();
  s.recentResults.forEach((entry, i) => { if (entry.number !== s.settledRoundCount - s.recentResults.length + i + 1) fail(); });
  const last = s.lastResult, recent = s.recentResults.at(-1);
  if (Boolean(last) !== (s.settledRoundCount > 0)) fail();
  if (last) {
    if (last.number !== s.settledRoundCount || last.roundId !== recent?.roundId || last.outcome !== recent?.outcome
      || last.returnCents !== payout(last.bet.target, last.outcome, last.bet.amountCents) || last.netCents !== last.returnCents - last.bet.amountCents
      || last.settlementKey.sessionId !== sessionId || last.settlementKey.roundId !== last.roundId) fail();
  }
  if (s.phase === 'betting') { if (r) fail(); return; }
  if (!r) return fail();
  if (r.bet.target !== s.pendingBet.target || r.bet.amountCents !== s.pendingBet.amountCents
    || r.startIndex < shoe.burnCount || r.startIndex >= CUT_INDEX || r.startIndex + 6 > SHOE_SIZE) fail();
  const replay = structuredClone(s);
  replay.shoe.nextIndex = r.startIndex;
  replay.round = { ...r, stage: 'initial', player: [], banker: [] };
  const targetStage = r.stage === 'settled' ? 'settle' : r.stage;
  for (let i = 0; replay.round.stage !== targetStage && i < 4; i++) {
    if (replay.round.stage === 'settle') return fail();
    advanceCards(replay);
  }
  if (replay.round.stage !== targetStage || replay.shoe.nextIndex !== shoe.nextIndex
    || JSON.stringify(replay.round.player) !== JSON.stringify(r.player) || JSON.stringify(replay.round.banker) !== JSON.stringify(r.banker)) fail();
  if (s.phase === 'result') {
    if (r.stage !== 'settled' || last?.roundId !== r.roundId || r.number !== s.settledRoundCount || last?.outcome !== outcome(s)
      || last.bet.target !== r.bet.target || last.bet.amountCents !== r.bet.amountCents) fail();
  } else {
    if (r.stage === 'settled' || r.number !== s.settledRoundCount + 1 || s.recentResults.some(e => e.roundId === r.roundId)) fail();
    // A restored round must still be capable of its maximum payout.
    safe(balance + payout(r.bet.target, r.bet.target, r.bet.amountCents));
  }
}
