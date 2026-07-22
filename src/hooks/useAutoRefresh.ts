import { useEffect, useRef } from "react";

/**
 * Re-runs `refresh` when the tab regains focus/visibility, on `online` events,
 * and on a polling interval (default 45s). Use as a safety net so screens stay
 * fresh even if a realtime subscription drops (common on iPad Safari which
 * suspends websockets in background tabs).
 */
export function useAutoRefresh(refresh: () => void, intervalMs: number = 45000) {
  const ref = useRef(refresh);
  ref.current = refresh;

  useEffect(() => {
    const tick = () => ref.current?.();
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", tick);
    const id = window.setInterval(tick, intervalMs);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", tick);
      window.clearInterval(id);
    };
  }, [intervalMs]);
}
