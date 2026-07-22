// Event bus for centered @mention popups (Task Manager discussion).
export type MentionAlertPayload = {
  id: string;
  taskId: string;
  taskTitle: string;
  customerName?: string | null;
  mentionerName?: string | null;
  preview?: string | null;
  tag: string;
};

type Listener = (p: MentionAlertPayload) => void;
const listeners = new Set<Listener>();

export function emitMentionAlert(payload: MentionAlertPayload) {
  listeners.forEach((l) => {
    try {
      l(payload);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeMentionAlert(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
