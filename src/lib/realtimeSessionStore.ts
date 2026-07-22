import { useSyncExternalStore } from "react";

/**
 * Tiny external store for the user's realtime-session liveness.
 * Written by useGlobalLiveAlerts, read by RealtimeStatusBadge (and anywhere
 * else the UI wants to reflect realtime health).
 */

export type RealtimeSessionState = {
  isLive: boolean;
  /** ms epoch when we last became live; 0 when never */
  liveSince: number;
  /** ms epoch of the most recent state change */
  updatedAt: number;
};

let state: RealtimeSessionState = {
  isLive: false,
  liveSince: 0,
  updatedAt: Date.now(),
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setRealtimeSession(next: Partial<RealtimeSessionState>) {
  const merged: RealtimeSessionState = {
    ...state,
    ...next,
    updatedAt: Date.now(),
  };
  if (
    merged.isLive === state.isLive &&
    merged.liveSince === state.liveSince
  ) {
    return;
  }
  state = merged;
  emit();
}

export function getRealtimeSession() {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRealtimeSession() {
  return useSyncExternalStore(subscribe, getRealtimeSession, getRealtimeSession);
}
