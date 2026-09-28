import { useEffect, useRef, useState } from 'react';
import type { BaccaratAction, Target } from '../../core/baccarat/core';
import type { BaccaratView } from '../../shared/baccarat-view';
import type { OverlayViewState } from '../../shared/contracts';
import { parseBetInput, type BetInputError } from '../../shared/bet-input';
import type { AppView } from '../../shared/app-contracts';
import { translate, type AppLocale, type I18nKey } from '../../shared/i18n';
import { CardFace, TableLimits } from '../game-ui';
import { visibleBaccaratScore, type PresentationFrame } from '../presentation';
const usd = (n: number) => `$${(n / 100).toFixed(2)}`;
const names = { P: 'Player', B: 'Banker', T: 'Tie' };
const betInputKeys: Record<BetInputError, I18nKey> = {
  required: 'betInput.required', format: 'betInput.format', tooLarge: 'betInput.tooLarge',
  belowMinimum: 'betInput.belowMinimum', aboveMaximum: 'betInput.aboveMaximum', balance: 'betInput.balance',
};
export function BaccaratGame({ state, balance, busy: commandBusy, saveError, internalError, error, locale, runAction, onRetry, onMenu, overlayView, table, presentation }: {
  state: BaccaratView; balance: number; busy: boolean; saveError: boolean; internalError?: string; error: string;
  locale: AppLocale;
  runAction(action: BaccaratAction): Promise<boolean>; onRetry(): Promise<boolean>; onMenu(): void; overlayView: OverlayViewState;
  table: AppView['table']; presentation: PresentationFrame;
}) {
  const t = (key: I18nKey, values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
  const busy = commandBusy || presentation.revealing;
  const insufficient = balance < table.minBetCents;
  const shortageLabel = balance < 100 ? t('shortage.startOver') : t('shortage.lowerLevel');
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
      setDraft((state.pendingBet.amountCents / 100).toFixed(2)); setInputError(''); setEditing(true);
    } catch { setInputError(t('bet.editUnavailable')); }
  }
  async function commitEdit() {
    if (!editRef.current || busy) return;
    const parsed = parseBetInput(draft, balance, table);
    if (!parsed.ok) {
      const amount = parsed.error === 'belowMinimum' ? usd(table.minBetCents) : usd(table.maxBetCents);
      setInputError(t(betInputKeys[parsed.error], { amount }));
      return;
    }
    if (await runAction({ type: 'setBet', target: state.pendingBet.target, amountCents: parsed.cents })) endEdit();
  }
  const result = state.lastResult;
  const status = saveError ? t('status.saveRoundRetry') : internalError ? t('status.restartProgress')
    : presentation.revealing ? t('common.revealing')
    : state.phase === 'dealing' ? t('baccarat.dealing') : result
    ? `${names[result.outcome]}${result.outcome === 'T' ? '' : t('baccarat.winSuffix')} · ${result.netCents >= 0 ? '+' : '−'}${usd(Math.abs(result.netCents))}${result.outcome === 'B' && result.bet.target === 'B' ? ` · ${t('baccarat.commission')}` : ''}`
    : insufficient ? t('status.insufficient', { action: shortageLabel }) : t('baccarat.legend');
  return <>
    <section className="baccarat-table" aria-label={t('baccarat.cards')}>
      <div className="baccarat-hands">{(['player', 'banker'] as const).map(side => <div className="hand" key={side} aria-label={side === 'player' ? t('baccarat.playerHand') : t('baccarat.bankerHand')}>
        <small>{side === 'player' ? 'Player' : 'Banker'} · {visibleBaccaratScore(state[side].cards, presentation.revealedCardIds) ?? '–'}</small>
        <div>{state[side].cards.length ? state[side].cards.map(card => <CardFace card={card} presentation={presentation} key={card.cardId}/>) : <span className="card">–</span>}</div>
      </div>)}</div>
      <div className="baccarat-history" aria-label={t('baccarat.recent')} tabIndex={0}>
        {state.recentResults.length ? state.recentResults.map(r => <span key={r.roundId} aria-label={names[r.outcome]} title={names[r.outcome]}>{r.outcome}</span>) : t('baccarat.noRecent')}
      </div>
    </section>
    <TableLimits table={table} locale={locale}/>
    <section className="bet actions baccarat-actions">
      {saveError ? <button disabled={commandBusy} onClick={() => void onRetry()}>{t('common.saveRetry')}</button> : internalError ? <span>{t('common.progressError')}</span>
        : presentation.revealing ? <span>{t('common.revealing')}</span>
        : state.phase === 'result' ? <>
          <button disabled={busy} onClick={() => insufficient ? onMenu() : void runAction({ type: 'nextRound' })}>{insufficient ? shortageLabel : t('common.nextRound')}</button>
          {result && <span className="baccarat-return" title={t('baccarat.returnTitle', { name: names[result.bet.target], bet: usd(result.bet.amountCents), returned: usd(result.returnCents) })}>{result.bet.target} {usd(result.bet.amountCents)} → {usd(result.returnCents)}</span>}
        </> : state.phase === 'betting' && insufficient ? <button disabled={busy} onClick={onMenu}>{shortageLabel}</button> : <>
          {(['P', 'B', 'T'] as Target[]).map(target => <button key={target} aria-label={t('baccarat.bet', { name: names[target] })} title={t('baccarat.bet', { name: names[target] })}
            aria-pressed={state.pendingBet.target === target} disabled={busy || editing || !state.legalActions.includes('setBet')}
            onClick={() => void runAction({ type: 'setBet', target, amountCents: state.pendingBet.amountCents })}>{target}</button>)}
          {editing ? <div className="bet-input-wrap"><input ref={input} className="bet-input" aria-label={t('common.betAmount')} inputMode="decimal" autoComplete="off" spellCheck={false}
            aria-invalid={Boolean(inputError)} value={draft} onChange={e => { setDraft(e.target.value); setInputError(''); }} onBlur={endEdit}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void commitEdit(); } if (e.key === 'Escape') { e.preventDefault(); endEdit(); } }}/></div>
            : <button className="bet-amount" aria-label={t('common.betAmount')} disabled={busy || !state.legalActions.includes('setBet')} onClick={() => void beginEdit()}><output>{usd(state.pendingBet.amountCents)}</output></button>}
          <button aria-label={t('common.deal')} disabled={busy || editing || !state.legalActions.includes('deal')} onClick={() => void runAction({ type: 'deal' })}>{t('common.deal')}</button>
        </>}
    </section>
    <footer role="status" className="baccarat-status" title={inputError || error || status}>{inputError || error || status}</footer>
  </>;
}
