import { z } from 'zod';
import type { TableView } from './table-levels';
import { baccaratActionSchema } from '../core/baccarat/core';
import type { BaccaratView } from './baccarat-view';
import { bigWheelActionSchema } from '../core/bigwheel/core';
import type { BigWheelView } from './bigwheel-view';
import { userActionSchema, type OverlayAPI, type GameViewState, type CommandError } from './contracts';
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const appActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('selectLevel'), level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]) }).strict(),
  z.object({ type: z.literal('baccarat'), action: baccaratActionSchema }).strict(),
  z.object({ type: z.literal('bigwheel'), action: bigWheelActionSchema }).strict(),
  z.object({ type: z.literal('selectGame'), gameId: z.enum(['blackjack', 'baccarat', 'bigwheel']) }).strict(),
  z.object({ type: z.literal('goToMenu') }).strict(), z.object({ type: z.literal('resetAll') }).strict(),
  z.object({ type: z.literal('retrySave') }).strict(),
  z.object({ type: z.literal('blackjack'), action: userActionSchema.refine(a => a.type !== 'resetSession' && a.type !== 'retrySave') }).strict(),
]);
export const appCommandSchema = z.object({ sessionId: z.uuid(), commandId: z.uuid(), expectedRevision: integer, action: appActionSchema }).strict();
export type AppAction = z.infer<typeof appActionSchema>;
export type BlackjackAction = Extract<AppAction, { type: 'blackjack' }>['action'];
export type AppCommand = z.infer<typeof appCommandSchema>;
export interface AppView {
  table: TableView;
  revision: number; platform: string; balanceCents: number; saveError: boolean;
  recovery?: GameViewState['recovery'];
  blackjack: GameViewState | null; baccarat: BaccaratView | null; bigwheel: BigWheelView | null;
  sessionId: string; viewSequence: number; screen: 'menu' | 'blackjack' | 'baccarat' | 'bigwheel';
  activeRoundGameId: 'blackjack' | 'baccarat' | 'bigwheel' | null; canNavigate: boolean; internalError?: string;
}
export type AppResult = { ok: true; state: AppView } | { ok: false; error: CommandError; message: string; state: AppView };
export interface MolsinoAPI extends OverlayAPI {
  getSnapshot(): Promise<AppView>;
  dispatch(command: AppCommand): Promise<AppResult>;
  onState(listener: (state: AppView) => void): () => void;
  recover(choice: 'restoreBackup' | 'startNew' | 'retryLoad'): Promise<AppView>;
}
