import { useEffect, useRef, useState } from "react";
import { AtSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  subscribeMentionAlert,
  type MentionAlertPayload,
} from "@/lib/mentionAlertBus";

const seenKeys = new Set<string>();
const MAX_SEEN = 500;

/**
 * Centered modal popup when the current user is @mentioned in a Task Manager
 * discussion. Mirrors the chat / status alert UX with a "Read Now" CTA that
 * deep-links into the task.
 */
export function MentionAlertModal() {
  const navigate = useNavigate();
  const [alert, setAlert] = useState<MentionAlertPayload | null>(null);
  const currentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = subscribeMentionAlert((p) => {
      const key = p.tag || p.id;
      if (seenKeys.has(key)) return;
      if (currentKeyRef.current === key) return;
      seenKeys.add(key);
      if (seenKeys.size > MAX_SEEN) {
        const iter = seenKeys.values();
        for (let i = 0; i < 100; i++) {
          const v = iter.next();
          if (v.done) break;
          seenKeys.delete(v.value as string);
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

  const handleRead = () => {
    if (!alert) return;
    const id = alert.taskId;
    close();
    navigate(`/tasks?task=${id}`);
  };

  return (
    <Dialog
      open={!!alert}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <AtSign className="h-7 w-7" />
          </div>
          <DialogTitle className="text-xl">
            You were mentioned{alert?.mentionerName ? ` by ${alert.mentionerName}` : ""}
          </DialogTitle>
          <DialogDescription className="text-base space-y-1">
            {alert?.customerName && (
              <div className="font-medium text-foreground">{alert.customerName}</div>
            )}
            {alert?.taskTitle && (
              <div className="text-muted-foreground">{alert.taskTitle}</div>
            )}
            {alert?.preview && (
              <div className="text-sm text-muted-foreground italic pt-1">
                “{alert.preview}”
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={close}>
            Dismiss
          </Button>
          <Button onClick={handleRead}>Read Now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MentionAlertModal;
