import { useCallback, useEffect, useRef, useState } from 'react';
import type { OverlayViewState } from '../shared/contracts';

function validOverlayView(value: OverlayViewState): boolean {
  return value !== null && typeof value === 'object'
    && Number.isSafeInteger(value.revision) && value.revision >= 0
    && ['expanded', 'collapsed', 'hidden'].includes(value.visibility)
    && Number.isInteger(value.opacityPercent) && value.opacityPercent >= 20 && value.opacityPercent <= 100
    && value.opacityPercent % 5 === 0 && typeof value.opacityPopoverVisible === 'boolean'
    && (value.locale === 'ko' || value.locale === 'en');
}

/** The first accepted native view supplies the locale before any translated UI is committed. */
export function useOverlayView(onApply?: (view: OverlayViewState) => void) {
  const [view, setView] = useState<OverlayViewState>();
  const [loadError, setLoadError] = useState(false);
  const latest = useRef<OverlayViewState | undefined>(undefined);
  const mounted = useRef(false);
  const observer = useRef(onApply);
  observer.current = onApply;

  const apply = useCallback((next: OverlayViewState): void => {
    if (!mounted.current || !validOverlayView(next) || latest.current && next.revision < latest.current.revision) return;
    // This runs before React can expose controls or accessibility names in this language.
    document.documentElement.lang = next.locale;
    latest.current = next;
    observer.current?.(next);
    setView(next);
    setLoadError(false);
  }, []);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    const receive = (next: OverlayViewState) => { if (active) apply(next); };
    const failed = () => { if (active && !latest.current) setLoadError(true); };
    const unsubscribe = window.molsino.onOverlayState(receive);
    void window.molsino.getOverlayState().then(next => {
      if (!active) return;
      if (validOverlayView(next)) apply(next);
      else failed();
    }).catch(failed);
    return () => {
      active = false;
      mounted.current = false;
      unsubscribe();
    };
  }, [apply]);

  return { view, loadError, apply };
}
