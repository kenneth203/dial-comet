import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Upload, Loader2 } from "lucide-react";
import { useCustomers } from "@/context/CustomersContext";
import type { Customer } from "@/context/CustomersContext";
import { useToast } from "@/hooks/use-toast";

interface ImportCustomersDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// Minimal cell cleaner — strips BOM, zero-width, NBSP, smart quotes
const cleanCell = (v: string) =>
  v
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\u00A0]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();

// RFC4180-ish CSV row parser (handles quoted fields with commas/newlines)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch === "\r") { /* ignore */ }
      else cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim().length > 0));
}

// Map common header aliases -> canonical Customer keys
const HEADER_ALIASES: Record<string, keyof Customer> = {
  name: "name",
  customer: "name",
  customername: "name",
  businesstype: "businessType",
  business_type: "businessType",
  email: "email",
  tel: "tel",
  telephone: "tel",
  phone: "phone",
  mobile: "mobile",
  website: "website",
  status: "status",
  contact: "contact",
  addressline1: "addressLine1",
  address_line1: "addressLine1",
  addressline2: "addressLine2",
  address_line2: "addressLine2",
  city: "city",
  postcode: "postcode",
  address: "address",
};

const JSON_FIELDS = new Set([
  "packages", "billingStatus", "additionalServices", "services", "contacts",
  "locations", "scriptTags", "leadMetadata",
]);
const NUMBER_FIELDS = new Set([
  "vaPrice", "vaPackagedHours", "vaHourlyOverageRate",
  "vrPrice", "vrIncludedMinutes", "vrOverageRate",
  "aiPrice", "aiSetupFee", "aiMonthlyFee", "aiCallsAllocated",
  "dtPrice", "dtPricePerMinute",
  "clPrice", "clIncludedMinutes", "clOverageRate",
  "cbPrice", "cbIncludedMinutes", "cbOverageRate",
]);

const CUSTOMER_KEYS: (keyof Customer)[] = [
  "name","businessType","addressLine1","addressLine2","city","postcode","tel","mobile","email","website","status","contact","phone",
  "callsPerMonth","billingOptions","callHandlingTier","address","outcomeHow","outcomeWhen","outcomeFormat","messageSelection","filters",
  "systemLink","systemIcon","script","virtualAssistantPlan","callAnsweringPlan","packages",
  "vaPackage","vaPackagedHours","vaHourlyOverageRate","vaPrice",
  "vrPackage","vrPrice","vrIncludedMinutes","vrOverageRate",
  "aiPackage","aiSetupFee","aiMonthlyFee","aiCallsAllocated",
  "dtPackage","dtPricePerMinute",
  "clPackage","clPrice","clIncludedMinutes","clOverageRate",
  "cbPackage","cbPrice","cbIncludedMinutes","cbOverageRate",
];

function normaliseHeader(h: string): keyof Customer | null {
  const k = cleanCell(h).toLowerCase().replace(/[\s_-]/g, "");
  if (HEADER_ALIASES[k]) return HEADER_ALIASES[k];
  const found = CUSTOMER_KEYS.find(ck => ck.toLowerCase() === k);
  return found ?? null;
}

function parseValue(field: keyof Customer, raw: string): any {
  const v = cleanCell(raw);
  if (v === "") return undefined;
  if (JSON_FIELDS.has(field)) {
    try { return JSON.parse(v); } catch { return undefined; }
  }
  if (NUMBER_FIELDS.has(field)) {
    const n = Number(v.replace(/[£$,\s]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  if (field === "billingDay") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return v;
}

const isEmpty = (v: any) =>
  v === undefined || v === null || v === "" ||
  (Array.isArray(v) && v.length === 0);

function defaultCustomer(): Omit<Customer, "id"> {
  return {
    name: "", businessType: "", addressLine1: "", addressLine2: "", city: "", postcode: "",
    tel: "", mobile: "", email: "", website: "", status: "Active", contact: "", phone: "",
    callsPerMonth: "", billingDay: null, billingOptions: "VAT", billingStatus: [],
    additionalServices: [], callHandlingTier: "", contacts: [], address: "", locations: [],
    outcomeHow: "", outcomeWhen: "", outcomeFormat: "", messageSelection: "", filters: "",
    systemLink: "", script: "", scriptTags: [], hasInboundCallScript: true,
    services: [], virtualAssistantPlan: "", callAnsweringPlan: "", packages: "",
    vaPackage: "", vaPackagedHours: 0, vaHourlyOverageRate: 0, vaPrice: 0,
    vrPackage: "", vrPrice: 0, vrIncludedMinutes: 0, vrOverageRate: 0,
    aiPackage: "", aiSetupFee: 0, aiMonthlyFee: 0, aiCallsAllocated: 0,
    dtPackage: "", dtPricePerMinute: 0,
    clPackage: "", clPrice: 0, clIncludedMinutes: 0, clOverageRate: 0,
    cbPackage: "", cbPrice: 0, cbIncludedMinutes: 0, cbOverageRate: 0,
    callPackageName: "", callBaseAllowance: 0, callIncludedMinutes: 0, callMonthlyCharge: 0,
    callRatePerCall: 0, callRatePerMinute: 0, callRateSms: 0,
    callRateTransferLandline: 0, callRateTransferMobile: 0,
    callBillingUnit: "per_call", directDialNumber: false, vatRate: 0.20,
  };
}

type ImportResult = {
  created: string[];
  merged: { name: string; fields: string[] }[];
  skipped: { name: string; reason: string }[];
  unchanged: string[];
};

type PreviewRow = {
  raw: Record<string, any>;
  action: "create" | "merge" | "unchanged" | "skip";
  reason?: string;
  existing?: Customer;
  patchFields?: string[];
};

const UNMAPPED = "__unmapped__";

const MERGE_KEY_OPTIONS: (keyof Customer)[] = ["name", "email", "tel", "phone", "mobile", "website"];

export function ImportCustomersDialog({ isOpen, onClose }: ImportCustomersDialogProps) {
  const { customers, addCustomer, updateCustomer } = useCustomers();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<(keyof Customer | null)[]>([]);
  const [mergeKey, setMergeKey] = useState<keyof Customer>("name");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<"mapping" | "preview">("mapping");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  const normaliseKeyValue = (v: any) => String(v ?? "").trim().toLowerCase();

  const existingByKey = useMemo(() => {
    const m = new Map<string, Customer>();
    customers.forEach(c => {
      const k = normaliseKeyValue((c as any)[mergeKey]);
      if (k) m.set(k, c);
    });
    return m;
  }, [customers, mergeKey]);

  // Fields already assigned to another column (prevent dupes in dropdowns)
  const usedFields = useMemo(() => {
    const s = new Set<keyof Customer>();
    mapping.forEach(m => { if (m) s.add(m); });
    return s;
  }, [mapping]);

  // Auto-assign a CSV column to the chosen merge key whenever it changes
  // (or when headers load) and nothing is currently mapped to it.
  useEffect(() => {
    if (headers.length === 0) return;
    if (mapping.includes(mergeKey)) return;
    // Best guess by header text
    let bestIdx = headers.findIndex(h => normaliseHeader(h) === mergeKey);
    // Fallback: any unmapped column whose sample value looks right
    if (bestIdx === -1) {
      const looksLike = (s: string) => {
        const v = cleanCell(s);
        if (!v) return false;
        if (mergeKey === "email") return /@/.test(v);
        if (mergeKey === "website") return /\.[a-z]{2,}/i.test(v);
        if (mergeKey === "tel" || mergeKey === "phone" || mergeKey === "mobile") {
          return /[\d][\d\s()+-]{5,}/.test(v);
        }
        return false;
      };
      bestIdx = headers.findIndex((_, i) => !mapping[i] && looksLike(rawRows[0]?.[i] ?? ""));
    }
    if (bestIdx !== -1) {
      setMapping(prev => {
        const next = [...prev];
        // Clear any existing assignment of mergeKey elsewhere (safety)
        for (let i = 0; i < next.length; i++) if (next[i] === mergeKey) next[i] = null;
        next[bestIdx] = mergeKey;
        return next;
      });
    }
  }, [mergeKey, headers, rawRows]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setFile(null); setHeaders([]); setRawRows([]); setMapping([]); setResult(null); setStep("mapping"); setPreviewRows([]); setMergeKey("name");
  };



  const handleFile = async (f: File) => {
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);
    setStep("mapping");
    const text = await f.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      toast({ title: "Empty CSV", description: "No data rows found.", variant: "destructive" });
      return;
    }
    const hdrs = parsed[0].map(h => cleanCell(h));
    setHeaders(hdrs);
    setRawRows(parsed.slice(1));
    // Auto-detect mapping; ensure each field used only once
    const seen = new Set<keyof Customer>();
    const auto = hdrs.map(h => {
      const guess = normaliseHeader(h);
      if (guess && !seen.has(guess)) { seen.add(guess); return guess; }
      return null;
    });
    setMapping(auto);
  };

  const updateMapping = (idx: number, value: keyof Customer | null) => {
    setMapping(prev => {
      const next = [...prev];
      // If this field is already assigned elsewhere, clear that one
      if (value) {
        for (let i = 0; i < next.length; i++) {
          if (i !== idx && next[i] === value) next[i] = null;
        }
      }
      next[idx] = value;
      return next;
    });
  };

  const buildRows = (): Record<string, any>[] => {
    return rawRows.map(r => {
      const obj: Record<string, any> = {};
      mapping.forEach((field, i) => {
        if (field) {
          const val = parseValue(field, r[i] ?? "");
          if (val !== undefined) obj[field] = val;
        }
      });
      return obj;
    });
  };

  const computePreview = (): PreviewRow[] => {
    const rows = buildRows();
    const out: PreviewRow[] = [];
    for (const row of rows.slice(0, 5)) {
      const keyVal = normaliseKeyValue(row[mergeKey]);
      const name = (row.name as string)?.trim() || (row[mergeKey] as string)?.toString().trim() || "(blank)";
      if (!keyVal) {
        out.push({ raw: row, action: "skip", reason: `Missing ${String(mergeKey)}` });
        continue;
      }
      const existing = existingByKey.get(keyVal);
      if (existing) {
        const patchFields: string[] = [];
        for (const [k, v] of Object.entries(row)) {
          if (k === mergeKey) continue;
          if (isEmpty((existing as any)[k]) && !isEmpty(v)) {
            patchFields.push(k);
          }
        }
        if (patchFields.length === 0) {
          out.push({ raw: row, action: "unchanged", existing });
        } else {
          out.push({ raw: row, action: "merge", existing, patchFields });
        }
      } else {
        out.push({ raw: row, action: "create" });
      }
    }
    return out;
  };

  const goToPreview = () => {
    if (!mapping.includes(mergeKey)) {
      toast({ title: "Merge key column required", description: `Map a CSV column to the ${String(mergeKey)} field.`, variant: "destructive" });
      return;
    }
    setPreviewRows(computePreview());
    setStep("preview");
  };


  const handleImport = async () => {
    const rows = buildRows();
    if (rows.length === 0) return;
    setImporting(true);
    const res: ImportResult = { created: [], merged: [], skipped: [], unchanged: [] };

    for (const row of rows) {
      const keyVal = normaliseKeyValue(row[mergeKey]);
      const label = (row.name as string)?.trim() || (row[mergeKey] as string)?.toString().trim() || "(blank)";
      if (!keyVal) {
        res.skipped.push({ name: "(blank)", reason: `Missing ${String(mergeKey)}` });
        continue;
      }
      const existing = existingByKey.get(keyVal);
      if (existing) {
        const patch: Partial<Customer> = {};
        for (const [k, v] of Object.entries(row)) {
          if (k === mergeKey) continue;
          if (isEmpty((existing as any)[k]) && !isEmpty(v)) {
            (patch as any)[k] = v;
          }
        }
        const filledFields = Object.keys(patch);
        if (filledFields.length === 0) {
          res.unchanged.push(label);
        } else {
          const ok = await updateCustomer(existing.id, patch);
          if (ok) res.merged.push({ name: label, fields: filledFields });
          else res.skipped.push({ name: label, reason: "Update failed" });
        }
      } else {
        try {
          await addCustomer({ ...defaultCustomer(), ...row }, { skipDuplicateCheck: true });
          res.created.push(label);
        } catch {
          res.skipped.push({ name: label, reason: "Create failed" });
        }
      }
    }
    setImporting(false);
    setResult(res);
    toast({
      title: "Import complete",
      description: `${res.created.length} created · ${res.merged.length} merged · ${res.unchanged.length} unchanged · ${res.skipped.length} skipped`,
    });
  };

  const mappedCount = mapping.filter(Boolean).length;
  const hasMergeKeyMapping = mapping.includes(mergeKey);




  const actionBadge = (action: PreviewRow["action"]) => {
    switch (action) {
      case "create": return <Badge className="bg-emerald-600 hover:bg-emerald-700">Create</Badge>;
      case "merge": return <Badge className="bg-amber-500 hover:bg-amber-600">Merge</Badge>;
      case "unchanged": return <Badge variant="outline">Unchanged</Badge>;
      case "skip": return <Badge variant="destructive">Skip</Badge>;
    }
  };

  const mappedFieldKeys = useMemo(() => {
    const keys = mapping.filter(Boolean) as string[];
    // ensure name is first
    const ordered = keys.filter(k => k !== "name");
    if (keys.includes("name")) ordered.unshift("name");
    return ordered as (keyof Customer)[];
  }, [mapping]);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import Customers from CSV</DialogTitle>
          <DialogDescription>
            Existing customers are matched by name (case-insensitive). Missing fields are filled in; existing values are preserved.
          </DialogDescription>
        </DialogHeader>

        {/* ========== MAPPING STEP ========== */}
        {step === "mapping" && !result && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="csv-file">CSV file</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            {headers.length > 0 && (
              <div className="space-y-3">
                <Alert>
                  <AlertTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {rawRows.length} row(s) detected · {mappedCount} of {headers.length} columns mapped
                  </AlertTitle>
                  <AlertDescription>
                    Map each CSV column to a customer field. Unmapped columns are skipped. The selected <strong>merge key</strong> column is required.
                  </AlertDescription>
                </Alert>

                <div className="rounded border p-3 bg-muted/30 space-y-2">
                  <Label className="text-sm font-medium">Merge key</Label>
                  <Select value={mergeKey} onValueChange={(v) => setMergeKey(v as keyof Customer)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MERGE_KEY_OPTIONS.map(k => (
                        <SelectItem key={k} value={k}>{k}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Rows are matched to existing customers by this field (case-insensitive). A matching record is merged (missing fields filled in); otherwise a new customer is created.
                  </p>
                </div>

                <ScrollArea className="h-72 rounded border">
                  <div className="divide-y">
                    {headers.map((h, i) => {
                      const sample = rawRows[0]?.[i] ?? "";
                      const current = mapping[i];
                      return (
                        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 p-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{h || <em className="text-muted-foreground">(blank header)</em>}</div>
                            <div className="text-xs text-muted-foreground truncate">e.g. {cleanCell(sample) || "—"}</div>
                          </div>
                          <div className="text-muted-foreground text-xs hidden sm:block">→</div>
                          <Select
                            value={current ?? UNMAPPED}
                            onValueChange={(v) => updateMapping(i, v === UNMAPPED ? null : (v as keyof Customer))}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Skip this column" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNMAPPED}>— Skip this column —</SelectItem>
                              {CUSTOMER_KEYS.map(k => (
                                <SelectItem
                                  key={k}
                                  value={k}
                                  disabled={k !== current && usedFields.has(k)}
                                >
                                  {k}{k === mergeKey ? " (merge key)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>

                {!hasMergeKeyMapping && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Map a CSV column to the <strong>{String(mergeKey)}</strong> field (your selected merge key) to enable import.</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

          </div>
        )}

        {/* ========== PREVIEW STEP ========== */}
        {step === "preview" && !result && (
          <div className="space-y-4">
            <Alert>
              <AlertTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Previewing first {previewRows.length} of {rawRows.length} rows
              </AlertTitle>
              <AlertDescription>
                Review how CSV data maps to customer fields. Rows marked <strong>Create</strong> are new, <strong>Merge</strong> fills missing fields, <strong>Unchanged</strong> have no gaps, and <strong>Skip</strong> cannot be processed.
              </AlertDescription>
            </Alert>

            <ScrollArea className="max-h-[55vh] rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Action</th>
                    {mappedFieldKeys.map(k => (
                      <th key={String(k)} className="text-left px-3 py-2 font-medium whitespace-nowrap">{String(k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {previewRows.map((pr, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {actionBadge(pr.action)}
                          {pr.reason && <span className="text-xs text-muted-foreground">{pr.reason}</span>}
                          {pr.patchFields && pr.patchFields.length > 0 && (
                            <span className="text-xs text-muted-foreground">+ {pr.patchFields.join(", ")}</span>
                          )}
                        </div>
                      </td>
                      {mappedFieldKeys.map(k => {
                        const val = pr.raw[k];
                        const display = val === undefined || val === null ? "—" : String(val);
                        const isNewValue = pr.action === "merge" && pr.patchFields?.includes(String(k));
                        return (
                          <td key={String(k)} className={`px-3 py-2 max-w-[200px] truncate ${isNewValue ? "bg-amber-50 dark:bg-amber-950/20 font-medium" : ""}`} title={display}>
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            {rawRows.length > previewRows.length && (
              <div className="text-xs text-muted-foreground text-center">
                Showing first {previewRows.length} rows. {rawRows.length - previewRows.length} additional rows will be processed on import.
              </div>
            )}
          </div>
        )}

        {/* ========== RESULT STEP ========== */}
        {result && (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Import Summary</AlertTitle>
                <AlertDescription>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-sm">
                    <div><Badge>{result.created.length}</Badge> Created</div>
                    <div><Badge variant="secondary">{result.merged.length}</Badge> Merged</div>
                    <div><Badge variant="outline">{result.unchanged.length}</Badge> Unchanged</div>
                    <div><Badge variant="destructive">{result.skipped.length}</Badge> Skipped</div>
                  </div>
                </AlertDescription>
              </Alert>

              {result.created.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">Created</div>
                  <ul className="text-sm text-muted-foreground list-disc pl-5">
                    {result.created.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
              {result.merged.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">Merged (fields filled in)</div>
                  <ul className="text-sm text-muted-foreground list-disc pl-5">
                    {result.merged.map((m, i) => (
                      <li key={i}>{m.name} — {m.fields.join(", ")}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.unchanged.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">Unchanged (no missing fields)</div>
                  <ul className="text-sm text-muted-foreground list-disc pl-5">
                    {result.unchanged.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
              {result.skipped.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> Skipped
                  </div>
                  <ul className="text-sm text-muted-foreground list-disc pl-5">
                    {result.skipped.map((s, i) => <li key={i}>{s.name} — {s.reason}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          {!result ? (
            step === "mapping" ? (
              <>
                <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
                <Button onClick={goToPreview} disabled={rawRows.length === 0 || !hasMergeKeyMapping}>
                  Preview {rawRows.length > 0 ? `(${rawRows.length})` : ""}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep("mapping")}>Back to Mapping</Button>
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Import {rawRows.length > 0 ? `(${rawRows.length})` : ""}
                </Button>
              </>
            )
          ) : (
            <Button onClick={() => { reset(); onClose(); }}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
