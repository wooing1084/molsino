// 현재 Blackjack 게임의 window.blackjack 호출을 감싸는 얇은 E2E 래퍼.
import type { Page } from 'playwright';
import type { CommandResult, GameViewState, UserAction } from '../window-api';

let commandSeq = 0;
function nextCommandId(): string {
  commandSeq += 1;
  return `e2e-${Date.now()}-${commandSeq}`;
}

export async function getSnapshot(page: Page): Promise<GameViewState> {
  return page.evaluate(() => window.blackjack.getSnapshot());
}

export async function dispatch(page: Page, action: UserAction, expectedRevision: number): Promise<CommandResult> {
  const commandId = nextCommandId();
  return page.evaluate(
    (command) => window.blackjack.dispatch(command),
    { commandId, expectedRevision, action },
  );
}

// 실패 시 원인을 바로 드러내는 편의 함수. 커맨드가 거부되면 던진다.
export async function dispatchExpectOk(page: Page, action: UserAction, expectedRevision: number): Promise<GameViewState> {
  const result = await dispatch(page, action, expectedRevision);
  if (!result.ok) throw new Error(`dispatch(${action.type}) rejected: ${result.error}${result.message ? ` — ${result.message}` : ''}`);
  return result.state;
}
