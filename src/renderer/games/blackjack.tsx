import { useEffect, useRef, useState } from 'react';
import type { GameViewState, OverlayViewState, SettlementOutcome } from '../../shared/contracts';
import type { AppView, BlackjackAction } from '../../shared/app-contracts';
import { parseBetInput, type BetInputError } from '../../shared/bet-input';
import { translate, type AppLocale, type I18nKey } from '../../shared/i18n';
import { CardFace, TableLimits } from '../game-ui';
import { visibleBlackjackScore, type PresentationFrame } from '../presentation';
const usd = (value: number) => `$${(value / 100).toFixed(2)}`;
const signedUsd = (value: number) => `${value >= 0 ? '+' : '−'}${usd(Math.abs(value))}`;
const outcomeKeys: Record<SettlementOutcome, I18nKey> = {
  win: 'blackjack.outcome.win', loss: 'blackjack.outcome.loss', push: 'blackjack.outcome.push',
  blackjack: 'blackjack.outcome.blackjack', bust: 'blackjack.outcome.bust', surrender: 'blackjack.outcome.surrender',
  'insurance-win': 'blackjack.outcome.insurance-win', 'insurance-loss': 'blackjack.outcome.insurance-loss',
  'even-money': 'blackjack.outcome.even-money',
};
const betInputKeys: Record<BetInputError, I18nKey> = {
  required: 'betInput.required', format: 'betInput.format', tooLarge: 'betInput.tooLarge',
  belowMinimum: 'betInput.belowMinimum', aboveMaximum: 'betInput.aboveMaximum', balance: 'betInput.balance',
};

export function BlackjackGame({ state, busy: commandBusy, error, locale, runAction, onRetry, onMenu, overlayView, table, presentation }: {
  state: GameViewState & { internalError?: string }; busy: boolean; error: string;
  locale: AppLocale;
  runAction(action: BlackjackAction): Promise<boolean>; onRetry(): Promise<boolean>; onMenu(): void;
  overlayView: OverlayViewState;
  table: AppView['table']; presentation: PresentationFrame;
}) {
  const t = (key: I18nKey, values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
  const busy = commandBusy || presentation.revealing;
  const minimum = table.minBetCents;
  const maximum = Math.min(state.balanceCents, table.maxBetCents);
  const betStep = Math.max(state.betStepCents, minimum);
  const insufficient = state.balanceCents < minimum;
  const shortageLabel = state.balanceCents < 100 ? t('shortage.startOver') : t('shortage.lowerLevel');
  const [betEditing, setBetEditing] = useState(false);
  const [betDraft, setBetDraft] = useState('');
  const [betError, setBetError] = useState('');
  const betEditingRef = useRef(false);
  const betInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setBetError(''); }, [locale]);
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
    } catch { setBetError(t('bet.editUnavailable')); }
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
    if (!parsed.ok) {
      const amount = parsed.error === 'belowMinimum' ? usd(table.minBetCents) : usd(table.maxBetCents);
      setBetError(t(betInputKeys[parsed.error], { amount }));
      return;
    }
    if (await runAction({ type: 'setBet', amountCents: parsed.cents })) endBetEdit();
  }

  useEffect(() => {
    if (betEditing && (state?.phase !== 'betting' || insufficient
      || state.saveError || overlayView.visibility !== 'expanded')) endBetEdit();
  }, [betEditing, state?.phase, insufficient, state?.saveError, overlayView.visibility]);

  const activeHand = state?.playerHands.find(hand => hand.active);
  const can = (action: GameViewState['legalActions'][number]) => state?.legalActions.includes(action) ?? false;
  const controls = state.saveError ? <button className="wide" disabled={commandBusy} onClick={() => void onRetry()}>{t('common.saveRetry')}</button>
    : state.internalError ? <span>{t('common.progressError')}</span>
    : presentation.revealing ? <span>{t('common.revealing')}</span>
    : state.phase === 'betting' ? insufficient
    ? <button className="wide" disabled={busy} onClick={onMenu}>{shortageLabel}</button>
    : <>
      <span>BET</span>
      <button aria-label={t('bet.decrease')} disabled={busy || betEditing || state.pendingBetCents <= minimum} onClick={() => changeBet(-betStep)}>−</button>
      {betEditing ? <div className="bet-input-wrap">
        <input ref={betInputRef} className="bet-input" type="text" inputMode="decimal" aria-label={t('common.betAmount')}
          aria-invalid={Boolean(betError)} value={betDraft} spellCheck={false} autoComplete="off"
          onChange={event => { setBetDraft(event.currentTarget.value); setBetError(''); }}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); void commitBetEdit(); }
            if (event.key === 'Escape') { event.preventDefault(); endBetEdit(); }
          }}
          onBlur={endBetEdit}/>
        {betError && <span className="bet-input-error" title={betError} aria-label={betError}>!</span>}
      </div> : <button className="bet-amount" aria-label={t('common.betAmount')} disabled={busy} onClick={() => void beginBetEdit()}><output>{usd(state.pendingBetCents)}</output></button>}
      <button aria-label={t('bet.increase')} disabled={busy || betEditing || state.pendingBetCents >= maximum} onClick={() => changeBet(betStep)}>+</button>
      <button aria-label={t('common.deal')} disabled={busy || betEditing || !can('deal')} onClick={() => void runAction({ type: 'deal' })}>{t('common.deal')}</button>
    </>
    : state.phase === 'insuranceDecision' ? can('acceptEvenMoney')
      ? <>
        <button className="wide" disabled={busy} onClick={() => void runAction({ type: 'acceptEvenMoney' })}>{t('blackjack.evenMoney')}</button>
        <button className="wide" disabled={busy} onClick={() => void runAction({ type: 'keepBlackjack' })}>{t('blackjack.keep')}</button>
      </>
      : <>
        <button className="wide" disabled={busy || !state.insurance || state.insurance.maxWagerCents < 50} onClick={() => void runAction({ type: 'chooseInsurance', amountCents: state.insurance?.maxWagerCents ?? 0 })}>{t('blackjack.insurance', { amount: usd(state.insurance?.maxWagerCents ?? 0) })}</button>
        <button className="wide" disabled={busy} onClick={() => void runAction({ type: 'chooseInsurance', amountCents: 0 })}>{t('blackjack.decline')}</button>
      </>
    : state.phase === 'playerTurn' && activeHand ? <>
      <button disabled={busy || !can('hit')} onClick={() => void runAction({ type: 'hit', handId: activeHand.handId })}>{t('blackjack.hit')}</button>
      <button disabled={busy || !can('stand')} onClick={() => void runAction({ type: 'stand', handId: activeHand.handId })}>{t('blackjack.stand')}</button>
      {can('doubleDown') && <button disabled={busy} onClick={() => void runAction({ type: 'doubleDown', handId: activeHand.handId })}>{t('blackjack.double')}</button>}
      {can('split') && <button disabled={busy} onClick={() => void runAction({ type: 'split', handId: activeHand.handId })}>{t('blackjack.split')}</button>}
      {can('surrender') && <button disabled={busy} onClick={() => void runAction({ type: 'surrender', handId: activeHand.handId })}>{t('blackjack.surrender')}</button>}
    </>
    : state.phase === 'result'
      ? insufficient
        ? <button className="wide" disabled={busy} onClick={onMenu}>{shortageLabel}</button>
        : <button className="wide" disabled={busy} onClick={() => void runAction({ type: 'nextRound' })}>{t('common.nextRound')}</button>
      : <span>{t('blackjack.dealerProgress')}</span>;

  const status = !state ? t('blackjack.connection')
    : state.saveError ? t('blackjack.saveFailure')
    : presentation.revealing ? t('common.revealing')
    : state.phase === 'recovery' ? state.recovery?.issue === 'futureSchema'
      ? t('blackjack.futureSave')
      : t('blackjack.corruptSave')
    : (state.phase === 'betting' || state.phase === 'result') && insufficient
      ? t('status.insufficient', { action: shortageLabel })
    : state.phase === 'result' && state.lastResult ? t('blackjack.round', { amount: signedUsd(state.lastResult.netCents) })
    : state.phase === 'insuranceDecision' ? t('blackjack.insurancePrompt')
    : state.phase === 'playerTurn' ? t('blackjack.actionPrompt')
    : state.phase === 'betting' ? t('blackjack.betPrompt')
    : t('blackjack.dealerProgress');

  return <>
    <section className="cards" aria-label={t('blackjack.cards')}>
      {state?.dealerHand.cards.length ? <div className="hand dealer" aria-label={t('blackjack.dealerHand')}><small>DEALER {state.dealerHand.cards.some(card => presentation.revealedCardIds.has(card.cardId)) ? visibleBlackjackScore(state.dealerHand.cards, presentation.revealedCardIds).total : '–'}</small><div>{state.dealerHand.cards.filter((_, index) => index === 0 || presentation.holePlaced).map(card => <CardFace card={card} presentation={presentation} key={card.cardId}/>)}{presentation.holePlaced && state.dealerHand.hiddenCardCount > 0 && <span className="card" data-revealed="false">?</span>}</div></div> : <p>{t('blackjack.introFirst')}<br/>{t('blackjack.introSecond')}</p>}
      {state?.playerHands.map(hand => {
        const result = state.lastResult?.entries.find(entry => entry.componentId === hand.handId);
        const score = visibleBlackjackScore(hand.cards, presentation.revealedCardIds);
        return <div className={`hand player ${hand.active ? 'active' : ''}`} key={hand.handId}>
          <small>{hand.active ? 'YOU · ' : ''}{score.total || '–'}{score.isSoft ? 's' : ''} · {usd(hand.wagerCents)}{result ? ` · ${t(outcomeKeys[result.outcome])}` : ''}</small>
          <div>{hand.cards.map(card => <CardFace card={card} presentation={presentation} key={card.cardId}/>)}</div>
        </div>;
      })}
    </section>
    <TableLimits table={table} locale={locale}/>
    <section className="bet actions">{controls}</section>
    <footer role="status" title={betError || error || status}>{betError || error || status}</footer>
  </>;
}
