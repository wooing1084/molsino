import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppView } from '../shared/app-contracts';
import { PresentationTimeline, type PresentationFrame } from './presentation';

export function usePresentation(expanded: boolean) {
  const timeline = useRef(new PresentationTimeline());
  const latest = useRef<AppView | undefined>(undefined);
  const visible = useRef(expanded);
  visible.current = expanded;
  const [frame, setFrame] = useState<PresentationFrame>();
  const receive = useCallback((view: AppView) => {
    latest.current = view;
    setFrame(timeline.current.receive(view, performance.now(), !visible.current || document.visibilityState === 'hidden'));
  }, []);
  const snap = useCallback(() => {
    if (latest.current) setFrame(timeline.current.snap(performance.now()));
  }, []);
  const setVisibility = useCallback((isExpanded: boolean) => {
    const wasExpanded = visible.current;
    visible.current = isExpanded;
    // Native hide/restore pushes can share a React batch. Consume their boundary
    // here, before rendering, so the intermediate hidden state cannot be lost.
    if (!isExpanded || !wasExpanded) snap();
  }, [snap]);
  useEffect(() => {
    if (frame?.nextWakeAt === undefined) return;
    // Timers may wake fractionally before the deadline. Re-arm for every frame,
    // even when advance() returns the same deadline, and round the wait upward.
    const timer = window.setTimeout(() => setFrame(timeline.current.advance(performance.now())), Math.max(1, Math.ceil(frame.nextWakeAt - performance.now())));
    return () => window.clearTimeout(timer);
  }, [frame]);
  useEffect(() => { if (!expanded) snap(); }, [expanded, snap]);
  useEffect(() => {
    document.addEventListener('visibilitychange', snap);
    window.addEventListener('pagehide', snap);
    return () => {
      document.removeEventListener('visibilitychange', snap);
      window.removeEventListener('pagehide', snap);
    };
  }, [snap]);
  return { frame, receive, setVisibility };
}
