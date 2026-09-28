import type { Page } from 'playwright';
import type { BlackjackAction } from '../../../src/shared/app-contracts';
import { blackjackSnapshot } from './app-game';

export async function getSnapshot(page: Page) { return page.evaluate(blackjackSnapshot); }
export async function dispatch(page: Page, action: BlackjackAction, expectedRevision: number) {
  return page.evaluate(async ({ action, expectedRevision }) => {
    const snapshot = await window.molsino.getSnapshot();
    return window.molsino.dispatch({ sessionId: snapshot.sessionId, commandId: crypto.randomUUID(), expectedRevision,
      action: { type: 'blackjack', action } });
  }, { action, expectedRevision });
}
export async function dispatchExpectOk(page: Page, action: BlackjackAction, expectedRevision: number) {
  const result = await dispatch(page, action, expectedRevision);
  if (!result.ok) throw new Error(`dispatch(${action.type}) rejected: ${result.error} — ${result.message}`);
  if (!result.state.blackjack) throw new Error('No selected blackjack game');
  return result.state.blackjack;
}
