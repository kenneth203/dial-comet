// Tiny event bus for in-app chat message popups.
export type ChatAlertPayload = {
  id: string;
  senderName: string;
  preview: string;
  roomId?: string | null;
};

type Listener = (p: ChatAlertPayload) => void;
const listeners = new Set<Listener>();

export function emitChatAlert(payload: ChatAlertPayload) {
  listeners.forEach((l) => {
    try {
      l(payload);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeChatAlert(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
