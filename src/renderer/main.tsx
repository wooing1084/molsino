import { StrictMode, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { OverlayViewState } from '../shared/contracts';
import type { AppAction, AppView } from '../shared/app-contracts';
import { BaccaratGame } from './games/baccarat';
import { BlackjackGame } from './games/blackjack';
import { LevelPicker } from './level-picker';
import { usePresentation } from './use-presentation';
import './styles.css';

const usd = (value: number) => `$${(value / 100).toFixed(2)}`;
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

function newerState(current: AppView | undefined, incoming: AppView): AppView {
  if (!current || current.recovery && !incoming.recovery) return incoming;
  return incoming.viewSequence > current.viewSequence ? incoming : current;
}

function App() {
  const [state, setState] = useState<AppView>();
  const [confirmReset, setConfirmReset] = useState(false);
  const [levelPage, setLevelPage] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(false);
  const [overlayView, setOverlayView] = useState<OverlayViewState>({ revision: 0, visibility: 'expanded', opacityPercent: 65, opacityPopoverVisible: false });
  const latestOverlay = useRef(overlayView);
  const [resizingEdge, setResizingEdge] = useState<ResizeEdge>();
  const resizeGesture = useRef<ResizeGesture | undefined>(undefined);
  const latestState = useRef<AppView | undefined>(undefined);
  const commandInFlight = useRef(false);
  const { frame, receive, setVisibility } = usePresentation(overlayView.visibility === 'expanded');
  const applyState = useCallback((incoming: AppView) => {
    const next = newerState(latestState.current, incoming);
    if (next === latestState.current) return;
    latestState.current = next;
    setState(next);
    receive(next);
  }, [receive]);

  useEffect(() => { setConfirmReset(false); setLevelPage(false); }, [state?.sessionId]);

  useEffect(() => {
    let active = true;
    const apply = (nextState: AppView) => {
      if (active) applyState(nextState);
    };
    const unsubscribe = window.molsino.onState(apply);
    void window.molsino.getSnapshot().then(apply).catch(() => {
      if (active) setError('앱 연결 실패 · 다시 실행해 주세요');
    });
    return () => { active = false; unsubscribe(); };
  }, [applyState]);

  useEffect(() => {
    const applyOverlay = (next: OverlayViewState) => {
      if (next.revision < latestOverlay.current.revision) return;
      latestOverlay.current = next;
      setVisibility(next.visibility === 'expanded');
      setOverlayView(next);
    };
    const unsubscribe = window.molsino.onOverlayState(applyOverlay);
    void window.molsino.getOverlayState().then(applyOverlay).catch(() => setError('창 설정을 불러올 수 없습니다.'));
    return unsubscribe;
  }, [setVisibility]);

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
    void window.molsino.resize({ phase: gesture.finishPhase, token: gesture.token })
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
      void window.molsino.resize({ phase: 'update', token: gesture.token })
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

    void window.molsino.resize({ phase: 'start', edge })
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

  async function runAction(action: AppAction): Promise<boolean> {
    const current = latestState.current;
    if (!current || commandInFlight.current || (frame?.revealing && action.type !== 'retrySave')) return false;
    commandInFlight.current = true;
    setBusy(true);
    try {
      const result = await window.molsino.dispatch({
        sessionId: current.sessionId,
        commandId: crypto.randomUUID(),
        expectedRevision: current.revision,
        action,
      });
      applyState(result.state);
      setError(result.ok ? '' : result.message);
      return result.ok;
    } catch {
      setError('게임 명령을 처리할 수 없습니다.');
      return false;
    }
    finally { commandInFlight.current = false; setBusy(false); }
  }

  async function recover(choice: 'restoreBackup' | 'startNew' | 'retryLoad'): Promise<void> {
    setBusy(true);
    try {
      const recovered = await window.molsino.recover(choice);
      applyState(recovered);
      setError('');
    } catch { setError('저장 복구에 실패했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }

  function showOpacityPopover(target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    void window.molsino.opacityPopover({ phase: 'show', anchor: {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    } });
  }

  const overlayStyle = { '--overlay-opacity': overlayView.opacityPercent / 100 } as CSSProperties;
  const shown = frame?.view ?? state;
  const revealing = frame?.revealing ?? false;
  if (overlayView.visibility === 'collapsed') return <main className={dark ? 'overlay collapsed ink-dark' : 'overlay collapsed'} style={overlayStyle}>
    <section className="collapsed-bar">
      <span>{state ? usd(state.balanceCents) : '…'} · {state?.activeRoundGameId ? '진행 중' : '대기'}</span>
      <button type="button" aria-label="펼치기" onClick={() => void window.molsino.windowCommand('expand')}>▣</button>
    </section>
  </main>;

  return <main className={dark ? 'overlay ink-dark' : 'overlay'} style={overlayStyle} data-screen={levelPage ? 'levels' : shown?.screen} data-revealing={revealing} data-popover-open={overlayView.opacityPopoverVisible} data-resizing={resizingEdge !== undefined}>
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
    <header><span className="drag">⠿ <strong className="app-name">molsino</strong></span>{shown && (shown.screen === 'menu' && !levelPage && !shown.recovery
      ? <button className="current-level" aria-label="테이블 레벨" disabled={busy || !shown.canNavigate} onClick={() => { setConfirmReset(false); setError(''); setLevelPage(true); }}><span aria-label="현재 테이블 레벨">Lv.{shown.table.selectedLevel}</span></button>
      : <span className="current-level" aria-label="현재 테이블 레벨">Lv.{shown.table.selectedLevel}</span>)}<button title="흰색/검정 전환" aria-label="흰색/검정 전환" onMouseEnter={event => showOpacityPopover(event.currentTarget)} onMouseLeave={() => void window.molsino.opacityPopover({ phase: 'hide' })} onClick={() => setDark(!dark)}>◐</button><button aria-label="숨기기" onClick={() => void window.molsino.windowCommand('hide')}>−</button><button aria-label="종료" onClick={() => void window.molsino.windowCommand('quit')}>×</button></header>
    <section className="balance">{shown && shown.screen !== 'menu' ? <button aria-label="메뉴" title="한 판을 마친 뒤 이동할 수 있습니다" disabled={busy || revealing || !shown.canNavigate} onClick={() => void runAction({ type: 'goToMenu' })}>‹ 메뉴</button> : <span>BANKROLL</span>}<strong>{frame?.settling ? '정산 중…' : shown ? usd(shown.balanceCents) : '…'}</strong></section>
    {state?.recovery ? <>
      <section className="game-menu"><p>{state.recovery?.issue === 'unavailable' ? '저장 파일을 읽거나 저장할 수 없습니다' : state.recovery?.issue === 'futureSchema' ? '지원하지 않는 저장 버전' : '저장 파일을 복구해야 합니다'}<br/>원본을 보존하고 복구 방법을 선택하세요.</p></section>
      <section className="bet actions">
        {state.recovery?.issue === 'unavailable' ? <button disabled={busy} onClick={() => void recover('retryLoad')}>불러오기 재시도</button> : <>
        {state.recovery?.backupAvailable && <button disabled={busy} onClick={() => void recover('restoreBackup')}>백업 복구</button>}
        <button disabled={busy} onClick={() => void recover('startNew')}>새 게임 시작</button></>}
      </section><footer role="status">{error || '복구 방법을 선택하세요'}</footer>
    </> : levelPage && shown ? <LevelPicker state={shown} busy={busy} error={error} onBack={() => { setLevelPage(false); setError(''); }}
      onApply={async level => { const ok = await runAction({ type: 'selectLevel', level }); if (ok) setLevelPage(false); return ok; }}
      onRetry={async () => { const ok = await runAction({ type: 'retrySave' }); if (ok) setLevelPage(false); return ok; }}/>
    : shown?.screen === 'blackjack' && shown.blackjack && frame ? <BlackjackGame state={{ ...shown.blackjack, saveError: shown.saveError, internalError: shown.internalError }} busy={busy} error={error} table={shown.table} presentation={frame}
      runAction={action => runAction({ type: 'blackjack', action })} onRetry={() => runAction({ type: 'retrySave' })}
      onMenu={() => void runAction({ type: 'goToMenu' })} overlayView={overlayView}/>
    : shown?.screen === 'baccarat' && shown.baccarat && frame ? <BaccaratGame state={shown.baccarat} balance={shown.balanceCents} busy={busy} saveError={shown.saveError} internalError={shown.internalError} error={error} table={shown.table} presentation={frame}
      runAction={action => runAction({ type: 'baccarat', action })} onRetry={() => runAction({ type: 'retrySave' })}
      onMenu={() => void runAction({ type: 'goToMenu' })} overlayView={overlayView}/>
    : <>
      <section className="game-menu">
        {confirmReset ? <p>잔액을 $100으로 초기화하고<br/>모든 게임의 판·슈·기록을 새로 시작합니다.</p> : <>
          <button disabled={busy || !state?.canNavigate} onClick={() => void runAction({ type: 'selectGame', gameId: 'blackjack' })}>블랙잭</button>
          <button disabled={busy || !state?.canNavigate} onClick={() => void runAction({ type: 'selectGame', gameId: 'baccarat' })}>바카라</button>
        </>}
      </section>
      <section className="bet actions">{state?.saveError ? <button disabled={busy} onClick={() => void runAction({ type: 'retrySave' })}>저장 재시도</button>
        : confirmReset ? <>
          <button disabled={busy} onClick={() => setConfirmReset(false)}>취소</button>
          <button disabled={busy || !state?.canNavigate} onClick={() => void runAction({ type: 'resetAll' }).then(ok => { if (ok) setConfirmReset(false); })}>초기화 확정</button>
        </> : <button disabled={busy || !state?.canNavigate} onClick={() => setConfirmReset(true)}>새 시작</button>}
      </section>
      <footer role="status">{error || (state?.saveError ? '저장에 실패했습니다 · 재시도하세요' : state ? '게임을 선택하세요' : '앱 연결 중…')}</footer>
    </>}

  </main>;
}

function OpacityPanel() {
  const [view, setView] = useState<OverlayViewState>({ revision: 0, visibility: 'expanded', opacityPercent: 65, opacityPopoverVisible: false });
  const [draft, setDraft] = useState<number | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    const apply = (state: OverlayViewState) => setView(current => state.revision >= current.revision ? state : current);
    const unsubscribe = window.molsino.onOverlayState(apply);
    void window.molsino.getOverlayState().then(apply);
    return unsubscribe;
  }, []);

  function change(percent: number): void {
    const requestId = ++latestRequest.current;
    setDraft(percent);
    void window.molsino.setOpacity(percent).then(state => {
      setView(current => state.revision >= current.revision ? state : current);
      if (requestId === latestRequest.current) setDraft(null);
    }).catch(() => {
      if (requestId === latestRequest.current) setDraft(null);
    });
  }

  const value = draft ?? view.opacityPercent;
  return <main className="opacity-popover" style={{ opacity: value / 100 }} onMouseEnter={() => void window.molsino.opacityPopover({ phase: 'keep' })}
    onMouseLeave={() => void window.molsino.opacityPopover({ phase: 'hide' })}>
    <label className="opacity-control"><span aria-hidden="true">◐</span><input type="range" aria-label="불투명도" min="20" max="100" step="5" value={value} onChange={event => change(Number(event.currentTarget.value))}/><span className="opacity-percent">{value}%</span></label>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode>{window.location.search === '?panel=opacity' ? <OpacityPanel/> : <App/>}</StrictMode>);
