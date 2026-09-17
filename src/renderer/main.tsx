import { StrictMode, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { CardView, GameViewState, OverlayViewState, SettlementOutcome, UserAction } from '../shared/contracts';
import './styles.css';

const usd = (value: number) => `$${(value / 100).toFixed(2)}`;
const signedUsd = (value: number) => `${value >= 0 ? '+' : '−'}${usd(Math.abs(value))}`;
const suitSymbol: Record<CardView['suit'], string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const outcomeLabel: Record<SettlementOutcome, string> = {
  win: '승', loss: '패', push: '무', blackjack: 'BJ', bust: '버스트', surrender: '서렌더',
  'insurance-win': '보험 승', 'insurance-loss': '보험 패', 'even-money': '이븐',
};

const resizeHandles = [
  { edge: 'nw', label: '왼쪽 위 모서리로 창 크기 조절' },
  { edge: 'ne', label: '오른쪽 위 모서리로 창 크기 조절' },
  { edge: 'sw', label: '왼쪽 아래 모서리로 창 크기 조절' },
  { edge: 'se', label: '오른쪽 아래 모서리로 창 크기 조절' },
] as const;

type ResizeEdge = (typeof resizeHandles)[number]['edge'];
type FinishPhase = 'end' | 'cancel';

interface ResizeGesture {
  pointerId: number;
  target: HTMLElement;
  token?: string;
  pendingUpdate: boolean;
  updateInFlight: boolean;
  finishPhase?: FinishPhase;
  detached: boolean;
  remoteFinished: boolean;
  lastUpdateAt: number;
  updateTimer?: number;
}

function newerState(current: GameViewState | undefined, incoming: GameViewState): GameViewState {
  if (!current || incoming.revision > current.revision) return incoming;
  if (incoming.revision < current.revision) return current;
  // Recovery and save failure can change without incrementing the committed revision.
  if (current.phase === 'recovery' && incoming.phase !== 'recovery') return incoming;
  if (current.phase !== 'recovery' && incoming.phase === 'recovery') return current;
  return !current.saveError && incoming.saveError ? incoming : current;
}

function App() {
  const [state, setState] = useState<GameViewState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(false);
  const [overlayView, setOverlayView] = useState<OverlayViewState>({ revision: 0, visibility: 'expanded', opacityPercent: 65, opacityPopoverVisible: false });
  const [resizingEdge, setResizingEdge] = useState<ResizeEdge>();
  const resizeGesture = useRef<ResizeGesture | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const applyState = (nextState: GameViewState) => {
      if (active) setState(current => newerState(current, nextState));
    };
    const unsubscribe = window.blackjack.onState(applyState);
    void window.blackjack.getSnapshot().then(applyState).catch(() => {
      if (active) setError('앱 연결 실패 · 다시 실행해 주세요');
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const applyOverlay = (next: OverlayViewState) => {
      setOverlayView(current => next.revision >= current.revision ? next : current);
    };
    const unsubscribe = window.blackjack.onOverlayState(applyOverlay);
    void window.blackjack.getOverlayState().then(applyOverlay).catch(() => setError('창 설정을 불러올 수 없습니다.'));
    return unsubscribe;
  }, []);

  function showResizeError(): void {
    if (document.visibilityState !== 'hidden') setError('창 크기를 조절할 수 없습니다.');
  }

  function releaseCapture(gesture: ResizeGesture): void {
    try {
      if (gesture.target.hasPointerCapture(gesture.pointerId)) gesture.target.releasePointerCapture(gesture.pointerId);
    } catch {
      // Capture may already have been released by the browser after pointerup/cancel.
    }
  }

  function detachGesture(gesture: ResizeGesture): void {
    if (gesture.detached) return;
    gesture.detached = true;
    setResizingEdge(undefined);
    releaseCapture(gesture);
  }

  function completeRemoteGesture(gesture: ResizeGesture): void {
    gesture.remoteFinished = true;
    if (gesture.updateTimer !== undefined) window.clearTimeout(gesture.updateTimer);
    if (resizeGesture.current === gesture) resizeGesture.current = undefined;
  }

  function finishRemoteGesture(gesture: ResizeGesture): void {
    if (!gesture.token || !gesture.finishPhase || gesture.remoteFinished) return;
    gesture.remoteFinished = true;
    if (gesture.updateTimer !== undefined) window.clearTimeout(gesture.updateTimer);
    void window.blackjack.resize({ phase: gesture.finishPhase, token: gesture.token })
      .catch(showResizeError)
      .finally(() => completeRemoteGesture(gesture));
  }

  function pumpResizeUpdate(gesture: ResizeGesture): void {
    if (!gesture.token || gesture.updateInFlight || gesture.remoteFinished) return;

    if (gesture.finishPhase === 'cancel') {
      gesture.pendingUpdate = false;
      finishRemoteGesture(gesture);
      return;
    }

    if (gesture.pendingUpdate) {
      const elapsed = performance.now() - gesture.lastUpdateAt;
      const delay = gesture.finishPhase === 'end' ? 0 : Math.max(0, 33 - elapsed);
      if (delay > 0) {
        if (gesture.updateTimer === undefined) {
          gesture.updateTimer = window.setTimeout(() => {
            gesture.updateTimer = undefined;
            pumpResizeUpdate(gesture);
          }, delay);
        }
        return;
      }

      gesture.pendingUpdate = false;
      gesture.updateInFlight = true;
      gesture.lastUpdateAt = performance.now();
      void window.blackjack.resize({ phase: 'update', token: gesture.token })
        .catch(() => {
          gesture.finishPhase = 'cancel';
          detachGesture(gesture);
          showResizeError();
        })
        .finally(() => {
          gesture.updateInFlight = false;
          pumpResizeUpdate(gesture);
        });
      return;
    }

    if (gesture.finishPhase === 'end') finishRemoteGesture(gesture);
  }

  function requestResizeFinish(gesture: ResizeGesture, phase: FinishPhase): void {
    if (gesture.remoteFinished) return;
    if (phase === 'cancel' || !gesture.finishPhase) gesture.finishPhase = phase;
    if (phase === 'end') gesture.pendingUpdate = true;
    else gesture.pendingUpdate = false;
    if (gesture.updateTimer !== undefined) {
      window.clearTimeout(gesture.updateTimer);
      gesture.updateTimer = undefined;
    }
    detachGesture(gesture);
    pumpResizeUpdate(gesture);
  }

  function beginResize(event: ReactPointerEvent<HTMLElement>, edge: ResizeEdge): void {
    if (!event.isPrimary || event.button !== 0 || resizeGesture.current) return;
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget;
    const gesture: ResizeGesture = {
      pointerId: event.pointerId,
      target,
      pendingUpdate: false,
      updateInFlight: false,
      detached: false,
      remoteFinished: false,
      lastUpdateAt: 0,
    };
    resizeGesture.current = gesture;
    setResizingEdge(edge);

    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      detachGesture(gesture);
      completeRemoteGesture(gesture);
      showResizeError();
      return;
    }

    void window.blackjack.resize({ phase: 'start', edge })
      .then(result => {
        if (!result.token) throw new Error('Resize start did not return a token');
        gesture.token = result.token;
        pumpResizeUpdate(gesture);
      })
      .catch(() => {
        detachGesture(gesture);
        completeRemoteGesture(gesture);
        showResizeError();
      });
  }

  function moveResize(event: ReactPointerEvent<HTMLElement>): void {
    const gesture = resizeGesture.current;
    if (!gesture || gesture.detached || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    if ((event.buttons & 1) === 0) {
      requestResizeFinish(gesture, 'end');
      return;
    }
    gesture.pendingUpdate = true;
    pumpResizeUpdate(gesture);
  }

  function endResize(event: ReactPointerEvent<HTMLElement>): void {
    const gesture = resizeGesture.current;
    if (!gesture || gesture.detached || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    requestResizeFinish(gesture, 'end');
  }

  function cancelResize(event: ReactPointerEvent<HTMLElement>): void {
    const gesture = resizeGesture.current;
    if (!gesture || gesture.detached || gesture.pointerId !== event.pointerId) return;
    requestResizeFinish(gesture, 'cancel');
  }

  useEffect(() => {
    const cancelForPageHide = () => {
      const gesture = resizeGesture.current;
      if (!gesture || gesture.remoteFinished) return;
      gesture.finishPhase = 'cancel';
      gesture.pendingUpdate = false;
      detachGesture(gesture);
      pumpResizeUpdate(gesture);
    };
    window.addEventListener('pagehide', cancelForPageHide);
    return () => {
      window.removeEventListener('pagehide', cancelForPageHide);
      cancelForPageHide();
    };
  }, []);

  async function runAction(action: UserAction): Promise<void> {
    if (!state || busy) return;
    setBusy(true);
    try {
      const result = await window.blackjack.dispatch({
        commandId: crypto.randomUUID(),
        expectedRevision: state.revision,
        action,
      });
      setState(current => newerState(current, result.state));
      setError(result.ok ? '' : result.message);
    } catch {
      setError('게임 명령을 처리할 수 없습니다.');
    }
    finally { setBusy(false); }
  }

  async function recover(choice: 'restoreBackup' | 'startNew'): Promise<void> {
    setBusy(true);
    try {
      const recovered = await window.blackjack.recover(choice);
      setState(current => newerState(current, recovered));
      setError('');
    } catch { setError('저장 복구에 실패했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }

  function changeBet(delta: number): void {
    if (!state) return;
    const maximum = Math.min(50_000, Math.floor(state.balanceCents / 100) * 100);
    const amountCents = Math.max(100, Math.min(maximum, state.pendingBetCents + delta));
    void runAction({ type: 'setBet', amountCents });
  }

  function showOpacityPopover(target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    void window.blackjack.opacityPopover({ phase: 'show', anchor: {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    } });
  }

  const activeHand = state?.playerHands.find(hand => hand.active);
  const can = (action: GameViewState['legalActions'][number]) => state?.legalActions.includes(action) ?? false;
  const controls = !state ? null : state.phase === 'recovery' ? <>
    {state.recovery?.backupAvailable && <button className="wide" disabled={busy} onClick={() => void recover('restoreBackup')}>백업 복구</button>}
    <button className="wide" disabled={busy} onClick={() => void recover('startNew')}>새 게임 시작</button>
  </> : state.saveError || error.includes('저장에 실패') ? <button className="wide" disabled={busy} onClick={() => void runAction({ type: 'retrySave' })}>저장 재시도</button>
    : state.phase === 'betting' ? state.balanceCents < 100
    ? <button className="wide" disabled={busy} onClick={() => void runAction({ type: 'resetSession' })}>새 게임</button>
    : <>
      <span>BET</span>
      <button aria-label="베팅 줄이기" disabled={busy || state.pendingBetCents <= 100} onClick={() => changeBet(-state.betStepCents)}>−</button>
      <output>{usd(state.pendingBetCents)}</output>
      <button aria-label="베팅 올리기" disabled={busy || state.pendingBetCents >= Math.min(50_000, Math.floor(state.balanceCents / 100) * 100)} onClick={() => changeBet(state.betStepCents)}>+</button>
      <button aria-label="딜" disabled={busy || !can('deal')} onClick={() => void runAction({ type: 'deal' })}>딜</button>
    </>
    : state.phase === 'insuranceDecision' ? can('acceptEvenMoney')
      ? <>
        <button className="wide" disabled={busy} onClick={() => void runAction({ type: 'acceptEvenMoney' })}>이븐 머니</button>
        <button className="wide" disabled={busy} onClick={() => void runAction({ type: 'keepBlackjack' })}>BJ 유지</button>
      </>
      : <>
        <button className="wide" disabled={busy || !state.insurance || state.insurance.maxWagerCents < 50} onClick={() => void runAction({ type: 'chooseInsurance', amountCents: state.insurance?.maxWagerCents ?? 0 })}>보험 {usd(state.insurance?.maxWagerCents ?? 0)}</button>
        <button className="wide" disabled={busy} onClick={() => void runAction({ type: 'chooseInsurance', amountCents: 0 })}>안 함</button>
      </>
    : state.phase === 'playerTurn' && activeHand ? <>
      <button disabled={busy || !can('hit')} onClick={() => void runAction({ type: 'hit', handId: activeHand.handId })}>히트</button>
      <button disabled={busy || !can('stand')} onClick={() => void runAction({ type: 'stand', handId: activeHand.handId })}>스탠드</button>
      {can('doubleDown') && <button disabled={busy} onClick={() => void runAction({ type: 'doubleDown', handId: activeHand.handId })}>더블</button>}
      {can('split') && <button disabled={busy} onClick={() => void runAction({ type: 'split', handId: activeHand.handId })}>스플릿</button>}
      {can('surrender') && <button disabled={busy} onClick={() => void runAction({ type: 'surrender', handId: activeHand.handId })}>서렌더</button>}
    </>
    : state.phase === 'result'
      ? <button className="wide" disabled={busy} onClick={() => void runAction({ type: 'nextRound' })}>다음 판</button>
      : <span>딜러 진행 중…</span>;

  const status = !state ? '앱 연결 중…'
    : state.saveError ? '저장에 실패했습니다 · 재시도하거나 종료하세요'
    : state.phase === 'recovery' ? state.recovery?.issue === 'futureSchema'
      ? '지원하지 않는 저장 버전 · 원본을 보존했습니다'
      : '저장 파일이 손상되었습니다 · 복구 방법을 선택하세요'
    : state.phase === 'result' && state.lastResult ? `라운드 ${signedUsd(state.lastResult.netCents)}`
    : state.phase === 'insuranceDecision' ? '보험 또는 이븐 머니를 선택하세요'
    : state.phase === 'playerTurn' ? '행동을 선택하세요'
    : state.phase === 'betting' ? '베팅 후 딜하세요'
    : '딜러 진행 중…';

  const overlayStyle = { '--overlay-opacity': overlayView.opacityPercent / 100 } as CSSProperties;
  if (overlayView.visibility === 'collapsed') return <main className={dark ? 'overlay collapsed ink-dark' : 'overlay collapsed'} style={overlayStyle}>
    <section className="collapsed-bar">
      <span>{state ? usd(state.balanceCents) : '…'} · {state && state.phase !== 'betting' && state.phase !== 'result' ? '진행 중' : '대기'}</span>
      <button type="button" aria-label="펼치기" onClick={() => void window.blackjack.windowCommand('expand')}>▣</button>
    </section>
  </main>;

  return <main className={dark ? 'overlay ink-dark' : 'overlay'} style={overlayStyle} data-popover-open={overlayView.opacityPopoverVisible} data-resizing={resizingEdge !== undefined}>
    {resizeHandles.map(({ edge, label }) => <button
      key={edge}
      type="button"
      className={`resize-handle resize-handle-${edge}`}
      aria-label={label}
      data-testid={`resize-handle-${edge}`}
      data-resizing={resizingEdge === edge}
      onPointerDown={event => beginResize(event, edge)}
      onPointerMove={moveResize}
      onPointerUp={endResize}
      onPointerCancel={cancelResize}
      onLostPointerCapture={cancelResize}
    />)}
    <header><span className="drag">⠿ <strong>molsino</strong><span className="game-label">BLACKJACK</span></span><button title="흰색/검정 전환" aria-label="흰색/검정 전환" onMouseEnter={event => showOpacityPopover(event.currentTarget)} onMouseLeave={() => void window.blackjack.opacityPopover({ phase: 'hide' })} onClick={() => setDark(!dark)}>◐</button><button aria-label="숨기기" onClick={() => void window.blackjack.windowCommand('hide')}>−</button><button aria-label="종료" onClick={() => void window.blackjack.windowCommand('quit')}>×</button></header>
    <section className="balance"><span>BANKROLL</span><strong>{state ? usd(state.balanceCents) : '…'}</strong></section>
    <section className="cards" aria-label="게임 카드">
      {state?.dealerHand.cards.length ? <div className="hand dealer"><small>DEALER {state.dealerHand.total}</small><div>{state.dealerHand.cards.map(card => <span className={`card ${card.suit === 'H' || card.suit === 'D' ? 'red' : ''}`} key={card.cardId}>{card.rank}{suitSymbol[card.suit]}</span>)}{state.dealerHand.hiddenCardCount > 0 && <span className="card">?</span>}</div></div> : <p>베팅을 정하고<br/>첫 카드를 받아보세요.</p>}
      {state?.playerHands.map(hand => {
        const result = state.lastResult?.entries.find(entry => entry.componentId === hand.handId);
        return <div className={`hand player ${hand.active ? 'active' : ''}`} key={hand.handId}>
          <small>{hand.active ? 'YOU · ' : ''}{hand.total}{hand.isSoft ? 's' : ''} · {usd(hand.wagerCents)}{result ? ` · ${outcomeLabel[result.outcome]}` : ''}</small>
          <div>{hand.cards.map(card => <span className={`card ${card.suit === 'H' || card.suit === 'D' ? 'red' : ''}`} key={card.cardId}>{card.rank}{suitSymbol[card.suit]}</span>)}</div>
        </div>;
      })}
    </section>
    <section className="bet actions">{controls}</section>
    <footer role="status">{error || status}</footer>
  </main>;
}

function OpacityPanel() {
  const [view, setView] = useState<OverlayViewState>({ revision: 0, visibility: 'expanded', opacityPercent: 65, opacityPopoverVisible: false });
  const [draft, setDraft] = useState<number | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    const apply = (state: OverlayViewState) => setView(current => state.revision >= current.revision ? state : current);
    const unsubscribe = window.blackjack.onOverlayState(apply);
    void window.blackjack.getOverlayState().then(apply);
    return unsubscribe;
  }, []);

  function change(percent: number): void {
    const requestId = ++latestRequest.current;
    setDraft(percent);
    void window.blackjack.setOpacity(percent).then(state => {
      setView(current => state.revision >= current.revision ? state : current);
      if (requestId === latestRequest.current) setDraft(null);
    }).catch(() => {
      if (requestId === latestRequest.current) setDraft(null);
    });
  }

  const value = draft ?? view.opacityPercent;
  return <main className="opacity-popover" onMouseEnter={() => void window.blackjack.opacityPopover({ phase: 'keep' })}
    onMouseLeave={() => void window.blackjack.opacityPopover({ phase: 'hide' })}>
    <label className="opacity-control"><span aria-hidden="true">◐</span><input type="range" aria-label="불투명도" min="20" max="100" step="5" value={value} onChange={event => change(Number(event.currentTarget.value))}/><span className="opacity-percent">{value}%</span></label>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode>{window.location.search === '?panel=opacity' ? <OpacityPanel/> : <App/>}</StrictMode>);
