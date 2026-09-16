import { z } from 'zod';
import type { HandStatus, LegalAction } from '../core/game-state';
import type { Rank, Suit } from '../core/models';
import type { SettlementOutcome } from '../core/settlement';
export type { SettlementOutcome } from '../core/settlement';

export const channels = {
  snapshot: 'game:get-snapshot',
  command: 'game:command',
  state: 'game:state',
  window: 'overlay:command',
  resize: 'overlay:resize',
} as const;

const safeNonNegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const handIdSchema = z.string().min(1).max(128);

export const userActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setBet'), amountCents: safeNonNegativeInteger }).strict(),
  z.object({ type: z.literal('setBetStep'), stepCents: safeNonNegativeInteger }).strict(),
  z.object({ type: z.literal('deal') }).strict(),
  z.object({ type: z.literal('chooseInsurance'), amountCents: safeNonNegativeInteger }).strict(),
  z.object({ type: z.literal('acceptEvenMoney') }).strict(),
  z.object({ type: z.literal('keepBlackjack') }).strict(),
  z.object({ type: z.literal('hit'), handId: handIdSchema }).strict(),
  z.object({ type: z.literal('stand'), handId: handIdSchema }).strict(),
  z.object({ type: z.literal('doubleDown'), handId: handIdSchema }).strict(),
  z.object({ type: z.literal('split'), handId: handIdSchema }).strict(),
  z.object({ type: z.literal('surrender'), handId: handIdSchema }).strict(),
  z.object({ type: z.literal('nextRound') }).strict(),
  z.object({ type: z.literal('resetSession') }).strict(),
]);

export const userCommandSchema = z.object({
  commandId: z.uuid(),
  expectedRevision: safeNonNegativeInteger,
  action: userActionSchema,
}).strict();

export const windowCommandSchema = z.enum(['hide', 'quit', 'small', 'default', 'large', 'passthrough']);
export const resizeEdgeSchema = z.enum(['nw', 'ne', 'sw', 'se']);
export const resizeCommandSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('start'), edge: resizeEdgeSchema }).strict(),
  z.object({ phase: z.literal('update'), token: z.uuid() }).strict(),
  z.object({ phase: z.literal('end'), token: z.uuid() }).strict(),
  z.object({ phase: z.literal('cancel'), token: z.uuid() }).strict(),
]);

export type UserAction = z.infer<typeof userActionSchema>;
export type UserCommand = z.infer<typeof userCommandSchema>;
export type WindowCommand = z.infer<typeof windowCommandSchema>;
export type ResizeEdge = z.infer<typeof resizeEdgeSchema>;
export type ResizeCommand = z.infer<typeof resizeCommandSchema>;

export interface CardView {
  cardId: string;
  rank: Rank;
  suit: Suit;
}

export interface HandView {
  handId: string;
  cards: CardView[];
  total: number;
  isSoft: boolean;
  wagerCents: number;
  status: HandStatus;
  active: boolean;
  fromSplit: boolean;
  doubled: boolean;
}

export interface DealerView {
  cards: CardView[];
  hiddenCardCount: number;
  total?: number;
  isSoft?: boolean;
}

export interface ResultEntryView {
  componentId: string;
  outcome: SettlementOutcome;
  wagerCents: number;
  returnedCents: number;
  netCents: number;
}

export interface GameViewState {
  revision: number;
  platform: string;
  phase: 'betting' | 'insuranceDecision' | 'playerTurn' | 'dealerTurn' | 'result';
  balanceCents: number;
  pendingBetCents: number;
  betStepCents: number;
  playerHands: HandView[];
  activeHandIndex: number | null;
  dealerHand: DealerView;
  insurance?: {
    decision: 'pending' | 'declined' | 'purchased' | 'evenMoney' | 'keptBlackjack';
    wagerCents: number;
    maxWagerCents: number;
  };
  legalActions: LegalAction[];
  lastResult?: {
    roundId: string;
    netCents: number;
    entries: ResultEntryView[];
  };
}

export type CommandError = 'BUSY' | 'STALE_STATE' | 'INVALID_ACTION' | 'VALIDATION_ERROR';
export type CommandResult =
  | { ok: true; state: GameViewState }
  | { ok: false; error: CommandError; message: string; state: GameViewState };

export interface WindowBounds { x: number; y: number; width: number; height: number; }
export interface ResizeResult { token?: string; bounds: WindowBounds; }

export interface BlackjackAPI {
  getSnapshot(): Promise<GameViewState>;
  dispatch(command: UserCommand): Promise<CommandResult>;
  onState(listener: (state: GameViewState) => void): () => void;
  windowCommand(command: WindowCommand): Promise<void>;
  resize(command: ResizeCommand): Promise<ResizeResult>;
}
