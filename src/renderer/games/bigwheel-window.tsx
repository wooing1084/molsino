import { useEffect, useState, type CSSProperties } from 'react';
import { BIG_WHEEL_RULES, BIG_WHEEL_SEGMENTS } from '../../core/bigwheel/core';
import type { BigWheelView } from '../../shared/bigwheel-view';
import type { PresentationFrame } from '../presentation';
import { wheelSegmentAt } from '../wheel-presentation';

/** The same wheel seen through a fixed aperture; cell identities are physical indices. */
export function BigWheelWindow({ state, presentation }: { state: BigWheelView; presentation: PresentationFrame }) {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  // Only the masked public result may turn a moving preview into a winning cell.
  const result = state.lastResult;
  const position = result ? presentation.wheelPosition ?? result.segmentIndex
    : reduced || state.phase === 'betting' ? 0 : presentation.wheelPosition ?? 0;
  const base = Math.floor(position);
  const fraction = position - base;
  return <div className="bigwheel-window" aria-label="빅휠 세 칸 확대" role="group"
    data-phase={state.phase} data-segment-index={result?.segmentIndex} data-position={position} data-reduced-motion={reduced}>
    <span className="bigwheel-pointer" aria-hidden="true">▼</span>
    <div className="bigwheel-strip" style={{ transform: `translateX(calc(var(--wheel-cell-width) * ${-fraction}))` }}>
      {[-2, -1, 0, 1, 2].map(offset => {
        const occurrence = base + offset;
        const index = wheelSegmentAt(occurrence);
        const rule = BIG_WHEEL_RULES[BIG_WHEEL_SEGMENTS[index]!];
        return <div key={occurrence} className="bigwheel-cell" data-cell-index={index} data-offset={offset} data-center={offset === Math.round(fraction)}
          aria-hidden={!result || Math.abs(offset) > 1}
          aria-label={result && Math.abs(offset) <= 1 ? `${offset === 0 ? '당첨' : offset < 0 ? '왼쪽 이웃' : '오른쪽 이웃'} ${rule.name} · 순이익 ${rule.payout}:1` : undefined}
          style={{ '--wheel-offset': offset, opacity: 1 - .58 * Math.min(1, Math.abs(offset - fraction)) } as CSSProperties}>
          <span className="bigwheel-cell-name">{rule.name}</span>
          <span className="bigwheel-cell-payout">{rule.payout}:1</span>
        </div>;
      })}
    </div>
  </div>;
}
