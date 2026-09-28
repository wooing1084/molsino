import type { Page } from 'playwright';
import type { AppAction, AppCommand } from '../../../src/shared/app-contracts';

export async function appSnapshot(page: Page) { return page.evaluate(() => window.molsino.getSnapshot()); }
export async function appCommand(page: Page, action: AppAction) {
  return page.evaluate(async action => {
    const state = await window.molsino.getSnapshot();
    return window.molsino.dispatch({ sessionId: state.sessionId, commandId: crypto.randomUUID(), expectedRevision: state.revision, action });
  }, action);
}
export async function sendCommand(page: Page, command: AppCommand) { return page.evaluate(c => window.molsino.dispatch(c), command); }
// Serializable browser callback used by the existing blackjack assertions.
export async function blackjackSnapshot() {
  const s = await window.molsino.getSnapshot();
  return { ...s, ...s.blackjack!, phase: s.recovery ? 'recovery' as const : s.blackjack?.phase ?? 'betting' as const };
}
