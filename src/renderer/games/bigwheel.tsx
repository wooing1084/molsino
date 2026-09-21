import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BIG_WHEEL_RULES, BIG_WHEEL_SEGMENTS, BIG_WHEEL_SYMBOLS, type BigWheelAction, type BigWheelSymbol } from '../../core/bigwheel/core';
import type { BigWheelView } from '../../shared/bigwheel-view';
import type { OverlayViewState } from '../../shared/contracts';
import type { AppView } from '../../shared/app-contracts';
import { parseBetInput } from '../../shared/bet-input';
import type { PresentationFrame } from '../presentation';
const usd = (n: number) => `$${(n / 100).toFixed(2)}`;
const compactUsd = (n: number) => `$${n % 100 === 0 ? n / 100 : (n / 100).toFixed(2)}`;
const step = 360 / 54;
const point = (angle: number, radius: number) => `${50 + Math.sin(angle * Math.PI / 180) * radius},${50 - Math.cos(angle * Math.PI / 180) * radius}`;

export function BigWheelGame({ state, balance, busy: commandBusy, saveError, internalError, error, runAction, onRetry, onMenu, overlayView, table, presentation }: {
  state: BigWheelView; balance: number; busy: boolean; saveError: boolean; internalError?: string; error: string;
  runAction(action: BigWheelAction): Promise<boolean>; onRetry(): Promise<boolean>; onMenu(): void;
  overlayView: OverlayViewState; table: AppView['table']; presentation: PresentationFrame;
}) {
  const busy = commandBusy || presentation.revealing;
  const [target, setTarget] = useState<BigWheelSymbol>('silver');
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
      setDraft((state.pendingBets[target] / 100).toFixed(2)); setInputError(''); setEditing(true);
    } catch { setInputError('베팅 금액을 편집할 수 없습니다.'); }
  }
  async function commitEdit() {
    if (!editRef.current || busy) return;
    const otherBets = state.totalBetCents - state.pendingBets[target];
    const parsed = parseBetInput(draft, Math.max(0, balance - otherBets), { minBetCents: 0, maxBetCents: Math.max(0, table.maxBetCents - otherBets) });
    if (!parsed.ok) { setInputError(parsed.message); return; }
    if (await runAction({ type: 'setBet', target, amountCents: parsed.cents })) endEdit();
  }
  const result = state.lastResult;
  const spinning = state.phase === 'spinning';
  const shortage = balance < table.minBetCents;
  const shortageLabel = balance < 100 ? '메뉴에서 새 시작' : '하위 레벨 선택';
  const rotation = -(presentation.wheelSegmentIndex ?? 0) * step;
  const status = saveError ? '저장 실패 · 같은 판 저장을 재시도하세요' : internalError ? '진행 오류 · 앱을 다시 실행하세요'
    : spinning ? '휠 회전 중…' : result ? `${BIG_WHEEL_RULES[result.outcome].name} · 반환 ${usd(result.returnCents)} · ${result.netCents >= 0 ? '+' : '−'}${usd(Math.abs(result.netCents))}`
    : shortage ? `잔액 부족 · ${shortageLabel}` : `${BIG_WHEEL_RULES[target].name} 금액 편집 · 0 입력으로 제거`;
  return <>
    <section className="bigwheel-table" aria-label="빅휠 테이블">
      <div className="bigwheel-visual">
        <svg viewBox="0 0 100 100" role="img" aria-label="빅휠 54칸" data-segment-index={result?.segmentIndex}>
          <g key={state.roundId ?? 'betting'} className={presentation.revealing ? 'bigwheel-disc spinning' : 'bigwheel-disc'} style={{ '--wheel-stop': `${1080 + rotation}deg`, transform: `rotate(${rotation}deg)` } as CSSProperties}>
            {BIG_WHEEL_SEGMENTS.map((symbol, i) => <path key={i} d={`M50,50 L${point(i * step - step / 2, 44)} A44,44 0 0,1 ${point(i * step + step / 2, 44)} Z`} fill="currentColor" fillOpacity={.08 + BIG_WHEEL_SYMBOLS.indexOf(symbol) * .1} stroke="currentColor" strokeWidth=".35"><title>{i + 1}: {BIG_WHEEL_RULES[symbol].name}</title></path>)}
            {BIG_WHEEL_SYMBOLS.map(symbol => {
              const first = BIG_WHEEL_SEGMENTS.indexOf(symbol);
              const middle = first + (BIG_WHEEL_RULES[symbol].segments - 1) / 2;
              const [x, y] = point(middle * step, 32).split(',');
              return <text key={symbol} x={x} y={y} fill="currentColor" textAnchor="middle" dominantBaseline="middle" fontSize="8">{BIG_WHEEL_RULES[symbol].payout}</text>;
            })}
          </g>
          <path d="M46,1 L54,1 L50,10 Z" fill="currentColor"/>
          <circle cx="50" cy="50" r="4" fill="currentColor"/>
        </svg>
        <div className="bigwheel-total" aria-label="총 베팅 금액" title={`총 베팅 ${usd(state.totalBetCents)}`}>Σ {usd(state.totalBetCents)}</div>
        <div className="bigwheel-history" aria-label="최근 빅휠 결과" tabIndex={0}>{state.recentResults.length ? state.recentResults.map(r => <span key={r.roundId} title={BIG_WHEEL_RULES[r.outcome].name}>{BIG_WHEEL_RULES[r.outcome].name}</span>) : '최근 결과 없음'}</div>
      </div>
      <div className="bigwheel-targets" aria-label="베팅 구역과 순이익 배당" tabIndex={0}>
        {BIG_WHEEL_SYMBOLS.map(symbol => <button key={symbol} aria-label={`${BIG_WHEEL_RULES[symbol].name} 베팅`} title={`${BIG_WHEEL_RULES[symbol].name} · 순이익 ${BIG_WHEEL_RULES[symbol].payout}:1 · ${usd(state.pendingBets[symbol])}`} aria-pressed={target === symbol} disabled={busy || editing || !state.legalActions.includes('setBet')} onClick={() => { setTarget(symbol); setInputError(''); }}>
          <span>{BIG_WHEEL_RULES[symbol].name} {BIG_WHEEL_RULES[symbol].payout}:1</span><output>{usd(state.pendingBets[symbol])}</output>
        </button>)}
      </div>
    </section>
    <div className="table-limits bigwheel-limits" title={`총액 기준 최소 ${usd(table.minBetCents)} · 최대 ${usd(table.maxBetCents)}`}>총액 최소 {compactUsd(table.minBetCents)} · 최대 {compactUsd(table.maxBetCents)}</div>
    <section className="bet actions bigwheel-actions">
      {saveError ? <button disabled={commandBusy} onClick={() => void onRetry()}>저장 재시도</button> : internalError ? <span>진행 오류</span>
        : spinning ? <span>휠 회전 중…</span> : state.phase === 'result' ? <button disabled={busy} onClick={() => shortage ? onMenu() : void runAction({ type: 'nextRound' })}>{shortage ? shortageLabel : '다음 판'}</button>
        : shortage ? <button disabled={busy} onClick={onMenu}>{shortageLabel}</button> : <>
          {editing ? <div className="bet-input-wrap"><input ref={input} className="bet-input" aria-label="베팅 금액" inputMode="decimal" autoComplete="off" spellCheck={false} value={draft} aria-invalid={Boolean(inputError)} onChange={e => { setDraft(e.target.value); setInputError(''); }} onBlur={endEdit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void commitEdit(); } if (e.key === 'Escape') { e.preventDefault(); endEdit(); } }}/></div>
            : <button className="bet-amount" aria-label="베팅 금액" title={`${BIG_WHEEL_RULES[target].name} 베팅 금액`} disabled={busy || !state.legalActions.includes('setBet')} onClick={() => void beginEdit()}><output>{BIG_WHEEL_RULES[target].name} {usd(state.pendingBets[target])}</output></button>}
          <button aria-label="선택 구역 베팅 제거" disabled={busy || editing || !state.pendingBets[target] || !state.legalActions.includes('setBet')} onClick={() => void runAction({ type: 'setBet', target, amountCents: 0 })}>제거</button>
          <button aria-label="회전" disabled={busy || editing || !state.legalActions.includes('spin')} onClick={() => void runAction({ type: 'spin' })}>회전</button>
        </>}
    </section>
    <footer role="status" className="bigwheel-status" title={inputError || error || status}>{inputError || error || status}</footer>
  </>;
}
