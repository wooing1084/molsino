import { useEffect, useRef, useState } from 'react';
import type { BaccaratAction, Target } from '../../core/baccarat/core';
import type { BaccaratView } from '../../shared/baccarat-view';
import type { OverlayViewState } from '../../shared/contracts';
import { parseBetInput } from '../../shared/bet-input';
import type { AppView } from '../../shared/app-contracts';
import { CardFace, TableLimits } from '../game-ui';
import { visibleBaccaratScore, type PresentationFrame } from '../presentation';
const usd = (n: number) => `$${(n / 100).toFixed(2)}`;
const names = { P: 'Player', B: 'Banker', T: 'Tie' };
export function BaccaratGame({ state, balance, busy: commandBusy, saveError, internalError, error, runAction, onRetry, onMenu, overlayView, table, presentation }: {
  state: BaccaratView; balance: number; busy: boolean; saveError: boolean; internalError?: string; error: string;
  runAction(action: BaccaratAction): Promise<boolean>; onRetry(): Promise<boolean>; onMenu(): void; overlayView: OverlayViewState;
  table: AppView['table']; presentation: PresentationFrame;
}) {
  const busy = commandBusy || presentation.revealing;
  const insufficient = balance < table.minBetCents;
  const shortageLabel = balance < 100 ? '메뉴에서 새 시작' : '하위 레벨 선택';
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(''), [inputError, setInputError] = useState('');
  const editRef = useRef(false), input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);
  function endEdit() {
    if (!editRef.current) return;
    editRef.current = false; setEditing(false); setInputError('');
    void window.molsino.amountEditFocus('end').catch(() => {});
  }
  useEffect(() => {
    const release = () => { if (editRef.current) void window.molsino.amountEditFocus('end').catch(() => {}); };
    window.addEventListener('pagehide', release);
    return () => { window.removeEventListener('pagehide', release); release(); };
  }, []);
  useEffect(() => { if (state.phase !== 'betting' || saveError || overlayView.visibility !== 'expanded') endEdit(); }, [state.phase, saveError, overlayView.visibility]);
  async function beginEdit() {
    if (busy || editRef.current || !state.legalActions.includes('setBet')) return;
    try {
      await window.molsino.amountEditFocus('begin'); editRef.current = true;
      setDraft((state.pendingBet.amountCents / 100).toFixed(2)); setInputError(''); setEditing(true);
    } catch { setInputError('베팅 금액을 편집할 수 없습니다.'); }
  }
  async function commitEdit() {
    if (!editRef.current || busy) return;
    const parsed = parseBetInput(draft, balance, table);
    if (!parsed.ok) { setInputError(parsed.message); return; }
    if (await runAction({ type: 'setBet', target: state.pendingBet.target, amountCents: parsed.cents })) endEdit();
  }
  const result = state.lastResult;
  const status = saveError ? '저장 실패 · 같은 판 저장을 재시도하세요' : internalError ? '진행 오류 · 앱을 다시 실행하세요'
    : presentation.revealing ? '카드 공개 중…'
    : state.phase === 'dealing' ? '카드 배분 중…' : result
    ? `${names[result.outcome]}${result.outcome === 'T' ? '' : ' 승'} · ${result.netCents >= 0 ? '+' : '−'}${usd(Math.abs(result.netCents))}${result.outcome === 'B' && result.bet.target === 'B' ? ' · 수수료 5%' : ''}`
    : insufficient ? `잔액 부족 · ${shortageLabel}` : 'P Player · B Banker · T Tie';
  return <>
    <section className="baccarat-table" aria-label="바카라 카드">
      <div className="baccarat-hands">{(['player', 'banker'] as const).map(side => <div className="hand" key={side} aria-label={side === 'player' ? 'Player 패' : 'Banker 패'}>
        <small>{side === 'player' ? 'Player' : 'Banker'} · {visibleBaccaratScore(state[side].cards, presentation.revealedCardIds) ?? '–'}</small>
        <div>{state[side].cards.length ? state[side].cards.map(card => <CardFace card={card} presentation={presentation} key={card.cardId}/>) : <span className="card">–</span>}</div>
      </div>)}</div>
      <div className="baccarat-history" aria-label="최근 바카라 결과" tabIndex={0}>
        {state.recentResults.length ? state.recentResults.map(r => <span key={r.roundId} aria-label={names[r.outcome]} title={names[r.outcome]}>{r.outcome}</span>) : '최근 결과 없음'}
      </div>
    </section>
    <TableLimits table={table}/>
    <section className="bet actions baccarat-actions">
      {saveError ? <button disabled={commandBusy} onClick={() => void onRetry()}>저장 재시도</button> : internalError ? <span>진행 오류</span>
        : presentation.revealing ? <span>카드 공개 중…</span>
        : state.phase === 'result' ? <>
          <button disabled={busy} onClick={() => insufficient ? onMenu() : void runAction({ type: 'nextRound' })}>{insufficient ? shortageLabel : '다음 판'}</button>
          {result && <span className="baccarat-return" title={`${names[result.bet.target]} 베팅 ${usd(result.bet.amountCents)}, 반환 ${usd(result.returnCents)}`}>{result.bet.target} {usd(result.bet.amountCents)} → {usd(result.returnCents)}</span>}
        </> : state.phase === 'betting' && insufficient ? <button disabled={busy} onClick={onMenu}>{shortageLabel}</button> : <>
          {(['P', 'B', 'T'] as Target[]).map(target => <button key={target} aria-label={`${names[target]} 베팅`} title={`${names[target]} 베팅`}
            aria-pressed={state.pendingBet.target === target} disabled={busy || editing || !state.legalActions.includes('setBet')}
            onClick={() => void runAction({ type: 'setBet', target, amountCents: state.pendingBet.amountCents })}>{target}</button>)}
          {editing ? <div className="bet-input-wrap"><input ref={input} className="bet-input" aria-label="베팅 금액" inputMode="decimal" autoComplete="off" spellCheck={false}
            aria-invalid={Boolean(inputError)} value={draft} onChange={e => { setDraft(e.target.value); setInputError(''); }} onBlur={endEdit}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void commitEdit(); } if (e.key === 'Escape') { e.preventDefault(); endEdit(); } }}/></div>
            : <button className="bet-amount" aria-label="베팅 금액" disabled={busy || !state.legalActions.includes('setBet')} onClick={() => void beginEdit()}><output>{usd(state.pendingBet.amountCents)}</output></button>}
          <button aria-label="딜" disabled={busy || editing || !state.legalActions.includes('deal')} onClick={() => void runAction({ type: 'deal' })}>딜</button>
        </>}
    </section>
    <footer role="status" className="baccarat-status" title={inputError || error || status}>{inputError || error || status}</footer>
  </>;
}
