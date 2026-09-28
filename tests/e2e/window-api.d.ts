import type { MolsinoAPI } from '../../src/shared/app-contracts';

declare global {
  interface Window {
    molsino: MolsinoAPI;
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
