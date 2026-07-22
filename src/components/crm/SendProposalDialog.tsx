import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Mail, Copy, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Customer } from "@/context/CustomersContext";

const SERVICE_LABELS: Record<string, string> = {
  VA: "Virtual Assistant",
  VR: "Call Answering",
  CL: "Call Answering (Clinic)",
  CB: "Call Answering (Bookings)",
  AI: "AI Call Handling",
  DT: "Digital Typing",
};

type TokenRow = {
  id: string;
  token: string;
  service_type: string;
  status: string;
  expires_at: string;
  created_at: string;
};

interface SendProposalDialogProps {
  lead: Customer | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SendProposalDialog({ lead, isOpen, onClose }: SendProposalDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOpen || !lead?.id) return;
    setRecipient(lead.email || "");
    setMessage("");
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("proposal_tokens")
        .select("id, token, service_type, status, expires_at, created_at")
        .eq("customer_id", lead.id)
        .in("status", ["pending", "sent", "viewed"])
        .order("created_at", { ascending: false });
      if (error) {
        toast({ title: "Could not load proposals", description: error.message, variant: "destructive" });
      } else {
        setTokens((data || []) as TokenRow[]);
      }
      setLoading(false);
    })();
  }, [isOpen, lead?.id]);

  const buildUrl = (token: string) =>
    `https://portal.thevateam.co.uk/proposal/${token}`;

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(buildUrl(token));
    toast({ title: "Link copied" });
  };

  const handleSend = async (row: TokenRow) => {
    if (!recipient) {
      toast({ title: "Email required", description: "Enter a recipient email address.", variant: "destructive" });
      return;
    }
    setSendingId(row.id);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "proposal-link",
          recipientEmail: recipient,
          idempotencyKey: `proposal-link-${row.id}-${Date.now()}`,
          templateData: {
            clientName: lead?.contact || lead?.name || "there",
            serviceLabel: SERVICE_LABELS[row.service_type] || row.service_type,
            proposalUrl: buildUrl(row.token),
            expiresAt: row.expires_at,
            personalMessage: message.trim() || undefined,
          },
        },
      });
      if (error) throw error;
      // BCC: send a copy to info@thevateam.co.uk for monitoring
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "proposal-link",
          recipientEmail: "info@thevateam.co.uk",
          idempotencyKey: `proposal-link-${row.id}-bcc-${Date.now()}`,
          templateData: {
            clientName: `[BCC copy] ${lead?.contact || lead?.name || "there"}`,
            serviceLabel: SERVICE_LABELS[row.service_type] || row.service_type,
            proposalUrl: buildUrl(row.token),
            expiresAt: row.expires_at,
            personalMessage: `BCC copy of proposal sent to ${recipient}.${message.trim() ? ` Original note: ${message.trim()}` : ""}`,
          },
        },
      });
      // Best-effort: mark token as sent
      await supabase
        .from("proposal_tokens")
        .update({ status: "sent" })
        .eq("id", row.id)
        .eq("status", "pending");
      toast({ title: "Proposal sent", description: `Email queued to ${recipient}.` });
    } catch (err: any) {
      toast({ title: "Failed to send", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email proposal to {lead?.contact || lead?.name}</DialogTitle>
          <DialogDescription>
            Send the customer a secure link to review and sign their proposal/contract online.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="recipient">Recipient email</Label>
            <Input
              id="recipient"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="message">Personal message (optional)</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="As discussed on our call earlier today…"
              rows={3}
            />
          </div>

          <div className="border rounded-md divide-y">
            <div className="px-4 py-2 bg-muted/50 text-sm font-medium">
              Available proposals
            </div>
            {loading ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading proposals…
              </div>
            ) : tokens.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                No active proposals for this lead yet. Open the lead's Billing tab to
                create a proposal first, then come back to email it.
              </div>
            ) : (
              tokens.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {SERVICE_LABELS[row.service_type] || row.service_type}
                      </span>
                      <Badge variant="outline" className="capitalize">{row.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Expires {new Date(row.expires_at).toLocaleDateString("en-GB")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(buildUrl(row.token), "_blank")}
                      title="Preview link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(row.token)}
                      title="Copy link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSend(row)}
                      disabled={sendingId === row.id}
                    >
                      {sendingId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      <span className="ml-2">Email</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
