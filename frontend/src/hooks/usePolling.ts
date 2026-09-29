import { useEffect, useRef } from "react";

/**
 * Run `callback` every `intervalMs` while the tab is visible.
 *
 * A hidden tab stops polling entirely, and becoming visible again triggers an
 * immediate refresh, so a screen that was in the background is never stale
 * but also never burns requests nobody is looking at.
 */
export function usePolling(callback: () => void, intervalMs: number, enabled = true) {
  const saved = useRef(callback);

  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => saved.current(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        saved.current();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
