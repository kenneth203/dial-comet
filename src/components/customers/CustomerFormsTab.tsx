import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Send, Copy, Check, Link, FileText, Clock, CheckCircle, Eye, Trash2, Loader2, Download, Mail, Wand2 } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface FormTemplate {
  id: string;
  name: string;
  description: string;
  elements: any[];
  brand_color: string;
}

interface FormSubmission {
  id: string;
  form_template_id: string;
  status: string;
  sent_at: string;
  completed_at: string | null;
  responses: Record<string, any>;
  templateName?: string;
}

interface CustomerFormsTabProps {
  customerId?: string;
  customerName?: string;
  onGenerateScript?: (submissionId: string) => void;
}

export function CustomerFormsTab({ customerId, customerName, onGenerateScript }: CustomerFormsTabProps) {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; url: string; formName: string }>({ open: false, url: "", formName: "" });
  const [linkCopied, setLinkCopied] = useState(false);
  const [viewingSubmission, setViewingSubmission] = useState<FormSubmission | null>(null);
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; url: string; formName: string; email: string; sending: boolean }>({ open: false, url: "", formName: "", email: "", sending: false });

  useEffect(() => {
    if (customerId) {
      loadData();
    }
  }, [customerId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load templates
      const { data: tpls } = await supabase
        .from("form_templates")
        .select("id, name, description, elements, brand_color")
        .eq("is_active", true);

      // Load submissions for this customer
      const { data: subs } = await supabase
        .from("form_submissions")
        .select("*")
        .eq("customer_id", customerId)
        .order("sent_at", { ascending: false });

      setTemplates((tpls as any[]) || []);
      
      // Enrich submissions with template names
      const enriched = (subs || []).map((sub: any) => {
        const tpl = (tpls || []).find((t: any) => t.id === sub.form_template_id);
        return { ...sub, templateName: tpl ? (tpl as any).name : "Unknown Form" };
      });
      setSubmissions(enriched);
    } catch (err) {
      console.error("Error loading forms data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendForm = async () => {
    if (!selectedTemplate || !customerId) return;

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("form_submissions")
        .insert({
          form_template_id: selectedTemplate,
          customer_id: customerId,
          data: { sent_by: user.id, status: "pending" }
        } as any)
        .select()
        .single();

      if (error) throw error;

      const formUrl = `https://portal.thevateam.co.uk/form/${(data as any).id}`;
      const tpl = templates.find(t => t.id === selectedTemplate);

      setLinkCopied(false);
      setLinkDialog({ open: true, url: formUrl, formName: tpl?.name || "Form" });
      setSelectedTemplate("");
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    // Optimistically remove from the visible list so it disappears immediately.
    setSubmissions(prev => prev.filter(s => s.id !== id));
    const { data, error } = await supabase
      .from("form_submissions")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || !data || data.length === 0) {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete — you may not have permission.",
        variant: "destructive",
      });
      loadData(); // restore correct state
    } else {
      toast({ title: "Deleted" });
      loadData();
    }
  };


  const [primaryContactName, setPrimaryContactName] = useState<string>("");

  const handleOpenEmailDialog = async (sub: FormSubmission) => {
    const url = `https://portal.thevateam.co.uk/form/${sub.id}`;
    const tpl = templates.find(t => t.id === sub.form_template_id);
    let email = "";
    let contactName = "";
    if (customerId) {
      const { data } = await supabase.from("customers").select("email, contacts").eq("id", customerId).maybeSingle();
      email = (data as any)?.email || "";
      const contacts = ((data as any)?.contacts || []) as any[];
      const primary = contacts.find(c => c && !c.hidden);
      if (primary) {
        contactName = `${primary.firstName || ""} ${primary.surname || ""}`.trim();
      }
    }
    setPrimaryContactName(contactName);
    setEmailDialog({ open: true, url, formName: tpl?.name || "Onboarding form", email, sending: false });
  };

  const handleSendEmail = async () => {
    if (!emailDialog.email || !emailDialog.email.includes("@")) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    setEmailDialog(prev => ({ ...prev, sending: true }));
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "customer-form-link",
          recipientEmail: emailDialog.email,
          idempotencyKey: `form-link-${emailDialog.url}-${Date.now()}`,
          templateData: {
            clientName: primaryContactName || customerName || "",
            formName: emailDialog.formName,
            formUrl: emailDialog.url,
          },
        },
      });
      if (error) throw error;
      toast({ title: "Email sent", description: `Form link sent to ${emailDialog.email}.` });
      setEmailDialog({ open: false, url: "", formName: "", email: "", sending: false });
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message || "Try again later.", variant: "destructive" });
      setEmailDialog(prev => ({ ...prev, sending: false }));
    }
  };



  const findElementById = (elements: any[], id: string): any | null => {
    for (const el of elements || []) {
      if (!el) continue;
      if (el.id === id) return el;
      if (el.children) {
        const f = findElementById(el.children, id);
        if (f) return f;
      }
      if (el.columnChildren) {
        for (const col of el.columnChildren) {
          const f = findElementById(col, id);
          if (f) return f;
        }
      }
    }
    return null;
  };

  // Collect every table element in the tree (handles sections, groups, columns, nested).
  const collectTables = (elements: any[], out: any[] = []): any[] => {
    for (const el of elements || []) {
      if (!el) continue;
      if (el.type === "table") out.push(el);
      if (el.children) collectTables(el.children, out);
      if (el.columnChildren) {
        for (const col of el.columnChildren) collectTables(col, out);
      }
    }
    return out;
  };

  const getElementLabel = (elements: any[], elementId: string): string => {
    // Direct match (covers regular fields).
    const direct = findElementById(elements, elementId);
    if (direct) return direct.label || direct.groupTitle || direct.content || elementId;

    // Table cell pattern: {tableId}_{row}_{col}. Table IDs may contain underscores,
    // so match against the actual table set instead of a greedy regex split.
    const cellMatch = elementId.match(/^(.+)_(\d+)_(\d+)$/);
    if (cellMatch) {
      const rowNum = Number(cellMatch[2]);
      const colNum = Number(cellMatch[3]);
      const tables = collectTables(elements);
      // Prefer the longest matching table id prefix to avoid false positives.
      const candidates = tables
        .filter(t => elementId === `${t.id}_${rowNum}_${colNum}`)
        .sort((a, b) => (b.id?.length || 0) - (a.id?.length || 0));
      const parent = candidates[0];
      if (parent) {
        const colName =
          parent.tableColumns?.[colNum] ||
          parent.columns?.[colNum]?.label ||
          parent.columns?.[colNum]?.name ||
          `Column ${colNum + 1}`;
        const tableLabel = parent.label || parent.groupTitle || "Table";
        return `${tableLabel} — Row ${rowNum + 1}: ${colName}`;
      }
      // Fallback when the template is missing/changed: still show something readable.
      return `Row ${rowNum + 1}, Column ${colNum + 1}`;
    }
    return elementId;
  };

  const handleDownloadPDF = (sub: FormSubmission) => {
    const tpl = templates.find(t => t.id === sub.form_template_id);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 16;

    // Brand palette
    const brand: [number, number, number] = [183, 50, 53];      // #b73235 red
    const navy: [number, number, number] = [28, 71, 122];       // #1c477a
    const ink: [number, number, number] = [40, 44, 52];
    const muted: [number, number, number] = [120, 124, 130];
    const stripe: [number, number, number] = [248, 249, 251];
    const border: [number, number, number] = [228, 230, 234];

    doc.setFont("helvetica", "normal");

    // ── Cover header ─────────────────────────────────────────────
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageW, 34, "F");
    doc.setFillColor(...brand);
    doc.rect(0, 34, pageW, 2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(tpl?.name || "Form Submission", margin, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (customerName) doc.text(customerName, margin, 24);

    doc.setFontSize(8);
    doc.setTextColor(220, 226, 236);
    const sentStr = `Sent  ${format(new Date(sub.sent_at), "dd/MM/yyyy HH:mm")}`;
    const compStr = sub.completed_at
      ? `Completed  ${format(new Date(sub.completed_at), "dd/MM/yyyy HH:mm")}`
      : "Pending";
    doc.text(sentStr, margin, 30);
    const sentW = doc.getTextWidth(sentStr);
    doc.text(`·  ${compStr}`, margin + sentW + 4, 30);

    // The VA Team mark – right side
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const mark = "The VA Team";
    doc.text(mark, pageW - margin - doc.getTextWidth(mark), 16);

    // ── Data prep (preserve template structure) ──────────────────
    const responses = sub.responses || {};
    const formatValue = (value: any): string => {
      if (value === undefined || value === null || value === "") return "—";
      if (typeof value === "boolean") return value ? "Yes" : "No";
      if (Array.isArray(value)) return value.map(v => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
      if (typeof value === "object") return JSON.stringify(value, null, 2);
      return String(value);
    };

    type Section = { title: string; rows: [string, string][] };
    const sections: Section[] = [];
    let current: Section = { title: "", rows: [] };
    const pushCurrent = () => { if (current.rows.length > 0 || current.title) sections.push(current); };

    const nonInputTypes = new Set(["section", "group", "page", "heading", "paragraph", "divider", "spacer", "image", "html", "columns", "row"]);
    const walk = (els: any[]) => {
      if (!Array.isArray(els)) return;
      for (const el of els) {
        if (!el) continue;
        const type = el.type || "";
        if (type === "section" || type === "group" || type === "page") {
          pushCurrent();
          current = { title: el.groupTitle || el.label || el.title || "Section", rows: [] };
          if (el.children) walk(el.children);
          if (el.columnChildren) el.columnChildren.forEach((c: any[]) => walk(c));
          pushCurrent();
          current = { title: "", rows: [] };
          continue;
        }
        if (type === "columns" || type === "row") {
          if (el.children) walk(el.children);
          if (el.columnChildren) el.columnChildren.forEach((c: any[]) => walk(c));
          continue;
        }
        if (el.id && !nonInputTypes.has(type)) {
          const label = el.label || el.groupTitle || el.id;
          current.rows.push([label, formatValue(responses[el.id])]);
        }
        if (el.children) walk(el.children);
        if (el.columnChildren) el.columnChildren.forEach((c: any[]) => walk(c));
      }
    };

    if (tpl?.elements) { walk(tpl.elements as any[]); pushCurrent(); }

    const capturedIds = new Set<string>();
    const collectIds = (els: any[]) => {
      if (!Array.isArray(els)) return;
      for (const el of els) {
        if (!el) continue;
        if (el.id) capturedIds.add(el.id);
        if (el.children) collectIds(el.children);
        if (el.columnChildren) el.columnChildren.forEach((c: any[]) => collectIds(c));
      }
    };
    if (tpl?.elements) collectIds(tpl.elements as any[]);
    const orphans: [string, string][] = Object.entries(responses)
      .filter(([k]) => !capturedIds.has(k))
      .map(([k, v]) => [tpl ? getElementLabel(tpl.elements as any[], k) : k, formatValue(v)]);
    if (orphans.length > 0) sections.push({ title: "Additional responses", rows: orphans });
    if (sections.length === 0) {
      sections.push({
        title: "",
        rows: Object.entries(responses).map(([k, v]) => [
          tpl ? getElementLabel(tpl.elements as any[], k) : k,
          formatValue(v),
        ]),
      });
    }

    // ── Sections ─────────────────────────────────────────────────
    let startY = 46;
    let sectionIndex = 0;
    for (const section of sections) {
      if (section.rows.length === 0 && !section.title) continue;
      sectionIndex += 1;

      // Page break safety for section heading
      if (startY > pageH - 40) { doc.addPage(); startY = margin + 4; }

      if (section.title) {
        // Accent bar + title
        doc.setFillColor(...brand);
        doc.rect(margin, startY - 3.5, 1.4, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...navy);
        doc.text(`${sectionIndex}.  ${section.title}`, margin + 4, startY + 1);
        startY += 5;
      }

      if (section.rows.length > 0) {
        autoTable(doc, {
          startY,
          head: [["Question", "Response"]],
          body: section.rows,
          theme: "plain",
          styles: {
            font: "helvetica",
            fontSize: 9.5,
            cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
            valign: "top",
            textColor: ink,
            lineColor: border,
            lineWidth: 0.1,
          },
          headStyles: {
            fillColor: navy,
            textColor: 255,
            fontStyle: "bold",
            fontSize: 9,
            cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
          },
          alternateRowStyles: { fillColor: stripe },
          columnStyles: {
            0: { cellWidth: 68, fontStyle: "bold", textColor: navy },
            1: { cellWidth: pageW - margin * 2 - 68 },
          },
          margin: { left: margin, right: margin },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 1 && data.cell.raw === "—") {
              data.cell.styles.textColor = muted;
            }
          },
        });
        startY = (doc as any).lastAutoTable.finalY + 8;
      }
    }

    // ── Footer (page numbers) ────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(...border);
      doc.setLineWidth(0.2);
      doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      const left = `${customerName || ""}${customerName && tpl?.name ? "  ·  " : ""}${tpl?.name || ""}`.trim();
      if (left) doc.text(left, margin, pageH - 7);
      const right = `Page ${i} of ${pageCount}`;
      doc.text(right, pageW - margin - doc.getTextWidth(right), pageH - 7);
    }

    const safeName = (tpl?.name || "form").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const safeCust = (customerName || "customer").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    doc.save(`${safeCust}-${safeName}-${format(new Date(sub.completed_at || sub.sent_at), "yyyyMMdd")}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Send Form Section */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Send className="h-4 w-4" />
            Send a Form
          </h3>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a form template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(tpl => (
                    <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={handleSendForm} disabled={!selectedTemplate || sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link className="h-4 w-4 mr-2" />}
              Generate Link
            </Button>
          </div>
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground">No form templates available. Create one in the CRM Form Builder first.</p>
          )}
        </CardContent>
      </Card>

      {/* Submissions History */}
      <div className="space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Sent Forms ({submissions.length})
        </h3>
        
        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No forms have been sent to this customer yet.</p>
        ) : (
          submissions.map(sub => (
            <Card key={sub.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{sub.templateName}</span>
                      <Badge variant={sub.status === "completed" ? "default" : "secondary"} className={sub.status === "completed" ? "bg-green-100 text-green-800" : ""}>
                        {sub.status === "completed" ? (
                          <><CheckCircle className="h-3 w-3 mr-1" /> Completed</>
                        ) : (
                          <><Clock className="h-3 w-3 mr-1" /> Pending</>
                        )}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sent: {format(new Date(sub.sent_at), "dd MMM yyyy HH:mm")}
                      {sub.completed_at && ` · Completed: ${format(new Date(sub.completed_at), "dd MMM yyyy HH:mm")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(`https://portal.thevateam.co.uk/form/${sub.id}`);
                        toast({ title: "Link Copied!" });
                      }}
                      title="Copy link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {sub.status !== "completed" && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenEmailDialog(sub)} title="Email link to customer">
                        <Mail className="h-4 w-4" />
                      </Button>
                    )}
                    {sub.status === "completed" && (
                      <>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setViewingSubmission(sub)} title="View responses">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleDownloadPDF(sub)} title="Download PDF">
                          <Download className="h-4 w-4" />
                        </Button>
                        {onGenerateScript && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => onGenerateScript(sub.id)} title="Generate script from this submission">
                            <Wand2 className="h-4 w-4 text-primary" />
                          </Button>
                        )}
                      </>
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteSubmission(sub.id)} title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Link Dialog */}
      <Dialog open={linkDialog.open} onOpenChange={(open) => setLinkDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="h-5 w-5 text-primary" />
              {linkDialog.formName} Link
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your form link has been generated. Copy it and send it to {customerName || "the customer"}.
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={linkDialog.url}
                className="font-mono text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button type="button"
                size="sm"
                variant={linkCopied ? "default" : "outline"}
                className="shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(linkDialog.url);
                  setLinkCopied(true);
                  toast({ title: "Copied!", description: "Form link copied to clipboard." });
                  setTimeout(() => setLinkCopied(false), 3000);
                }}
              >
                {linkCopied ? <><Check className="h-4 w-4 mr-1" /> Copied</> : <><Copy className="h-4 w-4 mr-1" /> Copy</>}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This is a permanent link. The customer can access it at any time to fill in the form.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Responses Dialog */}
      <Dialog open={!!viewingSubmission} onOpenChange={() => setViewingSubmission(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Form Responses — {viewingSubmission?.templateName}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 pr-4">
              {viewingSubmission && Object.entries(viewingSubmission.responses || {}).length > 0 ? (
                Object.entries(viewingSubmission.responses).map(([key, value]) => {
                  const tpl = templates.find(t => t.id === viewingSubmission.form_template_id);
                  const label = tpl ? getElementLabel(tpl.elements as any[], key) : key;
                  return (
                    <div key={key} className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">{label}</p>
                      <p className="text-sm">{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}</p>
                      <Separator />
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">No responses recorded.</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Email Link Dialog */}
      <Dialog open={emailDialog.open} onOpenChange={(open) => setEmailDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email form link to customer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A branded reminder email will be sent with a button linking to <span className="font-medium">{emailDialog.formName}</span>.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Recipient email</label>
              <Input
                type="email"
                value={emailDialog.email}
                onChange={(e) => setEmailDialog(prev => ({ ...prev, email: e.target.value }))}
                placeholder="customer@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Form link</label>
              <Input readOnly value={emailDialog.url} className="font-mono text-xs" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEmailDialog(prev => ({ ...prev, open: false }))} disabled={emailDialog.sending}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSendEmail} disabled={emailDialog.sending || !emailDialog.email}>
                {emailDialog.sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</> : <><Send className="h-4 w-4 mr-2" /> Send email</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
