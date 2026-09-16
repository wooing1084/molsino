import type { BlackjackAPI } from '../../src/shared/contracts';

declare global {
  interface Window {
    blackjack: BlackjackAPI;
  }
}

export type {
  CardView,
  CommandResult,
  DealerView,
  GameViewState,
  HandView,
  ResizeCommand,
  ResizeEdge,
  ResizeResult,
  UserAction,
  UserCommand,
  WindowBounds,
} from '../../src/shared/contracts';
