import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useChatPanel } from "@/context/ChatPanelContext";
import { subscribeChatAlert, type ChatAlertPayload } from "@/lib/chatAlertBus";

/**
 * Centered modal popup for new chat messages.
 * Shows sender + preview, with a "Read Now" CTA that opens the chat panel.
 */
export function ChatMessageAlertModal() {
  const { openChat } = useChatPanel();
  const [alert, setAlert] = useState<ChatAlertPayload | null>(null);

  useEffect(() => {
    const unsub = subscribeChatAlert((p) => {
      // Always surface the latest message — replace any current alert.
      setAlert(p);
    });
    return () => {
      unsub();
    };
  }, []);

  const handleRead = () => {
    setAlert(null);
    openChat();
  };

  return (
    <Dialog
      open={!!alert}
      onOpenChange={(o) => {
        if (!o) setAlert(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageCircle className="h-7 w-7" />
          </div>
          <DialogTitle className="text-xl">
            New message from {alert?.senderName ?? "a teammate"}
          </DialogTitle>
          <DialogDescription className="text-base">
            {alert?.preview ?? "You have a new chat message."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={() => setAlert(null)}>
            Dismiss
          </Button>
          <Button onClick={handleRead}>Read Now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ChatMessageAlertModal;
