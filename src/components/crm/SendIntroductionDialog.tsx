import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Loader2, Eye, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Customer, CustomerContact } from "@/context/CustomersContext";
import { EmailHtmlPreview } from "@/components/crm/email-preview";


interface SendIntroductionDialogProps {
  lead: Customer | null;
  isOpen: boolean;
  onClose: () => void;
}

const CUSTOM_VALUE = "__custom__";
const TEMPLATE_NAME = "lead-introduction";

const DEFAULT_SUBJECT = "An introduction to The VA Team — tailored call answering & admin support";
const DEFAULT_BODY = [
  "I hope you're well.",
  "I wanted to introduce The VA Team. We are not your normal call answering service. We provide tailored customer service, call handling, diary support and admin solutions built around the way your business works.",
  "Whether you need help answering calls, booking appointments, managing enquiries, supporting your team during busy periods, or making sure no opportunity is missed, we create a service that fits your business rather than forcing you into a standard package.",
  "For clinics, our first three booking packages are:\n- Starter 25: 25 calls from £99 + VAT per month\n- Business 40: 40 calls from £150 + VAT per month\n- Professional 60: 60 calls from £195 + VAT per month",
  "Packages are fully scalable, so we can increase or adjust your support as your business grows or your call volume changes.",
  "Would you be open to a short [discovery call](https://calendar.app.google/YrNFetLnzNej3P5q9)? It would be a chance to understand your business, your current challenges and how The VA Team could support you.",
  "You can reply directly to this email at info@thevateam.co.uk and one of our team will come straight back to you.",
].join("\n\n");
const DEFAULT_SIGNATURE = [
  "Yours sincerely,",
  "Kenneth Pote",
  "The VA Team Limited",
  "Phone: 0203 474 0859",
  "Email: info@thevateam.co.uk",
  "Website: https://www.thevateam.co.uk",
].join("\n");

function fullName(contact: CustomerContact): string {
  return `${contact.firstName ?? ""} ${contact.surname ?? ""}`.trim();
}

function toParagraphs(input: string): string[] {
  return input.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

// Render markdown [label](url), bare URLs, and emails as anchors. Other text plain.
function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = tokenRe.exec(line)) !== null) {
    if (match.index > lastIndex) nodes.push(line.slice(lastIndex, match.index));
    const [, mdLabel, mdHref, bareUrl, email] = match;
    const cls = "text-[#1c477a] underline";
    if (mdLabel && mdHref) {
      nodes.push(<a key={`${keyPrefix}-${idx}`} href={mdHref} target="_blank" rel="noreferrer" className={cls}>{mdLabel}</a>);
    } else if (bareUrl) {
      nodes.push(<a key={`${keyPrefix}-${idx}`} href={bareUrl} target="_blank" rel="noreferrer" className={cls}>{bareUrl}</a>);
    } else if (email) {
      nodes.push(<a key={`${keyPrefix}-${idx}`} href={`mailto:${email}`} className={cls}>{email}</a>);
    }
    idx += 1;
    lastIndex = tokenRe.lastIndex;
  }
  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
  return nodes;
}

function renderParagraph(p: string, keyPrefix: string) {
  const lines = p.split("\n");
  return lines.map((line, i) => (
    <span key={`${keyPrefix}-${i}`}>
      {i > 0 ? <br /> : null}
      {renderInline(line, `${keyPrefix}-${i}`)}
    </span>
  ));
}

interface TemplateVariant {
  id: string;
  template_name: string;
  display_label: string | null;
  subject: string;
  body_text: string;
  signature_text: string | null;
}

export function SendIntroductionDialog({ lead, isOpen, onClose }: SendIntroductionDialogProps) {
  const [sending, setSending] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>(CUSTOM_VALUE);
  const [recipient, setRecipient] = useState("");
  const [addresseeName, setAddresseeName] = useState("");
  const [addresseePosition, setAddresseePosition] = useState("");
  const [greetingFormat, setGreetingFormat] = useState<"name" | "position" | "custom">("name");
  const [customGreeting, setCustomGreeting] = useState("");
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<"compose" | "preview">("compose");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [variants, setVariants] = useState<TemplateVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [bodyText, setBodyText] = useState(DEFAULT_BODY);
  const [signatureText, setSignatureText] = useState(DEFAULT_SIGNATURE);

  // Show every non-hidden contact, even if they don't have an email saved.
  // If a contact has no email we fall back to the customer-level email when selected.
  const eligibleContacts = useMemo(
    () => (lead?.contacts ?? []).filter((c) => !c.hidden && (fullName(c) || c.email)),
    [lead?.contacts],
  );

  useEffect(() => {
    if (!isOpen || !lead) return;
    setMessage("");
    setStep("compose");
    setGreetingFormat("name");
    setCustomGreeting("");

    // Prefer the first contact that already has an email; otherwise the first
    // contact at all; otherwise free-text using the customer-level email.
    const firstWithEmail = eligibleContacts.find((c) => c.email && c.email.includes("@"));
    const first = firstWithEmail ?? eligibleContacts[0];
    if (first) {
      setSelectedContactId(first.id);
      setRecipient(first.email && first.email.includes("@") ? first.email : (lead.email || ""));
      setAddresseeName(fullName(first) || lead.contact || "");
      setAddresseePosition(first.position || "");
    } else {
      setSelectedContactId(CUSTOM_VALUE);
      setRecipient(lead.email || "");
      // Default to the customer-level contact name — never the business name.
      setAddresseeName(lead.contact || "");
      setAddresseePosition("");
    }

    // Load all introduction templates so the user can pick one.
    (async () => {
      setLoadingTemplate(true);
      const { data } = await supabase
        .from("email_template_content" as any)
        .select("id, template_name, display_label, category, subject, body_text, signature_text")
        .or(`category.eq.lead-introduction,template_name.eq.${TEMPLATE_NAME}`)
        .order("template_name", { ascending: true });
      const rows = (data ?? []) as unknown as TemplateVariant[];
      setVariants(rows);
      const seed = rows.find((r) => r.template_name === TEMPLATE_NAME) ?? rows[0];
      if (seed) {
        setSelectedVariantId(seed.id);
        setSubject(seed.subject ?? DEFAULT_SUBJECT);
        setBodyText(seed.body_text ?? DEFAULT_BODY);
        setSignatureText(seed.signature_text ?? DEFAULT_SIGNATURE);
      } else {
        setSelectedVariantId("");
        setSubject(DEFAULT_SUBJECT);
        setBodyText(DEFAULT_BODY);
        setSignatureText(DEFAULT_SIGNATURE);
      }
      setLoadingTemplate(false);
    })();
  }, [isOpen, lead, eligibleContacts]);

  const handleVariantChange = (id: string) => {
    setSelectedVariantId(id);
    const v = variants.find((x) => x.id === id);
    if (v) {
      setSubject(v.subject ?? DEFAULT_SUBJECT);
      setBodyText(v.body_text ?? DEFAULT_BODY);
      setSignatureText(v.signature_text ?? DEFAULT_SIGNATURE);
    }
  };

  const handleContactChange = (value: string) => {
    setSelectedContactId(value);
    if (value === CUSTOM_VALUE) {
      if (!recipient) setRecipient(lead?.email || "");
      if (!addresseeName) setAddresseeName(lead?.contact || "");
      return;
    }
    const contact = eligibleContacts.find((c) => c.id === value);
    if (contact) {
      if (contact.email && contact.email.includes("@")) {
        setRecipient(contact.email);
      } else if (!recipient) {
        setRecipient(lead?.email || "");
      }
      setAddresseeName(fullName(contact) || lead?.contact || "");
      setAddresseePosition(contact.position || "");
    }
  };

  // Greeting always prefers a person's name; the business name is never used.
  const greetingName = useMemo(() => {
    if (greetingFormat === "custom") {
      return customGreeting.trim() || addresseeName.trim() || lead?.contact || "there";
    }
    if (greetingFormat === "position") {
      return addresseePosition.trim() || addresseeName.trim() || lead?.contact || "there";
    }
    return addresseeName.trim() || lead?.contact || "there";
  }, [greetingFormat, customGreeting, addresseeName, addresseePosition, lead?.contact]);


  const handlePreview = () => {
    if (!recipient || !recipient.includes("@")) {
      toast({ title: "Email required", description: "Enter a valid recipient email address.", variant: "destructive" });
      return;
    }
    setStep("preview");
  };

  const handleSend = async () => {
    if (!lead) return;
    setSending(true);
    try {
      const variant = variants.find((v) => v.id === selectedVariantId);
      // Always render through the registered 'lead-introduction' template, but
      // pass the chosen variant's wording as overrides so any number of intro
      // variants can be sent without changes to the server template registry.
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: TEMPLATE_NAME,
          recipientEmail: recipient,
          replyTo: "info@thevateam.co.uk",
          idempotencyKey: `lead-intro-${lead.id}-${variant?.template_name ?? TEMPLATE_NAME}-${recipient.toLowerCase()}-${Date.now()}`,
          templateData: {
            clientName: greetingName,
            personalMessage: message.trim() || undefined,
            subjectOverride: variant?.subject ?? subject,
            bodyText: variant?.body_text ?? bodyText,
            signatureText: variant?.signature_text ?? signatureText,
          },
        },
      });
      if (error) throw error;
      toast({
        title: "Introduction sent",
        description: `Email queued to ${greetingName} <${recipient}>. Replies go to info@thevateam.co.uk.`,
      });
      onClose();
    } catch (err: any) {
      toast({ title: "Failed to send", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };


  const bodyIsHtml = useMemo(() => /<\/?[a-z][\s\S]*?>/i.test(bodyText || ""), [bodyText]);
  const bodyParagraphs = useMemo(
    () => (bodyIsHtml ? [] : toParagraphs(bodyText || DEFAULT_BODY)),
    [bodyText, bodyIsHtml],
  );
  const signatureParagraphs = useMemo(
    () => (signatureText && signatureText.trim() ? toParagraphs(signatureText) : null),
    [signatureText],
  );

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "compose" ? "Send introduction email" : "Preview introduction email"}
          </DialogTitle>
          <DialogDescription>
            {step === "compose"
              ? <>Pick a contact from {lead?.name || "this customer"} to address the email to. The greeting (<em>Dear …</em>) uses the contact's name automatically. Replies go to <strong>info@thevateam.co.uk</strong>.</>
              : <>Review the subject, greeting, body, and links below. Click <strong>Back</strong> to edit, or <strong>Send</strong> to dispatch.</>}
          </DialogDescription>
        </DialogHeader>

        {step === "compose" ? (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="template-variant">Introduction template</Label>
              <Select
                value={selectedVariantId}
                onValueChange={handleVariantChange}
                disabled={loadingTemplate || variants.length === 0}
              >
                <SelectTrigger id="template-variant">
                  <SelectValue placeholder={loadingTemplate ? "Loading…" : "Choose a template"} />
                </SelectTrigger>
                <SelectContent>
                  {variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.display_label || v.template_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Manage these in CRM → Email templates. The preview below uses the chosen template's wording.
              </p>
            </div>

            <div className="grid gap-2">

              <Label htmlFor="contact">Send to contact</Label>
              <Select value={selectedContactId} onValueChange={handleContactChange}>
                <SelectTrigger id="contact">
                  <SelectValue placeholder="Choose a contact" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleContacts.map((c) => {
                    const name = fullName(c) || c.email || "Unnamed contact";
                    const hasEmail = !!(c.email && c.email.includes("@"));
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {name}
                        {c.position ? ` — ${c.position}` : ""}{" "}
                        {hasEmail ? `(${c.email})` : "(no email — uses customer email)"}
                      </SelectItem>
                    );
                  })}
                  <SelectItem value={CUSTOM_VALUE}>Other / type manually…</SelectItem>
                </SelectContent>
              </Select>
              {eligibleContacts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No saved contacts on this customer profile. Add one on the customer profile, or type details below.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="addressee">Address as (Dear …)</Label>
                <Input
                  id="addressee"
                  value={addresseeName}
                  onChange={(e) => { setAddresseeName(e.target.value); setSelectedContactId(CUSTOM_VALUE); }}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="recipient">Recipient email</Label>
                <Input
                  id="recipient"
                  type="email"
                  value={recipient}
                  onChange={(e) => { setRecipient(e.target.value); setSelectedContactId(CUSTOM_VALUE); }}
                  placeholder="customer@example.com"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Greeting format</Label>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-3">
                <Select value={greetingFormat} onValueChange={(v) => setGreetingFormat(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">
                      Dear {addresseeName.trim() || "{contact name}"}
                    </SelectItem>
                    <SelectItem value="position" disabled={!addresseePosition.trim()}>
                      Dear {addresseePosition.trim() || "{position — none set}"}
                    </SelectItem>
                    <SelectItem value="custom">Dear (custom)…</SelectItem>
                  </SelectContent>
                </Select>
                {greetingFormat === "custom" && (
                  <Input
                    value={customGreeting}
                    onChange={(e) => setCustomGreeting(e.target.value)}
                    placeholder="e.g. Team, Reception, Sir/Madam"
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Preview: <strong>Dear {greetingName},</strong>
                {" "}— the greeting always uses a person or role, never the business name.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="message">Personal message (optional)</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Lovely to speak earlier — here is the overview as promised."
                rows={3}
              />
            </div>


            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
              <Button onClick={handlePreview} disabled={sending || loadingTemplate}>
                {loadingTemplate ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                Preview
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
              <div><span className="text-muted-foreground">To:</span> <strong>{greetingName}</strong> &lt;{recipient}&gt;</div>
              <div><span className="text-muted-foreground">Reply-to:</span> info@thevateam.co.uk</div>
              <div><span className="text-muted-foreground">Subject:</span> <strong>{subject}</strong></div>
            </div>

            <div className="rounded-md border bg-white p-5 max-h-[55vh] overflow-y-auto" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", color: "#55575d", fontSize: 14, lineHeight: 1.6 }}>
              <p style={{ margin: "0 0 15px" }}>Dear {greetingName},</p>

              {message.trim() ? (
                <div style={{ margin: "0 0 20px", padding: "12px 16px", borderLeft: "3px solid #1c477a", background: "#f5f7fa", color: "#1c477a", fontStyle: "italic" }}>
                  {message.trim()}
                </div>
              ) : null}

              {bodyIsHtml ? (
                <EmailHtmlPreview html={bodyText} />
              ) : (
                bodyParagraphs.map((p, i) => (
                  <p key={`body-${i}`} style={{ margin: "0 0 15px", whiteSpace: "pre-wrap" }}>{renderParagraph(p, `body-${i}`)}</p>
                ))
              )}

              {signatureParagraphs ? (
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #e5e7eb", fontSize: 13, lineHeight: 1.5 }}>
                  {signatureParagraphs.map((p, i) => (
                    <p key={`sig-${i}`} style={{ margin: "0 0 4px" }}>{renderParagraph(p, `sig-${i}`)}</p>
                  ))}
                </div>
              ) : (
                <p className="mt-6 text-xs text-muted-foreground italic">
                  (Built-in branded signature block will be appended.)
                </p>
              )}
            </div>


            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("compose")} disabled={sending}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
                <Button onClick={handleSend} disabled={sending}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  Send introduction
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
