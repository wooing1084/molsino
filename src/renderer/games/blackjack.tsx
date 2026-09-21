import { useEffect, useRef, useState } from 'react';
import type { GameViewState, OverlayViewState, SettlementOutcome } from '../../shared/contracts';
import type { AppView, BlackjackAction } from '../../shared/app-contracts';
import { parseBetInput } from '../../shared/bet-input';
import { CardFace, TableLimits } from '../game-ui';
import { visibleBlackjackScore, type PresentationFrame } from '../presentation';
const usd = (value: number) => `$${(value / 100).toFixed(2)}`;
const signedUsd = (value: number) => `${value >= 0 ? '+' : '−'}${usd(Math.abs(value))}`;
const outcomeLabel: Record<SettlementOutcome, string> = {
  win: '승', loss: '패', push: '무', blackjack: 'BJ', bust: '버스트', surrender: '서렌더',
  'insurance-win': '보험 승', 'insurance-loss': '보험 패', 'even-money': '이븐',
};

export function BlackjackGame({ state, busy: commandBusy, error, runAction, onRetry, onMenu, overlayView, table, presentation }: {
  state: GameViewState & { internalError?: string }; busy: boolean; error: string;
  runAction(action: BlackjackAction): Promise<boolean>; onRetry(): Promise<boolean>; onMenu(): void;
  overlayView: OverlayViewState;
  table: AppView['table']; presentation: PresentationFrame;
}) {
  const busy = commandBusy || presentation.revealing;
  const minimum = table.minBetCents;
  const maximum = Math.min(state.balanceCents, table.maxBetCents);
  const betStep = Math.max(state.betStepCents, minimum);
  const insufficient = state.balanceCents < minimum;
  const shortageLabel = state.balanceCents < 100 ? '메뉴에서 새 시작' : '하위 레벨 선택';
  const [betEditing, setBetEditing] = useState(false);
  const [betDraft, setBetDraft] = useState('');
  const [betError, setBetError] = useState('');
  const betEditingRef = useRef(false);
  const betInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (betEditing) {
      betInputRef.current?.focus();
      betInputRef.current?.select();
    }
  }, [betEditing]);

  useEffect(() => {
    const release = () => {
      if (betEditingRef.current) void window.molsino.amountEditFocus('end').catch(() => {});
    };
    window.addEventListener('pagehide', release);
    return () => { window.removeEventListener('pagehide', release); release(); };
  }, []);

  function changeBet(delta: number): void {
    if (!state) return;
    const amountCents = Math.max(minimum, Math.min(maximum, state.pendingBetCents + delta));
    void runAction({ type: 'setBet', amountCents });
  }

  async function beginBetEdit(): Promise<void> {
    if (!state || busy || betEditingRef.current || state.phase !== 'betting' || insufficient) return;
    try {
      await window.molsino.amountEditFocus('begin');
      betEditingRef.current = true;
      setBetDraft((state.pendingBetCents / 100).toFixed(2));
      setBetError('');
      setBetEditing(true);
    } catch { setBetError('베팅 금액을 편집할 수 없습니다.'); }
  }

  function endBetEdit(): void {
    if (!betEditingRef.current) return;
    betEditingRef.current = false;
    setBetEditing(false);
    setBetError('');
    void window.molsino.amountEditFocus('end').catch(() => {});
  }

  async function commitBetEdit(): Promise<void> {
    if (!state || !betEditingRef.current || busy) return;
    const parsed = parseBetInput(betDraft, state.balanceCents, table);
    if (!parsed.ok) { setBetError(parsed.message); return; }
    if (await runAction({ type: 'setBet', amountCents: parsed.cents })) endBetEdit();
  }

  useEffect(() => {
    if (betEditing && (state?.phase !== 'betting' || insufficient
      || state.saveError || overlayView.visibility !== 'expanded')) endBetEdit();
  }, [betEditing, state?.phase, insufficient, state?.saveError, overlayView.visibility]);

  const activeHand = state?.playerHands.find(hand => hand.active);
  const can = (action: GameViewState['legalActions'][number]) => state?.legalActions.includes(action) ?? false;
  const controls = state.saveError ? <button className="wide" disabled={commandBusy} onClick={() => void onRetry()}>저장 재시도</button>
    : state.internalError ? <span>진행 오류</span>
    : presentation.revealing ? <span>카드 공개 중…</span>
    : state.phase === 'betting' ? insufficient
    ? <button className="wide" disabled={busy} onClick={onMenu}>{shortageLabel}</button>
    : <>
      <span>BET</span>
      <button aria-label="베팅 줄이기" disabled={busy || betEditing || state.pendingBetCents <= minimum} onClick={() => changeBet(-betStep)}>−</button>
      {betEditing ? <div className="bet-input-wrap">
        <input ref={betInputRef} className="bet-input" type="text" inputMode="decimal" aria-label="베팅 금액"
          aria-invalid={Boolean(betError)} value={betDraft} spellCheck={false} autoComplete="off"
          onChange={event => { setBetDraft(event.currentTarget.value); setBetError(''); }}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); void commitBetEdit(); }
            if (event.key === 'Escape') { event.preventDefault(); endBetEdit(); }
          }}
          onBlur={endBetEdit}/>
        {betError && <span className="bet-input-error" title={betError} aria-label={betError}>!</span>}
      </div> : <button className="bet-amount" aria-label="베팅 금액" disabled={busy} onClick={() => void beginBetEdit()}><output>{usd(state.pendingBetCents)}</output></button>}
      <button aria-label="베팅 올리기" disabled={busy || betEditing || state.pendingBetCents >= maximum} onClick={() => changeBet(betStep)}>+</button>
      <button aria-label="딜" disabled={busy || betEditing || !can('deal')} onClick={() => void runAction({ type: 'deal' })}>딜</button>
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
      ? insufficient
        ? <button className="wide" disabled={busy} onClick={onMenu}>{shortageLabel}</button>
        : <button className="wide" disabled={busy} onClick={() => void runAction({ type: 'nextRound' })}>다음 판</button>
      : <span>딜러 진행 중…</span>;

  const status = !state ? '앱 연결 중…'
    : state.saveError ? '저장에 실패했습니다 · 재시도하거나 종료하세요'
    : presentation.revealing ? '카드 공개 중…'
    : state.phase === 'recovery' ? state.recovery?.issue === 'futureSchema'
      ? '지원하지 않는 저장 버전 · 원본을 보존했습니다'
      : '저장 파일이 손상되었습니다 · 복구 방법을 선택하세요'
    : (state.phase === 'betting' || state.phase === 'result') && insufficient
      ? `잔액 부족 · ${shortageLabel}`
    : state.phase === 'result' && state.lastResult ? `라운드 ${signedUsd(state.lastResult.netCents)}`
    : state.phase === 'insuranceDecision' ? '보험 또는 이븐 머니를 선택하세요'
    : state.phase === 'playerTurn' ? '행동을 선택하세요'
    : state.phase === 'betting' ? '베팅 후 딜하세요'
    : '딜러 진행 중…';

  return <>
    <section className="cards" aria-label="게임 카드">
      {state?.dealerHand.cards.length ? <div className="hand dealer" aria-label="딜러 패"><small>DEALER {state.dealerHand.cards.some(card => presentation.revealedCardIds.has(card.cardId)) ? visibleBlackjackScore(state.dealerHand.cards, presentation.revealedCardIds).total : '–'}</small><div>{state.dealerHand.cards.filter((_, index) => index === 0 || presentation.holePlaced).map(card => <CardFace card={card} presentation={presentation} key={card.cardId}/>)}{presentation.holePlaced && state.dealerHand.hiddenCardCount > 0 && <span className="card" data-revealed="false">?</span>}</div></div> : <p>베팅을 정하고<br/>첫 카드를 받아보세요.</p>}
      {state?.playerHands.map(hand => {
        const result = state.lastResult?.entries.find(entry => entry.componentId === hand.handId);
        const score = visibleBlackjackScore(hand.cards, presentation.revealedCardIds);
        return <div className={`hand player ${hand.active ? 'active' : ''}`} key={hand.handId}>
          <small>{hand.active ? 'YOU · ' : ''}{score.total || '–'}{score.isSoft ? 's' : ''} · {usd(hand.wagerCents)}{result ? ` · ${outcomeLabel[result.outcome]}` : ''}</small>
          <div>{hand.cards.map(card => <CardFace card={card} presentation={presentation} key={card.cardId}/>)}</div>
        </div>;
      })}
    </section>
    <TableLimits table={table}/>
    <section className="bet actions">{controls}</section>
    <footer role="status" title={betError || error || status}>{betError || error || status}</footer>
  </>;
}
