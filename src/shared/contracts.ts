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
  overlayState: 'overlay:get-state',
  overlayStateChanged: 'overlay:state',
  opacity: 'overlay:set-opacity',
  opacityPopover: 'overlay:opacity-popover',
  recovery: 'game:recovery',
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
  z.object({ type: z.literal('retrySave') }).strict(),
]);

export const userCommandSchema = z.object({
  commandId: z.uuid(),
  expectedRevision: safeNonNegativeInteger,
  action: userActionSchema,
}).strict();

export const windowCommandSchema = z.enum(['hide', 'quit', 'small', 'default', 'large', 'passthrough', 'collapse', 'expand']);
export const opacityPercentSchema = z.number().int().min(20).max(100).refine(value => value % 5 === 0);
const anchorSchema = z.object({
  x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(),
  width: z.number().finite().positive().max(100), height: z.number().finite().positive().max(100),
}).strict();
export const opacityPopoverCommandSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('show'), anchor: anchorSchema }).strict(),
  z.object({ phase: z.literal('keep') }).strict(),
  z.object({ phase: z.literal('hide') }).strict(),
]);
export const resizeEdgeSchema = z.enum(['nw', 'ne', 'sw', 'se']);
export const resizeCommandSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('start'), edge: resizeEdgeSchema }).strict(),
  z.object({ phase: z.literal('update'), token: z.uuid() }).strict(),
  z.object({ phase: z.literal('end'), token: z.uuid() }).strict(),
  z.object({ phase: z.literal('cancel'), token: z.uuid() }).strict(),
]);

export type UserAction = z.infer<typeof userActionSchema>;
export const recoveryChoiceSchema = z.enum(['restoreBackup', 'startNew']);
export type RecoveryChoice = z.infer<typeof recoveryChoiceSchema>;
export type UserCommand = z.infer<typeof userCommandSchema>;
export type WindowCommand = z.infer<typeof windowCommandSchema>;
export type OverlayVisibility = 'expanded' | 'collapsed' | 'hidden';
export interface OverlayViewState { revision: number; visibility: OverlayVisibility; opacityPercent: number; opacityPopoverVisible: boolean; }
export type OpacityPopoverCommand = z.infer<typeof opacityPopoverCommandSchema>;
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
  phase: 'betting' | 'insuranceDecision' | 'playerTurn' | 'dealerTurn' | 'result' | 'recovery';
  recovery?: { issue: 'corrupt' | 'futureSchema'; backupAvailable: boolean };
  saveError?: boolean;
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

export type CommandError = 'BUSY' | 'STALE_STATE' | 'INVALID_ACTION' | 'VALIDATION_ERROR' | 'SAVE_FAILED' | 'RECOVERY_REQUIRED';
export type CommandResult =
  | { ok: true; state: GameViewState }
  | { ok: false; error: CommandError; message: string; state: GameViewState };

export interface WindowBounds { x: number; y: number; width: number; height: number; }
export interface ResizeResult { token?: string; bounds: WindowBounds; }

export interface BlackjackAPI {
  getSnapshot(): Promise<GameViewState>;
  dispatch(command: UserCommand): Promise<CommandResult>;
  recover(choice: RecoveryChoice): Promise<GameViewState>;
  onState(listener: (state: GameViewState) => void): () => void;
  windowCommand(command: WindowCommand): Promise<void>;
  getOverlayState(): Promise<OverlayViewState>;
  onOverlayState(listener: (state: OverlayViewState) => void): () => void;
  setOpacity(percent: number): Promise<OverlayViewState>;
  opacityPopover(command: OpacityPopoverCommand): Promise<void>;
  resize(command: ResizeCommand): Promise<ResizeResult>;
}
