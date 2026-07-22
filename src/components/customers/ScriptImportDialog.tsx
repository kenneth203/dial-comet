import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Sparkles, FileText, Upload, Wand2, ClipboardPaste, ChevronDown, Settings2, X, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { validateFile } from "@/lib/uploadValidation";
import { ScriptPreview } from "./ScriptPreview";
import { MappingPreview } from "./MappingPreview";
import { MappingValidation } from "./MappingValidation";
import { MappingVersionsDialog } from "./MappingVersionsDialog";
import { MappingPresetsPicker } from "./MappingPresetsPicker";
import { MappingImportExport } from "./MappingImportExport";
import { AutoCustomerFieldPreview } from "./AutoCustomerFieldPreview";
import { ChangesDiffSummary } from "./ChangesDiffSummary";
import {
  extractDocxText,
  extractPdfSmart,
  extractImageSmart,
  formResponsesToText,
  buildTemplateScript,
  buildScriptFromMapping,
  renderScript,
  applyCustomerOverrides,
  inferMappingFromForm,
  mergeMapping,
  flattenFormFields,
  highlightUncertainInHtml,
  ImportAbortError,
  CUSTOMER_FIELD_LABELS,
  DEFAULT_SECTIONS,
  type CustomerContextForScript,
  type ScriptMappingConfig,
  type FieldTarget,
  type CustomerFieldKey,
  type OcrMode,
  type OcrProgress,
  type QuickRefRow,
  type ScriptSection,
} from "@/lib/scriptImport";
import type { Customer } from "@/context/CustomersContext";

type SourceTab = "form" | "docx" | "pdf" | "image" | "text";
type ScriptMode = "template" | "ai";
type FileKind = "docx" | "pdf" | "image";

export type ScriptApplyPayload = {
  html: string;
  customerUpdates?: Partial<Record<CustomerFieldKey, string>>;
};

interface ScriptImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  existingScript: string;
  initialSubmissionId?: string;
  onApply: (html: string, customerUpdates?: Partial<Record<CustomerFieldKey, string>>) => void;
}

function findElementById(elements: any[], id: string): any | null {
  if (!Array.isArray(elements)) return null;
  for (const el of elements) {
    if (!el) continue;
    if (el.id === id) return el;
    if (el.elements) {
      const nested = findElementById(el.elements, id);
      if (nested) return nested;
    }
  }
  return null;
}

function buildLabelResolver(elements: any[]) {
  return (id: string): string => {
    const direct = findElementById(elements || [], id);
    if (direct) return direct.label || direct.groupTitle || direct.content || id;
    return id;
  };
}

function customerToContext(customer: Customer | null): CustomerContextForScript {
  if (!customer) return {};
  const c: any = customer;
  return {
    name: c.name || c.company_name,
    email: c.email,
    phone: c.phone || c.telephone,
    website: c.website,
    address_line1: c.address_line1 || c.address,
    address_line2: c.address_line2,
    city: c.city,
    postcode: c.postcode,
    contacts: Array.isArray(c.contacts) ? c.contacts : [],
    locations: Array.isArray(c.locations) ? c.locations : [],
  };
}

/** Encode a FieldTarget into a stable Select value like "customer_field:email". */
function encodeTarget(t: FieldTarget): string {
  if (t.kind === "ignore") return "ignore";
  if (t.kind === "quick_ref") return "quick_ref";
  if (t.kind === "customer_field") return `customer_field:${t.field}`;
  return `section:${t.sectionId}`;
}
function decodeTarget(value: string, sections: ScriptMappingConfig["sections"]): FieldTarget {
  if (value === "ignore") return { kind: "ignore" };
  if (value === "quick_ref") return { kind: "quick_ref" };
  if (value.startsWith("customer_field:")) {
    return { kind: "customer_field", field: value.split(":")[1] as CustomerFieldKey };
  }
  if (value.startsWith("section:")) {
    const id = value.split(":")[1];
    const found = sections.find((s) => s.id === id) || sections[0];
    return { kind: "script_section", sectionId: found.id };
  }
  return { kind: "script_section", sectionId: "business_info" };
}

export function ScriptImportDialog({
  open,
  onOpenChange,
  customer,
  existingScript,
  initialSubmissionId,
  onApply,
}: ScriptImportDialogProps) {
  const { toast } = useToast();

  const [sourceTab, setSourceTab] = useState<SourceTab>("form");
  const [mode, setMode] = useState<ScriptMode>("template");
  const [extraInstructions, setExtraInstructions] = useState("");

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>("");

  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [pastedText, setPastedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const importStartRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  // OCR state
  const [ocrMode, setOcrMode] = useState<OcrMode>("auto");
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [avgConfidence, setAvgConfidence] = useState<number | null>(null);
  const [uncertainTerms, setUncertainTerms] = useState<string[]>([]);
  const [ocrUsed, setOcrUsed] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Mapping state
  const [mapping, setMapping] = useState<ScriptMappingConfig | null>(null);
  const [pendingCustomerUpdates, setPendingCustomerUpdates] = useState<
    Partial<Record<CustomerFieldKey, string>>
  >({});
  const [saveAsTemplateDefault, setSaveAsTemplateDefault] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);

  // Review-before-apply state (populated after a mapping-driven generation)
  type ReviewData = {
    sortedSections: ScriptSection[];
    sectionQA: Record<string, Array<{ q: string; a: string }>>;
    baseCtx: CustomerContextForScript;
  };
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [reviewQuickRows, setReviewQuickRows] = useState<QuickRefRow[]>([]);
  const [initialQuickRows, setInitialQuickRows] = useState<QuickRefRow[]>([]);
  const [initialCustomerUpdates, setInitialCustomerUpdates] = useState<
    Partial<Record<CustomerFieldKey, string>>
  >({});
  const [reviewOpen, setReviewOpen] = useState(true);

  // Load submissions + templates on open
  useEffect(() => {
    if (!open || !customer?.id) return;
    (async () => {
      const [{ data: subs }, { data: tpls }] = await Promise.all([
        supabase
          .from("form_submissions")
          .select("*")
          .eq("customer_id", customer.id)
          .eq("status", "completed")
          .order("completed_at", { ascending: false }),
        supabase.from("form_templates").select("id, name, elements, field_mappings").eq("is_active", true),
      ]);
      setSubmissions((subs as any[]) || []);
      setTemplates((tpls as any[]) || []);

      if (initialSubmissionId) {
        setSelectedSubmissionId(initialSubmissionId);
        setSourceTab("form");
      }
    })();
  }, [open, customer?.id, initialSubmissionId]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setGeneratedHtml("");
      setFileText("");
      setFileName("");
      setFileSize(0);
      setPastedText("");
      setExtraInstructions("");
      setMapping(null);
      setPendingCustomerUpdates({});
      setSaveAsTemplateDefault(false);
      setMappingOpen(false);
      setOcrProgress(null);
      setAvgConfidence(null);
      setUncertainTerms([]);
      setOcrUsed(false);
      setReviewData(null);
      setReviewQuickRows([]);
      setReviewOpen(true);
      setElapsedMs(0);
      setExtracting(false);
    }
  }, [open]);

  // Elapsed timer while an import is running.
  useEffect(() => {
    if (!extracting) return;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - importStartRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [extracting]);

  const selectedSubmission = useMemo(
    () => submissions.find((s) => s.id === selectedSubmissionId),
    [submissions, selectedSubmissionId],
  );
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedSubmission?.form_template_id),
    [templates, selectedSubmission],
  );

  // Compute effective mapping whenever the selected submission changes.
  useEffect(() => {
    if (!selectedTemplate) {
      setMapping(null);
      return;
    }
    const customerOverride = (customer as any)?.script_field_mappings || null;
    const templateDefault = selectedTemplate.field_mappings || null;
    const inferred = inferMappingFromForm(selectedTemplate.elements || []);
    const merged = mergeMapping(inferred, templateDefault, customerOverride);
    // Ensure every field on the current template has an entry (auto-learn).
    for (const { id, label } of flattenFormFields(selectedTemplate.elements || [])) {
      if (!merged.fields[id]) merged.fields[id] = inferred.fields[id];
    }
    setMapping(merged);
  }, [selectedTemplate, customer]);

  const activeSourceText = useMemo(() => {
    if (sourceTab === "form" && selectedSubmission) {
      const resolver = buildLabelResolver(selectedTemplate?.elements || []);
      return formResponsesToText(selectedSubmission.responses || {}, resolver);
    }
    if (sourceTab === "docx" || sourceTab === "pdf" || sourceTab === "image") return fileText;
    if (sourceTab === "text") return pastedText;
    return "";
  }, [sourceTab, selectedSubmission, selectedTemplate, fileText, pastedText]);

  const handleCancelImport = () => {
    abortRef.current?.abort();
  };

  const handleFile = async (file: File, kind: FileKind) => {
    const validation = validateFile(file, {
      mimes:
        kind === "docx"
          ? ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
          : kind === "pdf"
            ? ["application/pdf"]
            : ["image/jpeg", "image/png", "image/webp"],
    });
    if (!validation.ok) {
      toast({ title: "Invalid file", description: validation.error, variant: "destructive" });
      return;
    }
    // Cancel any previous in-flight import before starting the new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    importStartRef.current = Date.now();
    setElapsedMs(0);
    setExtracting(true);
    setFileName(file.name);
    setFileSize(file.size);
    setOcrProgress({ stage: "reading", progress: 0 });
    setAvgConfidence(null);
    setUncertainTerms([]);
    setOcrUsed(false);
    setFileText("");
    try {
      if (kind === "docx") {
        const text = await extractDocxText(file, { signal: controller.signal });
        if (controller.signal.aborted) throw new ImportAbortError();
        setFileText(text);
        const duration = ((Date.now() - importStartRef.current) / 1000).toFixed(1);
        if (!text.trim()) {
          toast({
            title: "Empty document",
            description: "Could not read any text from this .docx file.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Import complete",
            description: `Read ${text.length.toLocaleString()} characters from ${file.name} in ${duration}s.`,
          });
        }
        return;
      }
      const onProgress = (p: OcrProgress) => setOcrProgress(p);
      const result =
        kind === "pdf"
          ? await extractPdfSmart(file, { mode: ocrMode, onProgress, signal: controller.signal })
          : await extractImageSmart(file, { onProgress, signal: controller.signal });
      if (controller.signal.aborted) throw new ImportAbortError();
      setFileText(result.text);
      setOcrUsed(result.ocrUsed);
      setAvgConfidence(result.avgConfidence ?? null);
      setUncertainTerms(result.uncertainTerms ?? []);
      const duration = ((Date.now() - importStartRef.current) / 1000).toFixed(1);
      const pages = result.pagesProcessed;
      if (!result.text.trim()) {
        toast({
          title: "No text found",
          description:
            kind === "pdf"
              ? "OCR could not read text from this PDF. Try a clearer scan or paste the content manually."
              : "OCR could not read any text from this image.",
          variant: "destructive",
        });
      } else {
        const method = result.ocrUsed ? "OCR" : "embedded text";
        const conf =
          result.avgConfidence != null ? ` · ${Math.round(result.avgConfidence)}% avg confidence` : "";
        const pageLabel = pages ? ` · ${pages} page${pages === 1 ? "" : "s"}` : "";
        toast({
          title: "Import complete",
          description: `${method}: ${result.text.length.toLocaleString()} chars${pageLabel} in ${duration}s${conf}.`,
        });
      }
    } catch (err: any) {
      if (err?.name === "ImportAbortError" || controller.signal.aborted) {
        toast({
          title: "Import cancelled",
          description: `Stopped reading ${file.name}.`,
        });
      } else {
        const stage = ocrProgress?.stage;
        const stageLabel =
          stage === "rasterizing"
            ? " while rendering page"
            : stage === "recognizing"
              ? " while running OCR"
              : stage === "reading"
                ? " while reading file"
                : "";
        toast({
          title: "Import failed",
          description: `${err?.message || "Could not parse file"}${stageLabel}.`,
          variant: "destructive",
        });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setExtracting(false);
      setOcrProgress(null);
    }
  };


  const updateFieldTarget = (fieldId: string, encoded: string) => {
    if (!mapping) return;
    const next: ScriptMappingConfig = {
      ...mapping,
      fields: { ...mapping.fields, [fieldId]: decodeTarget(encoded, mapping.sections) },
    };
    setMapping(next);
  };

  const handleGenerate = async () => {
    if (!activeSourceText.trim() && !(sourceTab === "form" && selectedSubmission)) {
      toast({ title: "No content", description: "Add some content first.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const ctx = customerToContext(customer);
      let html = "";

      // Form + fixed template → use mapping-driven builder.
      if (sourceTab === "form" && selectedSubmission && mode === "template") {
        const resolver = buildLabelResolver(selectedTemplate?.elements || []);
        const effective = mapping ?? inferMappingFromForm(selectedTemplate?.elements || []);
        const result = buildScriptFromMapping(
          selectedSubmission.responses || {},
          resolver,
          effective,
          ctx,
        );
        setMapping(effective);
        setPendingCustomerUpdates(result.customerFieldUpdates);
        setInitialCustomerUpdates(result.customerFieldUpdates);
        setReviewData({
          sortedSections: result.sortedSections,
          sectionQA: result.sectionQA,
          baseCtx: ctx,
        });
        setReviewQuickRows(result.extraQuickRefRows);
        setInitialQuickRows(result.extraQuickRefRows);
        setReviewOpen(true);
        html = result.html;
      } else if (mode === "template") {
        html = buildTemplateScript(activeSourceText, ctx);
        setPendingCustomerUpdates({});
        setInitialCustomerUpdates({});
        setReviewData(null);
        setReviewQuickRows([]);
        setInitialQuickRows([]);
      } else {
        const { data, error } = await supabase.functions.invoke("generate-script-ai", {
          body: { content: activeSourceText, customer: ctx, instructions: extraInstructions },
        });
        if (error) throw error;
        const aiHtml = (data as any)?.html;
        if (!aiHtml) throw new Error("AI returned no content.");
        setPendingCustomerUpdates({});
        setInitialCustomerUpdates({});
        setReviewData(null);
        setReviewQuickRows([]);
        setInitialQuickRows([]);
        html = aiHtml;
      }

      // Wrap OCR low-confidence tokens in <mark> so operators see what to verify.
      if (ocrUsed && uncertainTerms.length > 0) {
        html = highlightUncertainInHtml(html, uncertainTerms);
      }
      setGeneratedHtml(html);
    } catch (err: any) {
      toast({ title: "Generation failed", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // Live-rebuild the preview from review edits (only for mapping-driven builds).
  useEffect(() => {
    if (!reviewData) return;
    const mergedCtx = applyCustomerOverrides(reviewData.baseCtx, pendingCustomerUpdates);
    let html = renderScript({
      sortedSections: reviewData.sortedSections,
      customer: mergedCtx,
      extraQuickRefRows: reviewQuickRows,
      sectionQA: reviewData.sectionQA,
    });
    if (ocrUsed && uncertainTerms.length > 0) {
      html = highlightUncertainInHtml(html, uncertainTerms);
    }
    setGeneratedHtml(html);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewData, reviewQuickRows, pendingCustomerUpdates]);

  /** Persist mapping to customer (always) and to template default (opt-in). */
  const persistMapping = async () => {
    if (!mapping || !customer?.id) return;
    try {
      await supabase
        .from("customers")
        .update({ script_field_mappings: mapping as any })
        .eq("id", customer.id);
      if (saveAsTemplateDefault && selectedTemplate?.id) {
        await supabase
          .from("form_templates")
          .update({ field_mappings: mapping as any })
          .eq("id", selectedTemplate.id);
      }
    } catch (err: any) {
      // Non-fatal — the script still applies.
      toast({
        title: "Mapping not saved",
        description: err?.message || "Could not save field mapping for future imports.",
        variant: "destructive",
      });
    }
  };

  const logImportAudit = async (
    html: string,
    mode: "replace" | "append",
  ) => {
    if (!customer?.id) return;
    try {
      const sourceType: "form" | "docx" | "pdf" | "image" | "text" =
        sourceTab === "form"
          ? "form"
          : sourceTab === "docx"
            ? "docx"
            : sourceTab === "pdf"
              ? "pdf"
              : sourceTab === "image"
                ? "image"
                : "text";
      const rawSource =
        sourceType === "text"
          ? pastedText
          : sourceType === "form"
            ? formResponsesToText(
                (selectedSubmission?.response_data as any) || {},
                selectedTemplate?.elements || [],
              )
            : fileText;
      const preview = (rawSource || "").slice(0, 8000);
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("script_import_audit").insert({
        customer_id: customer.id,
        user_id: userData?.user?.id,
        source_type: sourceType,
        source_name: sourceType === "form" ? selectedTemplate?.name ?? null : fileName || null,
        source_size: sourceType === "form" ? null : fileSize || null,
        source_text_preview: preview,
        applied_mode: mode,
        old_script: existingScript || null,
        new_script: html,
        customer_updates: pendingCustomerUpdates as any,
        quick_ref_rows: reviewQuickRows as any,
        ocr_used: ocrUsed,
        ocr_avg_confidence: avgConfidence,
        pages_processed: null,
        template_id: selectedTemplate?.id ?? null,
        submission_id: selectedSubmission?.id ?? null,
      });
    } catch (err) {
      // Non-fatal — never block the import on audit failure.
      console.warn("script_import_audit insert failed", err);
    }
  };

  const finalize = async (html: string, mode: "replace" | "append" = "replace") => {
    await persistMapping();
    await logImportAudit(html, mode);
    onApply(html, pendingCustomerUpdates);
    onOpenChange(false);
  };

  const handleApplyClick = () => {
    if (!generatedHtml) return;
    if ((existingScript || "").trim() && existingScript !== "<p><br></p>") {
      setConfirmOpen(true);
    } else {
      finalize(generatedHtml, "replace");
    }
  };

  const doReplace = () => {
    finalize(generatedHtml, "replace");
    setConfirmOpen(false);
  };
  const doAppend = () => {
    finalize(`${existingScript || ""}\n${generatedHtml}`, "append");
    setConfirmOpen(false);
  };

  const flatFields = useMemo(
    () => (selectedTemplate ? flattenFormFields(selectedTemplate.elements || []) : []),
    [selectedTemplate],
  );

  const sectionsForSelect = mapping?.sections ?? DEFAULT_SECTIONS;

  const formatBytes = (n: number) => {
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };
  const elapsedLabel = `${(elapsedMs / 1000).toFixed(1)}s`;

  const progressPercent = (() => {
    if (!extracting) return 0;
    if (!ocrProgress) return 4;
    const p = ocrProgress;
    if (p.stage === "reading") return Math.max(4, Math.min(15, Math.round((p.progress ?? 0) * 15)));
    const total = p.totalPages ?? 1;
    const page = p.page ?? 0;
    const pageFrac = p.progress ?? 0;
    // rasterizing 15%->55%, recognizing 55%->98%
    const perPage = 1 / Math.max(total, 1);
    const base = (page - 1) * perPage + pageFrac * perPage;
    if (p.stage === "rasterizing") return 15 + Math.round(base * 40);
    if (p.stage === "recognizing") return 55 + Math.round(base * 43);
    return 20;
  })();

  const progressLabel = (() => {
    const p = ocrProgress;
    if (!p) return "Preparing…";
    if (p.stage === "reading") return "Reading file…";
    if (p.stage === "rasterizing")
      return `Rendering page ${p.page ?? "?"}${p.totalPages ? ` of ${p.totalPages}` : ""}…`;
    if (p.stage === "recognizing")
      return `OCR reading${p.totalPages && p.totalPages > 1 ? ` page ${p.page ?? "?"} of ${p.totalPages}` : ""}${
        p.confidence != null ? ` · ${Math.round(p.confidence)}% confidence` : ""
      }…`;
    return "Working…";
  })();

  const renderImportProgress = () => (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span className="truncate">{progressLabel}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {progressPercent}% · {elapsedLabel}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={handleCancelImport}
          >
            <X className="h-3 w-3 mr-1" /> Cancel
          </Button>
        </div>
      </div>
      <Progress value={progressPercent} className="h-1.5" />
      {(fileName || fileSize) && (
        <p className="text-[11px] text-muted-foreground truncate">
          {fileName}
          {fileSize ? ` · ${formatBytes(fileSize)}` : ""}
        </p>
      )}
    </div>
  );

  const renderImportComplete = () =>
    fileName && !extracting && fileText ? (
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
        Loaded: {fileName} ({fileText.length.toLocaleString()} chars
        {fileSize ? `, ${formatBytes(fileSize)}` : ""})
        {ocrUsed && avgConfidence != null && (
          <> · OCR avg confidence <strong>{Math.round(avgConfidence)}%</strong></>
        )}
      </p>
    ) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[1200px] w-[95vw] h-[90dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Import & Generate Script
            </DialogTitle>
            <DialogDescription>
              Turn a completed form, a Word document, a PDF (scanned or digital), an image, or pasted text into an operator script.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
            {/* LEFT */}
            <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
              <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as SourceTab)}>
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="form"><FileText className="h-3 w-3 mr-1" />Form</TabsTrigger>
                  <TabsTrigger value="docx"><Upload className="h-3 w-3 mr-1" />Word</TabsTrigger>
                  <TabsTrigger value="pdf"><Upload className="h-3 w-3 mr-1" />PDF</TabsTrigger>
                  <TabsTrigger value="image"><Upload className="h-3 w-3 mr-1" />Image</TabsTrigger>
                  <TabsTrigger value="text"><ClipboardPaste className="h-3 w-3 mr-1" />Paste</TabsTrigger>
                </TabsList>

                <TabsContent value="form" className="space-y-2 pt-3">
                  <Label>Completed form submissions</Label>
                  {submissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No completed forms for this customer yet.
                    </p>
                  ) : (
                    <Select value={selectedSubmissionId} onValueChange={setSelectedSubmissionId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a completed submission..." />
                      </SelectTrigger>
                      <SelectContent>
                        {submissions.map((s) => {
                          const tpl = templates.find((t) => t.id === s.form_template_id);
                          const dt = s.completed_at ? new Date(s.completed_at).toLocaleDateString("en-GB") : "";
                          return (
                            <SelectItem key={s.id} value={s.id}>
                              {tpl?.name || "Form"} {dt ? `— ${dt}` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </TabsContent>

                <TabsContent value="docx" className="space-y-2 pt-3">
                  <Label>Upload a Word document (.docx)</Label>
                  <Input
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], "docx")}
                  />
                  {extracting && renderImportProgress()}
                  {renderImportComplete()}
                </TabsContent>

                <TabsContent value="pdf" className="space-y-2 pt-3">
                  <Label>Upload a PDF (digital or scanned)</Label>
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], "pdf")}
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">OCR mode</Label>
                    <Select value={ocrMode} onValueChange={(v) => setOcrMode(v as OcrMode)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto — OCR only if the PDF has no text layer</SelectItem>
                        <SelectItem value="force">Force OCR — always re-read the page images</SelectItem>
                        <SelectItem value="off">Off — embedded text only (fastest)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {extracting && renderImportProgress()}
                  {renderImportComplete()}
                </TabsContent>

                <TabsContent value="image" className="space-y-2 pt-3">
                  <Label>Upload an image (JPG / PNG / WEBP)</Label>
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], "image")}
                  />
                  {extracting && renderImportProgress()}
                  {renderImportComplete()}
                </TabsContent>

                <TabsContent value="text" className="space-y-2 pt-3">
                  <Label>Paste content</Label>
                  <Textarea
                    rows={10}
                    placeholder="Paste any notes, business info, FAQs…"
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                  />
                </TabsContent>
              </Tabs>

              {ocrUsed && uncertainTerms.length > 0 && (
                <div className="rounded-md border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs">
                  <div className="font-medium mb-1">
                    {uncertainTerms.length} uncertain OCR term{uncertainTerms.length === 1 ? "" : "s"} — these will be highlighted in the preview so you can verify them.
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {uncertainTerms.slice(0, 60).map((t) => (
                      <span key={t} className="inline-block bg-amber-200/60 dark:bg-amber-900/40 rounded px-1.5 py-0.5">
                        {t}
                      </span>
                    ))}
                    {uncertainTerms.length > 60 && (
                      <span className="text-muted-foreground">+{uncertainTerms.length - 60} more</span>
                    )}
                  </div>
                </div>
              )}

              {/* Auto-detected customer fields from OCR / extracted text (non-form sources) */}
              {sourceTab !== "form" && activeSourceText.trim().length > 0 && (
                <AutoCustomerFieldPreview
                  text={activeSourceText}
                  uncertainTerms={uncertainTerms}
                  currentUpdates={pendingCustomerUpdates}
                  onChangeUpdates={(updater) => setPendingCustomerUpdates(updater)}
                />
              )}



              {/* Saved layout presets */}
              {sourceTab === "form" && selectedSubmission && mapping && mode === "template" && customer?.id && (
                <MappingPresetsPicker
                  customerId={customer.id}
                  currentMapping={mapping}
                  formTemplateId={selectedSubmission.form_template_id ?? null}
                  onApply={(m) => setMapping(m)}
                />
              )}

              {/* Field mapping editor (form source + fixed template only) */}
              {sourceTab === "form" && selectedSubmission && mapping && mode === "template" && (
                <Collapsible open={mappingOpen} onOpenChange={setMappingOpen} className="rounded-lg border">
                  <div className="flex items-center justify-between px-3 py-1">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex flex-1 items-center justify-between py-1 text-sm font-medium hover:bg-muted/50 rounded"
                      >
                        <span className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-primary" />
                          Field mapping
                          <span className="text-xs text-muted-foreground">
                            ({flatFields.length} fields)
                          </span>
                        </span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${mappingOpen ? "rotate-180" : ""}`} />
                      </button>
                    </CollapsibleTrigger>
                    <div className="ml-2 flex items-center gap-2">
                      <MappingImportExport
                        currentMapping={mapping}
                        customerName={customer?.name}
                        onImport={(m) => setMapping(m)}
                      />
                      {customer?.id && (
                        <MappingVersionsDialog
                          customerId={customer.id}
                          customerName={customer.name}
                          currentMapping={mapping}
                          onRestore={(m) => setMapping(m)}
                        />
                      )}
                    </div>
                  </div>
                  <CollapsibleContent className="px-3 pb-3 space-y-2 max-h-72 overflow-y-auto">
                    <p className="text-xs text-muted-foreground">
                      Choose where each form answer goes for <strong>{customer?.name || "this customer"}</strong>.
                      Changes are remembered next time you import.
                    </p>
                    {flatFields.map((f) => {
                      const target = mapping.fields[f.id] ?? { kind: "script_section", sectionId: "business_info" };
                      return (
                        <div key={f.id} className="grid grid-cols-5 gap-2 items-center text-sm">
                          <div className="col-span-2 truncate" title={f.label}>{f.label}</div>
                          <div className="col-span-3">
                            <Select
                              value={encodeTarget(target)}
                              onValueChange={(v) => updateFieldTarget(f.id, v)}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ignore">Ignore</SelectItem>
                                <SelectItem value="quick_ref">Quick reference row</SelectItem>
                                {sectionsForSelect
                                  .filter((s) => !s.fixed || s.fixed === undefined)
                                  .map((s) => (
                                    <SelectItem key={s.id} value={`section:${s.id}`}>
                                      Script section — {s.title}
                                    </SelectItem>
                                  ))}
                                {(Object.keys(CUSTOMER_FIELD_LABELS) as CustomerFieldKey[]).map((k) => (
                                  <SelectItem key={k} value={`customer_field:${k}`}>
                                    Customer → {CUSTOMER_FIELD_LABELS[k]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                    <label className="flex items-center gap-2 pt-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={saveAsTemplateDefault}
                        onCheckedChange={(v) => setSaveAsTemplateDefault(!!v)}
                      />
                      Also save as default for this form template (applies to all customers using it)
                    </label>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Live mapping preview — which field lands where */}
              {sourceTab === "form" && selectedSubmission && mapping && mode === "template" && (
                <>
                  <MappingValidation
                    flatFields={flatFields}
                    mapping={mapping}
                    responses={selectedSubmission.responses || {}}
                    onOpenMapping={() => setMappingOpen(true)}
                  />
                  <MappingPreview
                    flatFields={flatFields}
                    mapping={mapping}
                    responses={selectedSubmission.responses || {}}
                  />
                </>
              )}

              {/* Mode toggle */}
              <div className="space-y-2 rounded-lg border p-3">
                <Label>Layout style</Label>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as ScriptMode)} className="space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <RadioGroupItem value="template" id="mode-template" className="mt-1" />
                    <div>
                      <div className="font-medium text-sm">Fixed template</div>
                      <p className="text-xs text-muted-foreground">Uses your per-client field mapping to place answers into the right sections and quick-reference rows.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <RadioGroupItem value="ai" id="mode-ai" className="mt-1" />
                    <div>
                      <div className="font-medium text-sm flex items-center gap-1">AI-assisted <Sparkles className="h-3 w-3 text-primary" /></div>
                      <p className="text-xs text-muted-foreground">Uses AI to structure the content into a natural operator script (mapping not applied).</p>
                    </div>
                  </label>
                </RadioGroup>

                {mode === "ai" && (
                  <div className="pt-2 space-y-1">
                    <Label className="text-xs">Extra instructions (optional)</Label>
                    <Textarea
                      rows={2}
                      placeholder="e.g. Emphasize emergency handling, keep tone very formal…"
                      value={extraInstructions}
                      onChange={(e) => setExtraInstructions(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <Button
                onClick={handleGenerate}
                disabled={generating || (!activeSourceText.trim() && !(sourceTab === "form" && selectedSubmission))}
                className="w-full"
              >
                {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : <><Wand2 className="h-4 w-4 mr-2" /> Generate script</>}
              </Button>

              {generatedHtml && (
                <Collapsible open={reviewOpen} onOpenChange={setReviewOpen}>
                  <div className="rounded-md border border-primary/30 bg-primary/5">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between p-2 text-xs font-medium"
                      >
                        <span className="flex items-center gap-1.5">
                          <Settings2 className="h-3.5 w-3.5" />
                          Review before applying
                          {(Object.keys(pendingCustomerUpdates).length + reviewQuickRows.length) > 0 && (
                            <span className="text-muted-foreground font-normal">
                              ({Object.keys(pendingCustomerUpdates).length} customer,{" "}
                              {reviewQuickRows.length} quick-tab)
                            </span>
                          )}
                        </span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${reviewOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-2 pb-2 space-y-3 text-xs">
                      {/* Before/after diff */}
                      <ChangesDiffSummary
                        customer={customer}
                        pendingCustomerUpdates={pendingCustomerUpdates}
                        initialQuickRows={initialQuickRows}
                        currentQuickRows={reviewQuickRows}
                      />

                      {/* Customer field edits */}
                      <div className="space-y-1.5">
                        <div className="font-medium">Customer details to update</div>
                        {(Object.keys(CUSTOMER_FIELD_LABELS) as CustomerFieldKey[]).map((k) => {
                          const present = pendingCustomerUpdates[k] !== undefined;
                          const value = pendingCustomerUpdates[k] ?? "";
                          return (
                            <div key={k} className="flex items-center gap-2">
                              <Checkbox
                                checked={present}
                                onCheckedChange={(v) => {
                                  setPendingCustomerUpdates((prev) => {
                                    const next = { ...prev };
                                    if (v) next[k] = value || "";
                                    else delete next[k];
                                    return next;
                                  });
                                }}
                              />
                              <Label className="w-28 shrink-0 text-muted-foreground">
                                {CUSTOMER_FIELD_LABELS[k]}
                              </Label>
                              <Input
                                className="h-7 text-xs"
                                value={value}
                                disabled={!present}
                                placeholder={present ? "" : "Not updating"}
                                onChange={(e) =>
                                  setPendingCustomerUpdates((prev) => ({
                                    ...prev,
                                    [k]: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          );
                        })}
                        <p className="text-[11px] text-muted-foreground pt-0.5">
                          Ticked fields will be written to the customer record on apply.
                        </p>
                      </div>

                      {/* Quick-tab rows edits (mapping-driven only) */}
                      {reviewData && (
                        <div className="space-y-1.5 border-t border-primary/20 pt-2">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">Quick-reference rows</div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs"
                              onClick={() =>
                                setReviewQuickRows((rows) => [...rows, { label: "", value: "" }])
                              }
                            >
                              + Add row
                            </Button>
                          </div>
                          {reviewQuickRows.length === 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              No extra rows — main phone, email, address, contacts and locations
                              are added automatically from the customer record.
                            </p>
                          )}
                          {reviewQuickRows.map((row, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <Input
                                className="h-7 text-xs w-32"
                                placeholder="Label"
                                value={row.label}
                                onChange={(e) =>
                                  setReviewQuickRows((rows) =>
                                    rows.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)),
                                  )
                                }
                              />
                              <Input
                                className="h-7 text-xs flex-1"
                                placeholder="Value"
                                value={row.value}
                                onChange={(e) =>
                                  setReviewQuickRows((rows) =>
                                    rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)),
                                  )
                                }
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() =>
                                  setReviewQuickRows((rows) => rows.filter((_, i) => i !== idx))
                                }
                              >
                                ✕
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )}
            </div>

            {/* RIGHT */}
            <div className="flex flex-col min-h-0">
              <Label className="mb-2">Preview</Label>
              <div className="flex-1 min-h-0 overflow-hidden">
                <ScriptPreview html={generatedHtml} maxHeight="100%" />
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={handleApplyClick} disabled={!generatedHtml}>
                  Apply to script
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Existing script found</AlertDialogTitle>
            <AlertDialogDescription>
              This customer already has a script. Do you want to replace it or append the generated content to the end?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={doAppend}>Append</Button>
            <AlertDialogAction onClick={doReplace}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
