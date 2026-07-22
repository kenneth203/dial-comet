// Event bus for centered status-change popups.
export type StatusAlertLevel = "info" | "success" | "warning";

export type StatusAlertPayload = {
  id: string;
  userId: string;
  name: string;
  prev: string;
  next: string;
  level: StatusAlertLevel;
  tag: string;
};

type Listener = (p: StatusAlertPayload) => void;
const listeners = new Set<Listener>();

export function emitStatusAlert(payload: StatusAlertPayload) {
  listeners.forEach((l) => {
    try {
      l(payload);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeStatusAlert(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
