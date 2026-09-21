import { useLayoutEffect, useRef, useState } from 'react';
import type { AppView } from '../shared/app-contracts';
import { TABLE_LEVELS, type TableLevel } from '../shared/table-levels';
import { compactUsd } from './game-ui';

export function LevelPicker({ state, busy, error, onBack, onApply, onRetry }: {
  state: AppView; busy: boolean; error: string; onBack(): void;
  onApply(level: TableLevel): Promise<boolean>; onRetry(): Promise<boolean>;
}) {
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
    <section className="level-carousel" aria-label="테이블 레벨 선택">
      <div className="level-track" aria-label="테이블 레벨 목록" ref={track} onScroll={() => {
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
          return <article className="level-card" key={table.level} aria-label={`Lv.${table.level} 테이블`} aria-current={current ? 'true' : undefined}>
            <strong>Lv.{table.level}</strong>
            <span>최소 {compactUsd(table.minBetCents)} · 최대 {compactUsd(table.maxBetCents)}</span>
            <span>입장 조건 {compactUsd(table.entryBalanceCents)}</span>
            <span className="level-card-status">{current ? '선택 중' : missing ? `${compactUsd(missing)} 부족` : '입장 가능'} · {table.level === state.table.bestLevel ? '최고 달성' : table.level < state.table.bestLevel ? '달성' : '미달성'}</span>
          </article>;
        })}
      </div>
      <button className="level-prev" aria-label="이전 레벨" disabled={candidate === 1 || busy || state.saveError} onClick={() => browse(-1)}>‹</button>
      <button className="level-next" aria-label="다음 레벨" disabled={candidate === TABLE_LEVELS.length || busy || state.saveError} onClick={() => browse(1)}>›</button>
    </section>
    <section className="level-actions">
      <button disabled={busy || state.saveError} onClick={onBack}>뒤로</button>
      <span role="status" title={error || undefined}>{state.saveError ? '저장 실패' : error || `${candidate} / ${TABLE_LEVELS.length}`}</span>
      {state.saveError ? <button disabled={busy} onClick={() => void onRetry()}>저장 재시도</button>
        : <button disabled={busy || selected || shortage > 0 || !state.canNavigate} onClick={() => void onApply(candidate)}>{selected ? '선택 중' : '적용'}</button>}
    </section>
  </>;
}
