import { useLayoutEffect, useRef, useState } from 'react';
import type { AppView } from '../shared/app-contracts';
import { TABLE_LEVELS, type TableLevel } from '../shared/table-levels';
import { compactUsd } from './game-ui';
import { translate, type AppLocale } from '../shared/i18n';

export function LevelPicker({ state, busy, error, locale, onBack, onApply, onRetry }: {
  state: AppView; busy: boolean; error: string; onBack(): void;
  locale: AppLocale;
  onApply(level: TableLevel): Promise<boolean>; onRetry(): Promise<boolean>;
}) {
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
  const [candidate, setCandidate] = useState(state.table.selectedLevel);
  const track = useRef<HTMLDivElement>(null);
  const candidateRef = useRef(candidate);
  candidateRef.current = candidate;
  function center(level: TableLevel) {
    const element = track.current?.children[level - 1] as HTMLElement | undefined;
    if (element && track.current) track.current.scrollLeft = element.offsetLeft + element.offsetWidth / 2 - track.current.clientWidth / 2;
  }
  useLayoutEffect(() => {
    center(candidateRef.current);
    const observer = new ResizeObserver(() => center(candidateRef.current));
    if (track.current) observer.observe(track.current);
    return () => observer.disconnect();
  }, []);
  function browse(direction: -1 | 1) {
    const next = Math.max(1, Math.min(TABLE_LEVELS.length, candidate + direction)) as TableLevel;
    setCandidate(next);
    candidateRef.current = next;
    center(next);
  }
  const selected = candidate === state.table.selectedLevel;
  const level = TABLE_LEVELS[candidate - 1]!;
  const shortage = Math.max(0, level.entryBalanceCents - state.balanceCents);
  return <>
    <section className="level-carousel" aria-label={t('level.selector')}>
      <div className="level-track" aria-label={t('level.list')} ref={track} onScroll={() => {
        const list = track.current;
        if (!list) return;
        const middle = list.scrollLeft + list.clientWidth / 2;
        let nearest = 0, distance = Infinity;
        Array.from(list.children).forEach((item, index) => {
          const element = item as HTMLElement;
          const delta = Math.abs(element.offsetLeft + element.offsetWidth / 2 - middle);
          if (delta < distance) { distance = delta; nearest = index; }
        });
        setCandidate((nearest + 1) as TableLevel);
      }}>
        {TABLE_LEVELS.map(table => {
          const current = table.level === state.table.selectedLevel;
          const missing = Math.max(0, table.entryBalanceCents - state.balanceCents);
          return <article className="level-card" key={table.level} aria-label={t('level.table', { level: table.level })} aria-current={current ? 'true' : undefined}>
            <strong>Lv.{table.level}</strong>
            <span>{t('limits.text', { min: compactUsd(table.minBetCents), max: compactUsd(table.maxBetCents) })}</span>
            <span>{t('level.entry', { amount: compactUsd(table.entryBalanceCents) })}</span>
            <span className="level-card-status">{current ? t('level.selecting') : missing ? t('level.short', { amount: compactUsd(missing) }) : t('level.available')} · {table.level === state.table.bestLevel ? t('level.best') : table.level < state.table.bestLevel ? t('level.achieved') : t('level.locked')}</span>
          </article>;
        })}
      </div>
      <button className="level-prev" aria-label={t('level.previous')} disabled={candidate === 1 || busy || state.saveError} onClick={() => browse(-1)}>‹</button>
      <button className="level-next" aria-label={t('level.next')} disabled={candidate === TABLE_LEVELS.length || busy || state.saveError} onClick={() => browse(1)}>›</button>
    </section>
    <section className="level-actions">
      <button disabled={busy || state.saveError} onClick={onBack}>{t('common.back')}</button>
      <span role="status" title={error || undefined}>{state.saveError ? t('level.saveFailed') : error || `${candidate} / ${TABLE_LEVELS.length}`}</span>
      {state.saveError ? <button disabled={busy} onClick={() => void onRetry()}>{t('common.saveRetry')}</button>
        : <button disabled={busy || selected || shortage > 0 || !state.canNavigate} onClick={() => void onApply(candidate)}>{selected ? t('level.selecting') : t('level.apply')}</button>}
    </section>
  </>;
}
