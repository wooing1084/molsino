import { useEffect, useRef, useState } from 'react';
import { BIG_WHEEL_RULES, BIG_WHEEL_SYMBOLS, type BigWheelAction, type BigWheelSymbol } from '../../core/bigwheel/core';
import type { BigWheelView } from '../../shared/bigwheel-view';
import type { OverlayViewState } from '../../shared/contracts';
import type { AppView } from '../../shared/app-contracts';
import { parseBetInput, type BetInputError } from '../../shared/bet-input';
import { bigWheelName, translate, type AppLocale, type I18nKey } from '../../shared/i18n';
import type { PresentationFrame } from '../presentation';
import { BigWheelWindow } from './bigwheel-window';
const usd = (n: number) => `$${(n / 100).toFixed(2)}`;
const compactUsd = (n: number) => `$${n % 100 === 0 ? n / 100 : (n / 100).toFixed(2)}`;
const betInputKeys: Record<BetInputError, I18nKey> = {
  required: 'betInput.required', format: 'betInput.format', tooLarge: 'betInput.tooLarge',
  belowMinimum: 'betInput.belowMinimum', aboveMaximum: 'betInput.aboveMaximum', balance: 'betInput.balance',
};

export function BigWheelGame({ state, balance, busy: commandBusy, saveError, internalError, error, locale, runAction, onRetry, onMenu, overlayView, table, presentation }: {
  state: BigWheelView; balance: number; busy: boolean; saveError: boolean; internalError?: string; error: string;
  locale: AppLocale;
  runAction(action: BigWheelAction): Promise<boolean>; onRetry(): Promise<boolean>; onMenu(): void;
  overlayView: OverlayViewState; table: AppView['table']; presentation: PresentationFrame;
}) {
  const t = (key: I18nKey, values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
  const busy = commandBusy || presentation.revealing;
  const [target, setTarget] = useState<BigWheelSymbol>('silver');
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(''), [inputError, setInputError] = useState('');
  const editRef = useRef(false), input = useRef<HTMLInputElement>(null);
  useEffect(() => { setInputError(''); }, [locale]);
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
    } catch { setInputError(t('bet.editUnavailable')); }
  }
  async function commitEdit() {
    if (!editRef.current || busy) return;
    const otherBets = state.totalBetCents - state.pendingBets[target];
    const parsed = parseBetInput(draft, Math.max(0, balance - otherBets), { minBetCents: 0, maxBetCents: Math.max(0, table.maxBetCents - otherBets) });
    if (!parsed.ok) {
      const amount = parsed.error === 'belowMinimum' ? usd(0) : usd(Math.max(0, table.maxBetCents - otherBets));
      setInputError(t(betInputKeys[parsed.error], { amount }));
      return;
    }
    if (await runAction({ type: 'setBet', target, amountCents: parsed.cents })) endEdit();
  }
  const result = state.lastResult;
  const spinning = state.phase === 'spinning';
  const shortage = balance < table.minBetCents;
  const shortageLabel = balance < 100 ? t('shortage.startOver') : t('shortage.lowerLevel');
  const status = saveError ? t('status.saveRoundRetry') : internalError ? t('status.restartProgress')
    : spinning ? t('bigwheel.spinning') : result ? t('bigwheel.result', { name: bigWheelName(locale, result.outcome), returned: usd(result.returnCents), net: `${result.netCents >= 0 ? '+' : '−'}${usd(Math.abs(result.netCents))}` })
    : shortage ? t('status.insufficient', { action: shortageLabel }) : t('bigwheel.waiting', { name: bigWheelName(locale, target) });
  return <>
    <section className="bigwheel-table" aria-label={t('bigwheel.table')}>
      <div className="bigwheel-visual">
        <BigWheelWindow state={state} presentation={presentation} locale={locale}/>
        <div className="bigwheel-metadata">
          <div className="bigwheel-history" aria-label={t('bigwheel.recent')} tabIndex={0}>{state.recentResults.length ? state.recentResults.map(r => <span key={r.roundId} title={bigWheelName(locale, r.outcome)}>{bigWheelName(locale, r.outcome)}</span>) : t('bigwheel.noRecent')}</div>
        </div>
      </div>
      <div className="bigwheel-targets" aria-label={t('bigwheel.targets')} tabIndex={0}>
        {BIG_WHEEL_SYMBOLS.map(symbol => <button key={symbol} aria-label={t('bigwheel.bet', { name: bigWheelName(locale, symbol) })} title={t('bigwheel.betTitle', { name: bigWheelName(locale, symbol), payout: BIG_WHEEL_RULES[symbol].payout, amount: usd(state.pendingBets[symbol]) })} aria-pressed={target === symbol} disabled={busy || editing || !state.legalActions.includes('setBet')} onClick={() => { setTarget(symbol); setInputError(''); }}>
          <span>{bigWheelName(locale, symbol)} {BIG_WHEEL_RULES[symbol].payout}:1</span><output>{usd(state.pendingBets[symbol])}</output>
        </button>)}
      </div>
    </section>
    <div className="table-limits bigwheel-limits" title={t('bigwheel.totalTitle', { total: usd(state.totalBetCents), min: usd(table.minBetCents), max: usd(table.maxBetCents) })}><span className="bigwheel-total" aria-label={t('bigwheel.total')}>Σ {usd(state.totalBetCents)}</span><span aria-hidden="true">|</span><span>{t('limits.text', { min: compactUsd(table.minBetCents), max: compactUsd(table.maxBetCents) })}</span></div>
    <section className="bet actions bigwheel-actions">
      {saveError ? <button disabled={commandBusy} onClick={() => void onRetry()}>{t('common.saveRetry')}</button> : internalError ? <span>{t('common.progressError')}</span>
        : spinning ? <span>{t('bigwheel.spinning')}</span> : state.phase === 'result' ? <button disabled={busy} onClick={() => shortage ? onMenu() : void runAction({ type: 'nextRound' })}>{shortage ? shortageLabel : t('common.nextRound')}</button>
        : shortage ? <button disabled={busy} onClick={onMenu}>{shortageLabel}</button> : <>
          {editing ? <div className="bet-input-wrap"><input ref={input} className="bet-input" aria-label={t('common.betAmount')} inputMode="decimal" autoComplete="off" spellCheck={false} value={draft} aria-invalid={Boolean(inputError)} onChange={e => { setDraft(e.target.value); setInputError(''); }} onBlur={endEdit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void commitEdit(); } if (e.key === 'Escape') { e.preventDefault(); endEdit(); } }}/></div>
            : <button className="bet-amount" aria-label={t('common.betAmount')} title={t('bigwheel.selectedBet', { name: bigWheelName(locale, target) })} disabled={busy || !state.legalActions.includes('setBet')} onClick={() => void beginEdit()}><output>{bigWheelName(locale, target)} {usd(state.pendingBets[target])}</output></button>}
          <button aria-label={t('bigwheel.remove')} disabled={busy || editing || !state.pendingBets[target] || !state.legalActions.includes('setBet')} onClick={() => void runAction({ type: 'setBet', target, amountCents: 0 })}>{t('common.remove')}</button>
          <button aria-label={t('bigwheel.spin')} disabled={busy || editing || !state.legalActions.includes('spin')} onClick={() => void runAction({ type: 'spin' })}>{t('bigwheel.spin')}</button>
        </>}
    </section>
    <footer role="status" className="bigwheel-status" title={inputError || error || status}>{inputError || error || status}</footer>
  </>;
}
