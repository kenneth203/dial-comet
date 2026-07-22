import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Customer } from "@/context/CustomersContext";

interface SendQuestionnaireDialogProps {
  lead: Customer | null;
  isOpen: boolean;
  onClose: () => void;
}

type FormTemplate = { id: string; name: string };

export function SendQuestionnaireDialog({ lead, isOpen, onClose }: SendQuestionnaireDialogProps) {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [recipient, setRecipient] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setRecipient(lead?.email || "");
    setTemplateId("");
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("form_templates")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) {
        toast({ title: "Could not load questionnaires", description: error.message, variant: "destructive" });
      } else {
        setTemplates((data || []) as FormTemplate[]);
      }
      setLoading(false);
    })();
  }, [isOpen, lead?.id, lead?.email]);

  const handleSend = async () => {
    if (!lead?.id) return;
    if (!templateId) {
      toast({ title: "Select a questionnaire", variant: "destructive" });
      return;
    }
    if (!recipient || !recipient.includes("@")) {
      toast({ title: "Invalid email", description: "Please enter a valid recipient email.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: sub, error: subErr } = await supabase
        .from("form_submissions")
        .insert({
          form_template_id: templateId,
          customer_id: lead.id,
          data: { sent_by: user.id, status: "pending" },
        } as any)
        .select("id")
        .single();
      if (subErr) throw subErr;

      const tpl = templates.find((t) => t.id === templateId);
      const formUrl = `https://portal.thevateam.co.uk/form/${(sub as any).id}`;

      const { error: emailErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "customer-form-link",
          recipientEmail: recipient,
          idempotencyKey: `form-link-${(sub as any).id}`,
          templateData: {
            clientName: lead.contact || lead.name || "",
            formName: tpl?.name || "Onboarding questionnaire",
            formUrl,
          },
        },
      });
      if (emailErr) throw emailErr;

      // BCC: send a copy to info@thevateam.co.uk for monitoring
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "customer-form-link",
          recipientEmail: "info@thevateam.co.uk",
          idempotencyKey: `form-link-${(sub as any).id}-bcc`,
          templateData: {
            clientName: `[BCC copy — original to ${recipient}] ${lead.contact || lead.name || ""}`,
            formName: tpl?.name || "Onboarding questionnaire",
            formUrl,
          },
        },
      });

      toast({ title: "Questionnaire sent", description: `Email queued to ${recipient}.` });
      onClose();
    } catch (err: any) {
      toast({ title: "Failed to send", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email questionnaire to {lead?.contact || lead?.name}</DialogTitle>
          <DialogDescription>
            Send the customer a branded welcome email with a secure link to complete their onboarding questionnaire.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="questionnaire">Questionnaire</Label>
            <Select value={templateId} onValueChange={setTemplateId} disabled={loading}>
              <SelectTrigger id="questionnaire">
                <SelectValue placeholder={loading ? "Loading…" : "Select a questionnaire"} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
                {!loading && templates.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No active questionnaires. Create one in CRM → Forms.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

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

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending || !templateId}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              <span className="ml-2">Send questionnaire</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
