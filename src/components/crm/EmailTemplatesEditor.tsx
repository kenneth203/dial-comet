import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Save, RotateCcw, Plus, Trash2, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { EmailHtmlPreview } from "@/components/crm/email-preview";


// Treat content as already-HTML if it contains any tags. Older templates were
// stored as plain text with markdown-style links — convert those to simple
// HTML so the Word-style editor can open them without losing paragraphs.
function looksLikeHtml(input: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(input);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plainTextToHtml(text: string): string {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Convert "- item" lines into a <ul> when a whole block is a bullet list.
      const lines = trimmed.split("\n");
      const allBullets = lines.every((l) => /^\s*-\s+/.test(l));
      if (allBullets && lines.length > 1) {
        const items = lines
          .map((l) => `<li>${linkify(escapeHtml(l.replace(/^\s*-\s+/, "")))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      // Each line becomes its own <p> so the rich editor treats them as
      // separate blocks (bullet/indent then only affect the selected lines,
      // not the entire paragraph).
      return lines
        .map((l) => `<p>${linkify(escapeHtml(l)) || "<br/>"}</p>`)
        .join("");

    })
    .join("");
}

// Turn [label](url), bare URLs and email addresses into anchors. Input must
// already be HTML-escaped.
function linkify(escaped: string): string {
  return escaped
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(
      /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
      '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>',
    )
    .replace(
      /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
      '<a href="mailto:$1">$1</a>',
    );
}

function toEditorHtml(stored: string | null | undefined): string {
  const v = stored ?? "";
  if (!v) return "";
  return looksLikeHtml(v) ? v : plainTextToHtml(v);
}

const CATEGORY = "lead-introduction";
const SEED_KEY = "lead-introduction";

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

const DEFAULT_SUBJECT = "An introduction to The VA Team — tailored call answering & admin support";

interface TemplateRow {
  id: string;
  template_name: string;
  display_label: string | null;
  category: string | null;
  subject: string;
  body_text: string;
  signature_text: string | null;
  updated_at: string | null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "template";
}

export function EmailTemplatesEditor() {
  const { isSuperAdmin } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Editable fields for the currently selected template
  const [label, setLabel] = useState("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [signature, setSignature] = useState(DEFAULT_SIGNATURE);

  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const load = async (preferTemplateName?: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_template_content" as any)
      .select("id, template_name, display_label, category, subject, body_text, signature_text, updated_at")
      .or(`category.eq.${CATEGORY},template_name.eq.${SEED_KEY}`)
      .order("template_name", { ascending: true });
    if (!error && data) {
      const rows = data as unknown as TemplateRow[];
      setTemplates(rows);
      const pick =
        (preferTemplateName && rows.find((r) => r.template_name === preferTemplateName)) ||
        rows.find((r) => r.template_name === SEED_KEY) ||
        rows[0] ||
        null;
      setSelectedId(pick?.id ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Populate editor fields whenever the selection changes.
  useEffect(() => {
    if (!selected) return;
    setLabel(selected.display_label ?? selected.template_name);
    setSubject(selected.subject ?? DEFAULT_SUBJECT);
    setBody(toEditorHtml(selected.body_text ?? DEFAULT_BODY));
    setSignature(selected.signature_text ?? DEFAULT_SIGNATURE);
  }, [selected?.id]);

  const handleSave = async () => {
    if (!isSuperAdmin || !selected) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      template_name: selected.template_name,
      category: CATEGORY,
      display_label: label.trim() || selected.template_name,
      subject: subject.trim() || DEFAULT_SUBJECT,
      body_text: body,
      signature_text: signature,
      updated_by: userData.user?.id ?? null,
    };
    const { error } = await supabase
      .from("email_template_content" as any)
      .upsert(payload, { onConflict: "template_name" });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Template saved", description: "Future intro emails will use the new wording." });
    load(selected.template_name);
  };

  const handleResetToDefault = () => {
    if (selected?.template_name !== SEED_KEY) {
      toast({ title: "Reset only available for the built-in template", description: "Duplicate the built-in template or edit the wording manually." });
      return;
    }
    setSubject(DEFAULT_SUBJECT);
    setBody(toEditorHtml(DEFAULT_BODY));
    setSignature(DEFAULT_SIGNATURE);
    toast({ title: "Reset", description: "Reverted to built-in defaults. Click Save to persist." });
  };

  const handleCreate = async (duplicate: boolean) => {
    if (!isSuperAdmin) return;
    const trimmed = newLabel.trim();
    if (!trimmed) {
      toast({ title: "Name required", description: "Give the new template a short name.", variant: "destructive" });
      return;
    }
    const baseKey = `${CATEGORY}-${slugify(trimmed)}`;
    // Ensure uniqueness against existing template_name values.
    let key = baseKey;
    let suffix = 2;
    const existingNames = new Set(templates.map((t) => t.template_name));
    while (existingNames.has(key)) {
      key = `${baseKey}-${suffix}`;
      suffix += 1;
    }
    const src = duplicate && selected ? selected : null;
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      template_name: key,
      category: CATEGORY,
      display_label: trimmed,
      subject: src?.subject ?? DEFAULT_SUBJECT,
      body_text: src?.body_text ?? DEFAULT_BODY,
      signature_text: src?.signature_text ?? DEFAULT_SIGNATURE,
      updated_by: userData.user?.id ?? null,
    };
    const { error } = await supabase
      .from("email_template_content" as any)
      .insert(payload);
    if (error) {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Template created", description: trimmed });
    setCreateOpen(false);
    setNewLabel("");
    load(key);
  };

  const handleDelete = async () => {
    if (!isSuperAdmin || !selected) return;
    if (selected.template_name === SEED_KEY) {
      toast({ title: "Cannot delete", description: "The built-in template cannot be removed.", variant: "destructive" });
      setDeleteOpen(false);
      return;
    }
    const { error } = await supabase
      .from("email_template_content" as any)
      .delete()
      .eq("id", selected.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Template deleted" });
    setDeleteOpen(false);
    load(SEED_KEY);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading templates…
      </div>
    );
  }

  const isSeed = selected?.template_name === SEED_KEY;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Lead introduction emails</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Manage the introduction emails sent from the lead list. Create one per service or audience
              (call answering, virtual assistant, etc.) — operators can choose which one to send.
              Use a blank line for new paragraphs; <code>- bullet</code> rows and links written as{" "}
              <code>[label](https://example.com)</code> are preserved.
            </p>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { setNewLabel(""); setCreateOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> New template
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="template-pick">Editing template</Label>
            <Select value={selectedId ?? undefined} onValueChange={(v) => setSelectedId(v)}>
              <SelectTrigger id="template-pick">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.display_label || t.template_name}
                    {t.template_name === SEED_KEY ? " (built-in)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isSuperAdmin && selected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setNewLabel(`${selected.display_label || selected.template_name} (copy)`); setCreateOpen(true); }}
            >
              <Copy className="h-4 w-4 mr-1" /> Duplicate current
            </Button>
          )}
        </div>

        {selected?.updated_at && (
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(selected.updated_at).toLocaleString("en-GB")}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {!isSuperAdmin && (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 text-yellow-900 px-3 py-2 text-sm">
            You are viewing in read-only mode. Only Super-Admin users can save changes.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="label">Template name</Label>
          <Input
            id="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={!isSuperAdmin || isSeed}
            placeholder="e.g. Virtual Assistant services intro"
          />
          {isSeed && (
            <p className="text-xs text-muted-foreground">
              The built-in template name is fixed. Duplicate it to create renameable variants.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">Subject line</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!isSuperAdmin}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="body">Email body</Label>
          {isSuperAdmin ? (
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder="Type the email body — use the toolbar for bold, colour, bullets, links…"
              minHeight="360px"
            />
          ) : (
            <div className="rounded-md border bg-white p-4">
              <EmailHtmlPreview html={body} />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Format the body just like Word — bold, colour, bullets, numbered lists, links and so on. The greeting (<em>Dear &lt;contact&gt;,</em>) and any optional personal message typed when sending are added automatically — don't repeat them here.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signature">Signature</Label>
          <Textarea
            id="signature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            disabled={!isSuperAdmin}
            rows={8}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to fall back to the built-in branded signature block.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
          {isSuperAdmin && selected && !isSeed && (
            <Button variant="outline" onClick={() => setDeleteOpen(true)} disabled={saving} className="mr-auto text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Delete template
            </Button>
          )}
          {isSeed && (
            <Button variant="outline" onClick={handleResetToDefault} disabled={!isSuperAdmin || saving}>
              <RotateCcw className="h-4 w-4 mr-2" /> Reset to default
            </Button>
          )}
          <Button onClick={handleSave} disabled={!isSuperAdmin || saving || !selected}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save changes
          </Button>
        </div>
      </CardContent>

      {/* Create / duplicate dialog */}
      <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New introduction template</AlertDialogTitle>
            <AlertDialogDescription>
              Give the template a short, recognisable name (e.g. "Virtual Assistant services intro").
              You can edit the subject, body and signature after creating it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-label">Template name</Label>
            <Input
              id="new-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Virtual Assistant services intro"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => handleCreate(false)}>Start blank</Button>
            <AlertDialogAction onClick={() => handleCreate(true)}>Duplicate current</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{selected?.display_label || selected?.template_name}" will be removed. Emails already sent are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
