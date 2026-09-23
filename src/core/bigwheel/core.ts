import { z } from 'zod';

export const BIG_WHEEL_SYMBOLS = ['silver', 'gold', 'emerald', 'diamond', 'crystal', 'joker', 'mega'] as const;
export type BigWheelSymbol = typeof BIG_WHEEL_SYMBOLS[number];
export const BIG_WHEEL_RULES = {
  silver: { name: '실버', segments: 24, payout: 1 }, gold: { name: '골드', segments: 15, payout: 2 },
  emerald: { name: '에메랄드', segments: 7, payout: 5 }, diamond: { name: '다이아몬드', segments: 4, payout: 10 },
  crystal: { name: '크리스탈', segments: 2, payout: 20 }, joker: { name: '조커', segments: 1, payout: 40 },
  mega: { name: '메가', segments: 1, payout: 40 },
} as const;
// Display order is an app convention; the published casino table specifies counts, not physical ordering.
export const BIG_WHEEL_SEGMENTS: readonly BigWheelSymbol[] = BIG_WHEEL_SYMBOLS.flatMap(target => Array<BigWheelSymbol>(BIG_WHEEL_RULES[target].segments).fill(target));
export const BIG_WHEEL_RULE_SET = 'bigwheel-kl-54-v1';
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const symbolSchema = z.enum(BIG_WHEEL_SYMBOLS);
const betsSchema = z.object({ silver: integer, gold: integer, emerald: integer, diamond: integer, crystal: integer, joker: integer, mega: integer }).strict();
export type BigWheelBets = z.infer<typeof betsSchema>;
export const bigWheelActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setBet'), target: symbolSchema, amountCents: integer }).strict(),
  z.object({ type: z.literal('spin') }).strict(), z.object({ type: z.literal('nextRound') }).strict(),
]);
export type BigWheelAction = z.infer<typeof bigWheelActionSchema>;
const roundFields = { roundId: z.string().min(1), number: integer.min(1), bets: betsSchema, totalBetCents: integer.min(1), segmentIndex: integer.max(53) };
const resultSchema = z.object({ ...roundFields, outcome: symbolSchema, returnCents: integer,
  netCents: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  settlementKey: z.object({ sessionId: z.uuid(), gameId: z.literal('bigwheel'), roundId: z.string().min(1), componentId: z.literal('main') }).strict(),
}).strict();
export const bigWheelStateSchema = z.object({
  ruleSetId: z.literal(BIG_WHEEL_RULE_SET), pendingBets: betsSchema, phase: z.enum(['betting', 'spinning', 'result']),
  round: z.object({ ...roundFields, settled: z.boolean() }).strict().nullable(), lastResult: resultSchema.nullable(),
  settledRoundCount: integer,
  recentResults: z.array(z.object({ roundId: z.string().min(1), number: integer.min(1), outcome: symbolSchema }).strict()).max(20),
}).strict();
export type BigWheelState = z.infer<typeof bigWheelStateSchema>;
export interface BigWheelEnvironment { nextId(): string; nextSegmentIndex(): number; }
function safe(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('안전하게 계산할 수 있는 금액을 초과했습니다.');
  return value;
}
export function emptyBigWheelBets(): BigWheelBets { return { silver: 0, gold: 0, emerald: 0, diamond: 0, crystal: 0, joker: 0, mega: 0 }; }
export function totalBigWheelBet(bets: BigWheelBets): number { return BIG_WHEEL_SYMBOLS.reduce((sum, target) => safe(sum + safe(bets[target])), 0); }
export function bigWheelPayout(bets: BigWheelBets, outcome: BigWheelSymbol): number { return safe(safe(bets[outcome]) * (BIG_WHEEL_RULES[outcome].payout + 1)); }
export function checkBigWheelBet(bets: BigWheelBets, balance: number): void {
  const total = totalBigWheelBet(bets); safe(balance);
  if (total < 1 || total > balance) throw new Error('베팅 합계는 1센트 이상, 현재 잔액 이하여야 합니다.');
  for (const outcome of BIG_WHEEL_SYMBOLS) safe(balance - total + bigWheelPayout(bets, outcome));
}
export function createBigWheel(): BigWheelState {
  return { ruleSetId: BIG_WHEEL_RULE_SET, pendingBets: { ...emptyBigWheelBets(), silver: 100 }, phase: 'betting', round: null,
    lastResult: null, settledRoundCount: 0, recentResults: [] };
}
export function transitionBigWheel(state: BigWheelState, balance: number, action: BigWheelAction | { type: 'advanceBigWheel' }, env: BigWheelEnvironment, sessionId: string): { game: BigWheelState; balance: number; active: boolean } {
  const s = structuredClone(state); safe(balance);
  if (action.type === 'setBet') {
    if (s.phase !== 'betting') throw new Error('베팅 단계가 아닙니다.');
    bigWheelActionSchema.parse(action);
    s.pendingBets[action.target] = action.amountCents;
    if (totalBigWheelBet(s.pendingBets) > balance) throw new Error('잔액이 부족합니다.');
  } else if (action.type === 'spin') {
    if (s.phase !== 'betting') throw new Error('이미 진행 중인 판입니다.');
    checkBigWheelBet(s.pendingBets, balance);
    const segmentIndex = env.nextSegmentIndex();
    if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= BIG_WHEEL_SEGMENTS.length) throw new Error('Invalid wheel segment');
    const totalBetCents = totalBigWheelBet(s.pendingBets);
    s.round = { roundId: env.nextId(), number: safe(s.settledRoundCount + 1), bets: { ...s.pendingBets }, totalBetCents, segmentIndex, settled: false };
    balance -= totalBetCents; s.phase = 'spinning';
  } else if (action.type === 'nextRound') {
    if (s.phase !== 'result') throw new Error('결과 단계가 아닙니다.');
    s.phase = 'betting'; s.round = null;
  } else {
    if (s.phase !== 'spinning' || !s.round || s.round.settled) throw new Error('자동 진행 단계가 아닙니다.');
    const r = s.round, outcome = BIG_WHEEL_SEGMENTS[r.segmentIndex]!;
    const returnCents = bigWheelPayout(r.bets, outcome);
    balance = safe(balance + returnCents);
    s.lastResult = { roundId: r.roundId, number: r.number, bets: { ...r.bets }, totalBetCents: r.totalBetCents, segmentIndex: r.segmentIndex,
      outcome, returnCents, netCents: returnCents - r.totalBetCents,
      settlementKey: { sessionId, gameId: 'bigwheel', roundId: r.roundId, componentId: 'main' } };
    s.settledRoundCount = r.number;
    s.recentResults = [...s.recentResults, { roundId: r.roundId, number: r.number, outcome }].slice(-20);
    r.settled = true; s.phase = 'result';
  }
  return { game: s, balance, active: s.phase === 'spinning' };
}
const sameBets = (a: BigWheelBets, b: BigWheelBets) => BIG_WHEEL_SYMBOLS.every(target => a[target] === b[target]);
export function validateBigWheel(state: BigWheelState, sessionId: string, balance: number): void {
  const s = bigWheelStateSchema.parse(state), r = s.round, last = s.lastResult;
  const fail = (): never => { throw new Error('Invalid big wheel state'); };
  safe(balance); totalBigWheelBet(s.pendingBets);
  if (BIG_WHEEL_SEGMENTS.length !== 54) fail();
  if (s.recentResults.length !== Math.min(20, s.settledRoundCount) || new Set(s.recentResults.map(entry => entry.roundId)).size !== s.recentResults.length) fail();
  s.recentResults.forEach((entry, index) => { if (entry.number !== s.settledRoundCount - s.recentResults.length + index + 1) fail(); });
  if (Boolean(last) !== (s.settledRoundCount > 0)) fail();
  if (last) {
    const recent = s.recentResults.at(-1);
    if (last.number !== s.settledRoundCount || last.roundId !== recent?.roundId || last.outcome !== recent.outcome
      || last.totalBetCents !== totalBigWheelBet(last.bets) || BIG_WHEEL_SEGMENTS[last.segmentIndex] !== last.outcome
      || last.returnCents !== bigWheelPayout(last.bets, last.outcome) || last.netCents !== last.returnCents - last.totalBetCents
      || last.settlementKey.sessionId !== sessionId || last.settlementKey.roundId !== last.roundId) fail();
  }
  if (s.phase === 'betting') { if (r) fail(); return; }
  if (!r) return fail();
  if (r.totalBetCents !== totalBigWheelBet(r.bets) || !sameBets(r.bets, s.pendingBets)) fail();
  if (s.phase === 'result') {
    if (!r.settled || !last || r.number !== s.settledRoundCount || last.roundId !== r.roundId || last.segmentIndex !== r.segmentIndex
      || last.totalBetCents !== r.totalBetCents || !sameBets(last.bets, r.bets)) fail();
  } else {
    if (r.settled || r.number !== s.settledRoundCount + 1 || s.recentResults.some(entry => entry.roundId === r.roundId)) fail();
    for (const outcome of BIG_WHEEL_SYMBOLS) safe(balance + bigWheelPayout(r.bets, outcome));
  }
}
