import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  subscribeStatusAlert,
  type StatusAlertPayload,
} from "@/lib/statusAlertBus";

function prettyStatus(s: string) {
  if (!s) return "Offline";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Module-level dedupe set: survives unmount/remount of the modal so the same
// status transition event can never render twice in a single session.
const seenStatusAlertKeys = new Set<string>();
const MAX_SEEN = 500;

function dedupeKey(p: StatusAlertPayload): string {
  // Prefer the explicit tag/id (already stable: status-<userId>-<prev>-><next>).
  // Fall back to composing one from the payload fields if missing.
  return (
    p.tag ||
    p.id ||
    `status:${p.userId}:${p.prev ?? "?"}->${p.next ?? "?"}`
  );
}

/**
 * Centered modal popup for team status changes (online/away/busy/offline).
 * Mirrors the chat alert modal styling.
 */
export function StatusAlertModal() {
  const [alert, setAlert] = useState<StatusAlertPayload | null>(null);
  const currentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = subscribeStatusAlert((p) => {
      const key = dedupeKey(p);
      // Already shown (or currently showing) this exact transition — drop it.
      if (seenStatusAlertKeys.has(key)) return;
      if (currentKeyRef.current === key) return;

      seenStatusAlertKeys.add(key);
      if (seenStatusAlertKeys.size > MAX_SEEN) {
        // Trim oldest entries to keep the set bounded.
        const iter = seenStatusAlertKeys.values();
        for (let i = 0; i < 100; i++) {
          const v = iter.next();
          if (v.done) break;
          seenStatusAlertKeys.delete(v.value as string);
        }
      }
      currentKeyRef.current = key;
      setAlert(p);
    });
    return () => {
      unsub();
    };
  }, []);

  const close = () => {
    currentKeyRef.current = null;
    setAlert(null);
  };


  const level = alert?.level ?? "info";
  const Icon =
    level === "success"
      ? CheckCircle2
      : level === "warning"
      ? AlertTriangle
      : RefreshCw;
  const iconColor =
    level === "success"
      ? "bg-emerald-500/10 text-emerald-600"
      : level === "warning"
      ? "bg-amber-500/10 text-amber-600"
      : "bg-primary/10 text-primary";

  const title = alert
    ? alert.next === "offline"
      ? `${alert.name} is now Offline`
      : alert.prev === "offline"
      ? `${alert.name} is now ${prettyStatus(alert.next)}`
      : `${alert.name} → ${prettyStatus(alert.next)}`
    : "";

  const description = alert
    ? alert.prev && alert.prev !== "offline"
      ? `Was ${prettyStatus(alert.prev)}`
      : "Team availability updated"
    : "";

  return (
    <Dialog
      open={!!alert}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div
            className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full ${iconColor}`}
          >
            <Icon className="h-7 w-7" />
          </div>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="text-base">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default StatusAlertModal;
