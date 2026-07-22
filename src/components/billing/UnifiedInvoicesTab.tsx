import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, RefreshCw, Eye, CheckCircle2, Send, Pencil, Save, X, Plus, Trash2, Calculator, RotateCw, ChevronRight, ChevronDown, Layers, Printer, Download } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { formatGBP as fmtGBP } from "@/lib/currency";

interface InternalInvoice {
  id: string;
  period_id: string;
  customer_id: string;
  invoice_number: string;
  customer_name: string;
  call_package_name: string | null;
  va_package_name: string | null;
  call_base_charge: number;
  call_overage_charge: number;
  va_base_charge: number;
  va_overage_charge: number;
  va_task_charge: number;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  status: string;
  notes: string | null;
  xero_reference: string | null;
  created_at: string;
  approved_at: string | null;
}

interface CallLine {
  id: string;
  description: string | null;
  duration_seconds: number;
  charge: number;
  is_overage: boolean;
}
interface VaLine {
  id: string;
  description: string | null;
  billable_seconds: number;
  rate: number;
  charge: number;
}
interface DtLine {
  id: string;
  description: string | null;
  minutes: number;
  rate_per_minute: number;
  charge: number;
}

interface PeriodSummary {
  total_calls: number;
  included_calls: number;
  overage_calls: number;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  sent_to_xero: "outline",
  internal_record_only: "outline",
};


export function UnifiedInvoicesTab() {
  const [invoices, setInvoices] = useState<InternalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [viewing, setViewing] = useState<InternalInvoice | null>(null);
  const [callLines, setCallLines] = useState<CallLine[]>([]);
  const [vaLines, setVaLines] = useState<VaLine[]>([]);
  const [period, setPeriod] = useState<PeriodSummary | null>(null);
  const [packageAllowance, setPackageAllowance] = useState<number>(0);
  const [callRatePerCall, setCallRatePerCall] = useState<number>(0);
  const [vaPackageHours, setVaPackageHours] = useState<number>(0);
  const [vaHourlyRate, setVaHourlyRate] = useState<number>(0);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<InternalInvoice | null>(null);
  const [draftCallLines, setDraftCallLines] = useState<CallLine[]>([]);
  const [draftVaLines, setDraftVaLines] = useState<VaLine[]>([]);
  const [deletedCallLineIds, setDeletedCallLineIds] = useState<string[]>([]);
  const [deletedVaLineIds, setDeletedVaLineIds] = useState<string[]>([]);
  const [dtLines, setDtLines] = useState<DtLine[]>([]);


  // Account grouping
  const [combineByAccount, setCombineByAccount] = useState<boolean>(true);
  const [customerAccountMap, setCustomerAccountMap] = useState<Record<string, string | null>>({});
  const [accountNameMap, setAccountNameMap] = useState<Record<string, string>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [linesByInvoice, setLinesByInvoice] = useState<Record<string, { call: CallLine[]; va: VaLine[]; loading?: boolean }>>({});

  const toggleInvoiceLines = async (invoiceId: string) => {
    setExpandedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId); else next.add(invoiceId);
      return next;
    });
    if (linesByInvoice[invoiceId]) return;
    setLinesByInvoice((s) => ({ ...s, [invoiceId]: { call: [], va: [], loading: true } }));
    const [{ data: cl }, { data: vl }] = await Promise.all([
      supabase.from("invoice_call_lines").select("*").eq("invoice_id", invoiceId).order("created_at"),
      supabase.from("invoice_va_lines").select("*").eq("invoice_id", invoiceId).order("created_at"),
    ]);
    setLinesByInvoice((s) => ({
      ...s,
      [invoiceId]: { call: ((cl as any) || []) as CallLine[], va: ((vl as any) || []) as VaLine[], loading: false },
    }));
  };
  const [combinedView, setCombinedView] = useState<null | {
    title: string;
    periodLabel: string;
    invoices: InternalInvoice[];
    callLinesByInvoice: Record<string, CallLine[]>;
    vaLinesByInvoice: Record<string, VaLine[]>;
  }>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data, error }, { data: custData }, { data: accData }] = await Promise.all([
        supabase.from("internal_invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("customers").select("id, account_id"),
        supabase.from("customer_accounts").select("id, name"),
      ]);
      if (error) throw error;
      setInvoices((data as any) || []);
      const cMap: Record<string, string | null> = {};
      ((custData as any) || []).forEach((c: any) => { cMap[c.id] = c.account_id || null; });
      setCustomerAccountMap(cMap);
      const aMap: Record<string, string> = {};
      ((accData as any) || []).forEach((a: any) => { aMap[a.id] = a.name; });
      setAccountNameMap(aMap);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Error", description: "Failed to load invoices", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const periods = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i) => i.invoice_number && set.add(i.invoice_number.split("-").slice(-2).join("-")));
    return Array.from(set).sort().reverse();
  }, [invoices]);

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (periodFilter !== "all" && !i.invoice_number?.includes(periodFilter)) return false;
      return true;
    });
  }, [invoices, statusFilter, periodFilter]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, i) => ({
          call: acc.call + Number(i.call_base_charge || 0) + Number(i.call_overage_charge || 0),
          va:
            acc.va +
            Number(i.va_base_charge || 0) +
            Number(i.va_overage_charge || 0) +
            Number(i.va_task_charge || 0),
          vat: acc.vat + Number(i.vat_amount || 0),
          total: acc.total + Number(i.total || 0),
        }),
        { call: 0, va: 0, vat: 0, total: 0 }
      ),
    [filtered]
  );

  // ---- Account grouping ----
  type Group = {
    key: string;
    accountId: string;
    accountName: string;
    periodLabel: string;
    invoices: InternalInvoice[];
    callTotal: number;
    vaTotal: number;
    subtotal: number;
    vatAmount: number;
    total: number;
    statuses: Set<string>;
  };
  type RowItem = { kind: "invoice"; invoice: InternalInvoice } | { kind: "group"; group: Group };

  const extractPeriod = (inv: InternalInvoice): string => {
    const m = inv.invoice_number?.match(/^INT-(\d{4})(\d{2})-/);
    return m ? `${m[1]}-${m[2]}` : "unknown";
  };

  const grouped = useMemo(() => {
    if (!combineByAccount) {
      return filtered.map<RowItem>((i) => ({ kind: "invoice", invoice: i }));
    }
    const buckets = new Map<string, Group>();
    const out: RowItem[] = [];
    for (const inv of filtered) {
      const accountId = customerAccountMap[inv.customer_id] || null;
      if (!accountId) {
        out.push({ kind: "invoice", invoice: inv });
        continue;
      }
      const periodLabel = extractPeriod(inv);
      const key = `${accountId}|${periodLabel}`;
      let g = buckets.get(key);
      if (!g) {
        g = {
          key,
          accountId,
          accountName: accountNameMap[accountId] || "Account",
          periodLabel,
          invoices: [],
          callTotal: 0,
          vaTotal: 0,
          subtotal: 0,
          vatAmount: 0,
          total: 0,
          statuses: new Set<string>(),
        };
        buckets.set(key, g);
        out.push({ kind: "group", group: g });
      }
      g.invoices.push(inv);
      g.callTotal += Number(inv.call_base_charge || 0) + Number(inv.call_overage_charge || 0);
      g.vaTotal += Number(inv.va_base_charge || 0) + Number(inv.va_overage_charge || 0) + Number(inv.va_task_charge || 0);
      g.subtotal += Number(inv.subtotal || 0);
      g.vatAmount += Number(inv.vat_amount || 0);
      g.total += Number(inv.total || 0);
      g.statuses.add(inv.status);
    }
    // Drop synthetic "groups" of only one invoice — render as plain row.
    return out.map<RowItem>((r) => {
      if (r.kind === "group" && r.group.invoices.length === 1) {
        return { kind: "invoice", invoice: r.group.invoices[0] };
      }
      return r;
    });
  }, [filtered, combineByAccount, customerAccountMap, accountNameMap]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const openCombinedView = async (group: Group) => {
    const ids = group.invoices.map((i) => i.id);
    const [{ data: cl }, { data: vl }] = await Promise.all([
      supabase.from("invoice_call_lines").select("*").in("invoice_id", ids).order("created_at"),
      supabase.from("invoice_va_lines").select("*").in("invoice_id", ids).order("created_at"),
    ]);
    const callByInv: Record<string, CallLine[]> = {};
    ((cl as any) || []).forEach((l: any) => {
      (callByInv[l.invoice_id] ||= []).push(l as CallLine);
    });
    const vaByInv: Record<string, VaLine[]> = {};
    ((vl as any) || []).forEach((l: any) => {
      (vaByInv[l.invoice_id] ||= []).push(l as VaLine);
    });
    setCombinedView({
      title: `${group.accountName} — Combined invoice`,
      periodLabel: group.periodLabel,
      invoices: group.invoices,
      callLinesByInvoice: callByInv,
      vaLinesByInvoice: vaByInv,
    });
  };


  const openInvoice = async (inv: InternalInvoice) => {
    setViewing(inv);
    setEditMode(false);
    setDraft(null);
    setDeletedCallLineIds([]);
    setDeletedVaLineIds([]);
    setCallLines([]);
    setVaLines([]);
    setDtLines([]);
    setPeriod(null);
    setPackageAllowance(0);
    setCallRatePerCall(0);
    setVaPackageHours(0);
    setVaHourlyRate(0);
    const [{ data: cl }, { data: vl }, { data: dl }, { data: per }, { data: cust }] = await Promise.all([
      supabase.from("invoice_call_lines").select("*").eq("invoice_id", inv.id).order("created_at"),
      supabase.from("invoice_va_lines").select("*").eq("invoice_id", inv.id).order("created_at"),
      supabase.from("invoice_dt_lines" as any).select("*").eq("invoice_id", inv.id).order("created_at"),
      supabase.from("internal_billing_periods").select("total_calls, included_calls, overage_calls").eq("id", inv.period_id).maybeSingle(),
      supabase.from("customers").select("call_base_allowance, call_rate_per_call, va_packaged_hours, va_hourly_overage_rate").eq("id", inv.customer_id).maybeSingle(),
    ]);
    const callLineData = ((cl as any) || []) as CallLine[];
    const vaLineData = ((vl as any) || []) as VaLine[];
    setCallLines(callLineData);
    setVaLines(vaLineData);
    setDtLines(((dl as any) || []) as DtLine[]);
    setDraftCallLines(callLineData.map((l) => ({ ...l })));
    setDraftVaLines(vaLineData.map((l) => ({ ...l })));
    if (per) setPeriod(per as any);
    if (cust) {
      setPackageAllowance(Number((cust as any).call_base_allowance || 0));
      setCallRatePerCall(Number((cust as any).call_rate_per_call || 0));
      setVaPackageHours(Number((cust as any).va_packaged_hours || 0));
      setVaHourlyRate(Number((cust as any).va_hourly_overage_rate || 0));
    }
  };

  const startEdit = () => {
    if (!viewing) return;
    setDraft({ ...viewing });
    setDraftCallLines(callLines.map((l) => ({ ...l })));
    setDraftVaLines(vaLines.map((l) => ({ ...l })));
    setDeletedCallLineIds([]);
    setDeletedVaLineIds([]);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDraft(null);
    setDraftCallLines(callLines.map((l) => ({ ...l })));
    setDraftVaLines(vaLines.map((l) => ({ ...l })));
    setDeletedCallLineIds([]);
    setDeletedVaLineIds([]);
  };

  const updateDraft = (patch: Partial<InternalInvoice>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const recalcTotals = () => {
    if (!draft) return;
    const subtotal =
      Number(draft.call_base_charge || 0) +
      Number(draft.call_overage_charge || 0) +
      Number(draft.va_base_charge || 0) +
      Number(draft.va_overage_charge || 0) +
      Number(draft.va_task_charge || 0);
    const vat = +(subtotal * Number(draft.vat_rate || 0)).toFixed(2);
    const total = +(subtotal + vat).toFixed(2);
    updateDraft({ subtotal: +subtotal.toFixed(2), vat_amount: vat, total });
  };

  const OVERAGE_PREFIX = "Additional Inbound/Outbound Calls";
  const isOverageSummaryLine = (l: CallLine) =>
    !!l.description && l.description.trim().startsWith(OVERAGE_PREFIX);

  const buildOverageDescription = () => {
    const answered = period?.total_calls ?? 0;
    const pkgTotal = packageAllowance || period?.included_calls || 0;
    const over = Math.max(0, answered - pkgTotal);
    return {
      text: `${OVERAGE_PREFIX} (${pkgTotal} Calls Package Total - ${answered} Answered calls = ${over} calls Over the package)`,
      over,
    };
  };

  const addOverageSummaryLine = () => {
    // If a summary already exists, regenerate instead of duplicating.
    if (draftCallLines.some(isOverageSummaryLine)) {
      regenerateOverageSummaryLine();
      return;
    }
    const { text, over } = buildOverageDescription();
    const charge = +(over * callRatePerCall).toFixed(2);
    const newLine: CallLine = {
      id: `new-${Date.now()}`,
      description: text,
      duration_seconds: 0,
      charge,
      is_overage: true,
    };
    setDraftCallLines((lines) => [...lines, newLine]);
    if (draft) updateDraft({ call_overage_charge: +(Number(draft.call_overage_charge || 0) + charge).toFixed(2) });
  };

  const regenerateOverageSummaryLine = () => {
    const { text, over } = buildOverageDescription();
    const charge = +(over * callRatePerCall).toFixed(2);

    // Sum of all existing summary-line charges so we can swap them out of call_overage_charge.
    const existingSummaryCharges = draftCallLines
      .filter(isOverageSummaryLine)
      .reduce((acc, l) => acc + Number(l.charge || 0), 0);

    // Mark all persisted summary lines for deletion, drop unsaved ones, then append a fresh single line.
    setDeletedCallLineIds((ids) => [
      ...ids,
      ...draftCallLines.filter((l) => isOverageSummaryLine(l) && !l.id.startsWith("new-")).map((l) => l.id),
    ]);
    setDraftCallLines((lines) => [
      ...lines.filter((l) => !isOverageSummaryLine(l)),
      {
        id: `new-${Date.now()}`,
        description: text,
        duration_seconds: 0,
        charge,
        is_overage: true,
      },
    ]);

    if (draft) {
      const next = +(Number(draft.call_overage_charge || 0) - existingSummaryCharges + charge).toFixed(2);
      updateDraft({ call_overage_charge: next });
    }

    toast({
      title: "Overage summary regenerated",
      description: over > 0
        ? `${over} call(s) over package · ${fmtGBP(charge)}`
        : "No calls over the package for this period.",
    });
  };

  const VA_OVERAGE_PREFIX = "Additional Hours worked";
  const isVaOverageSummaryLine = (l: VaLine) =>
    !!l.description && l.description.trim().startsWith(VA_OVERAGE_PREFIX);

  const formatHours = (h: number) => {
    const rounded = Math.round(h * 100) / 100;
    return `${rounded.toFixed(2)}h`;
  };

  const buildVaOverageDescription = () => {
    const usedSeconds = draftVaLines
      .filter((l) => !isVaOverageSummaryLine(l))
      .reduce((acc, l) => acc + Number(l.billable_seconds || 0), 0);
    const usedHours = usedSeconds / 3600;
    const pkgHours = Number(vaPackageHours || 0);
    const overHours = Math.max(0, usedHours - pkgHours);
    return {
      text: `${VA_OVERAGE_PREFIX} (${formatHours(pkgHours)} Package Total - ${formatHours(usedHours)} Time Used = ${formatHours(overHours)} Time over the Package)`,
      overHours,
    };
  };

  const addVaOverageSummaryLine = () => {
    if (draftVaLines.some(isVaOverageSummaryLine)) {
      regenerateVaOverageSummaryLine();
      return;
    }
    const { text, overHours } = buildVaOverageDescription();
    const charge = +(overHours * vaHourlyRate).toFixed(2);
    const newLine: VaLine = {
      id: `new-${Date.now()}`,
      description: text,
      billable_seconds: Math.round(overHours * 3600),
      rate: vaHourlyRate,
      charge,
    };
    setDraftVaLines((lines) => [...lines, newLine]);
    if (draft) updateDraft({ va_overage_charge: +(Number(draft.va_overage_charge || 0) + charge).toFixed(2) });
  };

  const regenerateVaOverageSummaryLine = () => {
    const { text, overHours } = buildVaOverageDescription();
    const charge = +(overHours * vaHourlyRate).toFixed(2);

    const existingSummaryCharges = draftVaLines
      .filter(isVaOverageSummaryLine)
      .reduce((acc, l) => acc + Number(l.charge || 0), 0);

    setDeletedVaLineIds((ids) => [
      ...ids,
      ...draftVaLines.filter((l) => isVaOverageSummaryLine(l) && !l.id.startsWith("new-")).map((l) => l.id),
    ]);
    setDraftVaLines((lines) => [
      ...lines.filter((l) => !isVaOverageSummaryLine(l)),
      {
        id: `new-${Date.now()}`,
        description: text,
        billable_seconds: Math.round(overHours * 3600),
        rate: vaHourlyRate,
        charge,
      },
    ]);

    if (draft) {
      const next = +(Number(draft.va_overage_charge || 0) - existingSummaryCharges + charge).toFixed(2);
      updateDraft({ va_overage_charge: next });
    }

    toast({
      title: "VA overage summary regenerated",
      description: overHours > 0
        ? `${formatHours(overHours)} over package · ${fmtGBP(charge)}`
        : "No hours over the package for this period.",
    });
  };

  const addBlankCallLine = () => {
    setDraftCallLines((lines) => [
      ...lines,
      { id: `new-${Date.now()}-${Math.random()}`, description: "", duration_seconds: 0, charge: 0, is_overage: false },
    ]);
  };

  const addBlankVaLine = () => {
    setDraftVaLines((lines) => [
      ...lines,
      { id: `new-${Date.now()}-${Math.random()}`, description: "", billable_seconds: 0, rate: 0, charge: 0 },
    ]);
  };

  const updateCallLine = (id: string, patch: Partial<CallLine>) => {
    setDraftCallLines((lines) => lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const updateVaLine = (id: string, patch: Partial<VaLine>) => {
    setDraftVaLines((lines) => lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeCallLine = (id: string) => {
    if (!id.startsWith("new-")) setDeletedCallLineIds((ids) => [...ids, id]);
    setDraftCallLines((lines) => lines.filter((l) => l.id !== id));
  };

  const removeVaLine = (id: string) => {
    if (!id.startsWith("new-")) setDeletedVaLineIds((ids) => [...ids, id]);
    setDraftVaLines((lines) => lines.filter((l) => l.id !== id));
  };

  const saveEdit = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      // Update invoice header
      const { error: invErr } = await supabase
        .from("internal_invoices")
        .update({
          customer_name: draft.customer_name,
          call_package_name: draft.call_package_name,
          va_package_name: draft.va_package_name,
          call_base_charge: Number(draft.call_base_charge || 0),
          call_overage_charge: Number(draft.call_overage_charge || 0),
          va_base_charge: Number(draft.va_base_charge || 0),
          va_overage_charge: Number(draft.va_overage_charge || 0),
          va_task_charge: Number(draft.va_task_charge || 0),
          subtotal: Number(draft.subtotal || 0),
          vat_rate: Number(draft.vat_rate || 0),
          vat_amount: Number(draft.vat_amount || 0),
          total: Number(draft.total || 0),
          notes: draft.notes,
          xero_reference: draft.xero_reference,
        })
        .eq("id", draft.id);
      if (invErr) throw invErr;

      // Deletes
      if (deletedCallLineIds.length) {
        const { error } = await supabase.from("invoice_call_lines").delete().in("id", deletedCallLineIds);
        if (error) throw error;
      }
      if (deletedVaLineIds.length) {
        const { error } = await supabase.from("invoice_va_lines").delete().in("id", deletedVaLineIds);
        if (error) throw error;
      }

      // Upsert call lines
      for (const l of draftCallLines) {
        if (l.id.startsWith("new-")) {
          const { error } = await supabase.from("invoice_call_lines").insert({
            invoice_id: draft.id,
            description: l.description,
            duration_seconds: Number(l.duration_seconds || 0),
            charge: Number(l.charge || 0),
            is_overage: !!l.is_overage,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("invoice_call_lines")
            .update({
              description: l.description,
              duration_seconds: Number(l.duration_seconds || 0),
              charge: Number(l.charge || 0),
              is_overage: !!l.is_overage,
            })
            .eq("id", l.id);
          if (error) throw error;
        }
      }

      // Upsert va lines
      for (const l of draftVaLines) {
        if (l.id.startsWith("new-")) {
          const { error } = await supabase.from("invoice_va_lines").insert({
            invoice_id: draft.id,
            description: l.description,
            billable_seconds: Number(l.billable_seconds || 0),
            rate: Number(l.rate || 0),
            charge: Number(l.charge || 0),
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("invoice_va_lines")
            .update({
              description: l.description,
              billable_seconds: Number(l.billable_seconds || 0),
              rate: Number(l.rate || 0),
              charge: Number(l.charge || 0),
            })
            .eq("id", l.id);
          if (error) throw error;
        }
      }

      toast({ title: "Saved", description: "Invoice updated successfully." });
      setViewing(draft);
      setCallLines(draftCallLines.map((l) => ({ ...l })));
      setVaLines(draftVaLines.map((l) => ({ ...l })));
      setEditMode(false);
      setDeletedCallLineIds([]);
      setDeletedVaLineIds([]);
      await fetchInvoices();
      // refresh lines (to get real ids for newly-inserted rows)
      const [{ data: cl }, { data: vl }] = await Promise.all([
        supabase.from("invoice_call_lines").select("*").eq("invoice_id", draft.id).order("created_at"),
        supabase.from("invoice_va_lines").select("*").eq("invoice_id", draft.id).order("created_at"),
      ]);
      setCallLines((cl as any) || []);
      setVaLines((vl as any) || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to save invoice", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: "approved" | "sent_to_xero") => {
    try {
      const patch: any = { status };
      if (status === "approved") {
        patch.approved_at = new Date().toISOString();
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) patch.approved_by = userData.user.id;
      }
      const { error } = await supabase.from("internal_invoices").update(patch).eq("id", id);
      if (error) throw error;
      toast({ title: "Updated", description: `Invoice ${status.replace("_", " ")}.` });
      await fetchInvoices();
      if (viewing?.id === id) setViewing({ ...viewing, status });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ---- Selection / bulk reset & regenerate ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyBulk, setBusyBulk] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; mode: "selected" | "single" | "all-drafts" } | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState<{ ids: string[]; mode: "selected" | "single" } | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<{ ids: string[] } | null>(null);

  const draftIds = useMemo(() => new Set(filtered.filter((i) => i.status === "draft").map((i) => i.id)), [filtered]);
  const selectableDraftCount = draftIds.size;
  const selectedDraftIds = useMemo(
    () => Array.from(selectedIds).filter((id) => draftIds.has(id)),
    [selectedIds, draftIds]
  );
  const allDraftsSelected = selectableDraftCount > 0 && selectedDraftIds.length === selectableDraftCount;

  const toggleRowSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const toggleAllDraftsSelected = (checked: boolean) => {
    setSelectedIds(checked ? new Set(draftIds) : new Set());
  };

  // Parse 'YYYY-MM' from 'INT-YYYYMM-xxxxxx'
  const periodLabelFromInvoice = (inv: InternalInvoice): string | null => {
    const m = inv.invoice_number?.match(/^INT-(\d{4})(\d{2})-/);
    if (!m) return null;
    return `${m[1]}-${m[2]}`;
  };

  const deleteInvoicesByIds = async (ids: string[]) => {
    if (!ids.length) return;
    // Only delete drafts — server-side check is also in place via status filter.
    const { error } = await supabase.from("internal_invoices").delete().in("id", ids).eq("status", "draft");
    if (error) throw error;
  };

  const regenerateInvoicesByIds = async (ids: string[]) => {
    const targets = invoices.filter((i) => ids.includes(i.id) && i.status === "draft");
    let ok = 0;
    let failed = 0;
    for (const inv of targets) {
      const periodLabel = periodLabelFromInvoice(inv);
      if (!periodLabel) { failed++; continue; }
      try {
        const { error } = await supabase.rpc("generate_internal_invoice_for_period", {
          p_customer_id: inv.customer_id,
          p_period_label: periodLabel,
        });
        if (error) throw error;
        ok++;
      } catch (e) {
        failed++;
      }
    }
    return { ok, failed };
  };

  const runDelete = async () => {
    if (!confirmDelete) return;
    setBusyBulk(true);
    try {
      let ids = confirmDelete.ids;
      if (confirmDelete.mode === "all-drafts") {
        ids = Array.from(draftIds);
      }
      await deleteInvoicesByIds(ids);
      toast({ title: "Draft invoices cleared", description: `${ids.length} draft invoice(s) deleted.` });
      setSelectedIds(new Set());
      setConfirmDelete(null);
      await fetchInvoices();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message || "Could not delete drafts", variant: "destructive" });
    } finally {
      setBusyBulk(false);
    }
  };

  const runRegenerate = async () => {
    if (!confirmRegenerate) return;
    setBusyBulk(true);
    try {
      const { ok, failed } = await regenerateInvoicesByIds(confirmRegenerate.ids);
      toast({
        title: "Regeneration complete",
        description: `${ok} regenerated${failed ? ` · ${failed} failed/locked` : ""}.`,
        variant: failed && !ok ? "destructive" : "default",
      });
      setSelectedIds(new Set());
      setConfirmRegenerate(null);
      await fetchInvoices();
    } catch (e: any) {
      toast({ title: "Regenerate failed", description: e.message || "Could not regenerate drafts", variant: "destructive" });
    } finally {
      setBusyBulk(false);
    }
  };

  const runApprove = async () => {
    if (!confirmApprove) return;
    setBusyBulk(true);
    try {
      let ok = 0;
      let failed = 0;
      for (const id of confirmApprove.ids) {
        try {
          const patch: any = { status: "approved", approved_at: new Date().toISOString() };
          const { data: userData } = await supabase.auth.getUser();
          if (userData.user) patch.approved_by = userData.user.id;
          const { error } = await supabase.from("internal_invoices").update(patch).eq("id", id).eq("status", "draft");
          if (error) throw error;
          ok++;
        } catch {
          failed++;
        }
      }
      toast({
        title: "Approval complete",
        description: `${ok} approved${failed ? ` · ${failed} failed` : ""}.`,
        variant: failed && !ok ? "destructive" : "default",
      });
      setSelectedIds(new Set());
      setConfirmApprove(null);
      await fetchInvoices();
      if (viewing && confirmApprove.ids.includes(viewing.id)) {
        setViewing({ ...viewing, status: "approved" });
      }
    } catch (e: any) {
      toast({ title: "Approve failed", description: e.message || "Could not approve invoices", variant: "destructive" });
    } finally {
      setBusyBulk(false);
    }
  };

  const current = editMode ? draft : viewing;
  const currentCallLines = editMode ? draftCallLines : callLines;
  const currentVaLines = editMode ? draftVaLines : vaLines;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Unified Internal Invoices
          </CardTitle>
          <CardDescription>
            Combined Call Answering + Virtual Assistant invoice records. Internal only — Xero remains the source of truth for payments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="sent_to_xero">Sent to Xero</SelectItem>
                <SelectItem value="internal_record_only">Internal only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All periods</SelectItem>
                {periods.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="md:ml-auto flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Layers className="h-3.5 w-3.5" />
                Combine by Account
                <Switch checked={combineByAccount} onCheckedChange={setCombineByAccount} />
              </label>
              <Button variant="outline" onClick={fetchInvoices} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Call Revenue" value={fmtGBP(totals.call)} />
            <Stat label="VA Revenue" value={fmtGBP(totals.va)} />
            <Stat label="VAT" value={fmtGBP(totals.vat)} />
            <Stat label="Total (inc. VAT)" value={fmtGBP(totals.total)} highlight />
          </div>

          {/* Bulk actions toolbar */}
          <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-lg border bg-muted/30">
            <span className="text-xs text-muted-foreground">
              {selectedDraftIds.length > 0
                ? `${selectedDraftIds.length} draft${selectedDraftIds.length === 1 ? "" : "s"} selected`
                : selectableDraftCount > 0
                ? `${selectableDraftCount} draft${selectableDraftCount === 1 ? "" : "s"} available`
                : "No draft invoices to act on"}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="default"
                disabled={!selectedDraftIds.length || busyBulk}
                onClick={() => setConfirmApprove({ ids: selectedDraftIds })}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedDraftIds.length || busyBulk}
                onClick={() => setConfirmRegenerate({ ids: selectedDraftIds, mode: "selected" })}
              >
                <RotateCw className="h-3.5 w-3.5 mr-1" /> Regenerate selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedDraftIds.length || busyBulk}
                onClick={() => setConfirmDelete({ ids: selectedDraftIds, mode: "selected" })}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete selected
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!selectableDraftCount || busyBulk}
                onClick={() => setConfirmDelete({ ids: [], mode: "all-drafts" })}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear all drafts in view
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allDraftsSelected}
                      onCheckedChange={(c) => toggleAllDraftsSelected(!!c)}
                      disabled={!selectableDraftCount}
                      aria-label="Select all drafts in view"
                    />
                  </TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Call £</TableHead>
                  <TableHead className="text-right">VA £</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading…" : "No invoices found. Generate periods first."}
                    </TableCell>
                  </TableRow>
                ) : (
                  grouped.flatMap((row) => {
                    if (row.kind === "invoice") {
                      const i = row.invoice;
                      const callTotal = Number(i.call_base_charge || 0) + Number(i.call_overage_charge || 0);
                      const vaTotal =
                        Number(i.va_base_charge || 0) +
                        Number(i.va_overage_charge || 0) +
                        Number(i.va_task_charge || 0);
                      const isDraft = i.status === "draft";
                      return [(
                        <TableRow key={i.id} data-state={selectedIds.has(i.id) ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(i.id)}
                              disabled={!isDraft}
                              onCheckedChange={(c) => toggleRowSelected(i.id, !!c)}
                              aria-label={`Select invoice ${i.invoice_number}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                          <TableCell className="font-medium">{i.customer_name}</TableCell>
                          <TableCell className="text-right">{fmtGBP(callTotal)}</TableCell>
                          <TableCell className="text-right">{fmtGBP(vaTotal)}</TableCell>
                          <TableCell className="text-right">{fmtGBP(i.subtotal)}</TableCell>
                          <TableCell className="text-right">{fmtGBP(i.vat_amount)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmtGBP(i.total)}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANTS[i.status] || "secondary"}>
                              {i.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => openInvoice(i)} title="View / edit">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {isDraft && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => setConfirmRegenerate({ ids: [i.id], mode: "single" })} title="Regenerate from customer data" disabled={busyBulk}>
                                    <RotateCw className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete({ ids: [i.id], mode: "single" })} title="Delete draft" disabled={busyBulk}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                  <Button size="sm" onClick={() => updateStatus(i.id, "approved")} title="Approve">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              {i.status === "approved" && (
                                <Button size="sm" variant="outline" onClick={() => updateStatus(i.id, "sent_to_xero")} title="Mark sent to Xero">
                                  <Send className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )];
                    }

                    // group row
                    const g = row.group;
                    const isExpanded = expandedGroups.has(g.key);
                    const draftChildIds = g.invoices.filter((x) => x.status === "draft").map((x) => x.id);
                    const hasDrafts = draftChildIds.length > 0;
                    const allDraftChildSelected = hasDrafts && draftChildIds.every((id) => selectedIds.has(id));
                    const someDraftChildSelected = draftChildIds.some((id) => selectedIds.has(id));
                    const statusLabel = g.statuses.size === 1
                      ? Array.from(g.statuses)[0]
                      : `${g.statuses.size} statuses`;
                    const statusKey = g.statuses.size === 1 ? Array.from(g.statuses)[0] : "draft";
                    const customerNames = g.invoices.map((i) => i.customer_name).join(", ");

                    const rows: JSX.Element[] = [
                      <TableRow key={`grp-${g.key}`} className="bg-muted/40 hover:bg-muted/60">
                        <TableCell>
                          <Checkbox
                            checked={allDraftChildSelected}
                            disabled={!hasDrafts}
                            onCheckedChange={(c) => {
                              draftChildIds.forEach((id) => toggleRowSelected(id, !!c));
                            }}
                            aria-label={`Select all drafts in ${g.accountName}`}
                            data-state={someDraftChildSelected && !allDraftChildSelected ? "indeterminate" : undefined}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:underline"
                            onClick={() => toggleGroup(g.key)}
                            title={isExpanded ? "Collapse" : "Expand"}
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            <Layers className="h-3.5 w-3.5" />
                            <span>COMBINED · {g.periodLabel}</span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">{g.accountName}</div>
                          <div className="text-[11px] text-muted-foreground line-clamp-1">
                            {g.invoices.length} customers: {customerNames}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{fmtGBP(g.callTotal)}</TableCell>
                        <TableCell className="text-right">{fmtGBP(g.vaTotal)}</TableCell>
                        <TableCell className="text-right">{fmtGBP(g.subtotal)}</TableCell>
                        <TableCell className="text-right">{fmtGBP(g.vatAmount)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtGBP(g.total)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[statusKey] || "secondary"}>
                            {statusLabel.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => openCombinedView(g)} title="View combined invoice">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {hasDrafts && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => setConfirmRegenerate({ ids: draftChildIds, mode: "selected" })} title="Regenerate all drafts in group" disabled={busyBulk}>
                                  <RotateCw className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setConfirmDelete({ ids: draftChildIds, mode: "selected" })} title="Delete all drafts in group" disabled={busyBulk}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                                <Button size="sm" onClick={() => setConfirmApprove({ ids: draftChildIds })} title="Approve all drafts in group">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>,
                    ];

                    if (isExpanded) {
                      g.invoices.forEach((i) => {
                        const callTotal = Number(i.call_base_charge || 0) + Number(i.call_overage_charge || 0);
                        const vaTotal = Number(i.va_base_charge || 0) + Number(i.va_overage_charge || 0) + Number(i.va_task_charge || 0);
                        const isDraft = i.status === "draft";
                        const invExpanded = expandedInvoices.has(i.id);
                        const invLines = linesByInvoice[i.id];
                        rows.push(
                          <TableRow key={i.id} data-state={selectedIds.has(i.id) ? "selected" : undefined} className="bg-background">
                            <TableCell className="pl-8">
                              <Checkbox
                                checked={selectedIds.has(i.id)}
                                disabled={!isDraft}
                                onCheckedChange={(c) => toggleRowSelected(i.id, !!c)}
                                aria-label={`Select invoice ${i.invoice_number}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-foreground pl-6">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 hover:underline"
                                onClick={() => toggleInvoiceLines(i.id)}
                                title={invExpanded ? "Hide line items" : "Show line items"}
                              >
                                {invExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                ↳ {i.invoice_number}
                              </button>
                            </TableCell>
                            <TableCell className="text-sm pl-6">{i.customer_name}</TableCell>
                            <TableCell className="text-right text-xs">{fmtGBP(callTotal)}</TableCell>
                            <TableCell className="text-right text-xs">{fmtGBP(vaTotal)}</TableCell>
                            <TableCell className="text-right text-xs">{fmtGBP(i.subtotal)}</TableCell>
                            <TableCell className="text-right text-xs">{fmtGBP(i.vat_amount)}</TableCell>
                            <TableCell className="text-right text-xs">{fmtGBP(i.total)}</TableCell>
                            <TableCell>
                              <Badge variant={STATUS_VARIANTS[i.status] || "secondary"} className="text-[10px]">
                                {i.status.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => openInvoice(i)} title="View / edit individual">
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {isDraft && (
                                  <Button size="sm" variant="ghost" onClick={() => updateStatus(i.id, "approved")} title="Approve">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );

                        if (invExpanded) {
                          rows.push(
                            <TableRow key={`${i.id}-lines`} className="bg-muted/20">
                              <TableCell colSpan={10} className="py-3 pl-16 pr-4">
                                {invLines?.loading || !invLines ? (
                                  <div className="text-xs text-muted-foreground">Loading line items…</div>
                                ) : invLines.call.length === 0 && invLines.va.length === 0 ? (
                                  <div className="text-xs text-muted-foreground">No line items recorded for {i.customer_name}.</div>
                                ) : (
                                  <div className="space-y-3">
                                    {invLines.call.length > 0 && (
                                      <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                                          {i.customer_name} · Call Answering
                                        </div>
                                        <div className="border rounded">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead className="h-8 text-[11px]">Description</TableHead>
                                                <TableHead className="h-8 text-[11px] text-right w-20">Duration</TableHead>
                                                <TableHead className="h-8 text-[11px] w-20">Type</TableHead>
                                                <TableHead className="h-8 text-[11px] text-right w-24">Charge</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {invLines.call.map((l) => (
                                                <TableRow key={l.id}>
                                                  <TableCell className="text-xs py-1.5">{l.description || "Call"}</TableCell>
                                                  <TableCell className="text-xs text-right py-1.5">{l.duration_seconds}s</TableCell>
                                                  <TableCell className="py-1.5">
                                                    <Badge variant={l.is_overage ? "destructive" : "secondary"} className="text-[10px]">
                                                      {l.is_overage ? "overage" : "included"}
                                                    </Badge>
                                                  </TableCell>
                                                  <TableCell className="text-xs text-right py-1.5">{fmtGBP(l.charge)}</TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>
                                    )}
                                    {invLines.va.length > 0 && (
                                      <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                                          {i.customer_name} · Virtual Assistant
                                        </div>
                                        <div className="border rounded">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead className="h-8 text-[11px]">Description</TableHead>
                                                <TableHead className="h-8 text-[11px] text-right w-20">Hours</TableHead>
                                                <TableHead className="h-8 text-[11px] text-right w-20">Rate</TableHead>
                                                <TableHead className="h-8 text-[11px] text-right w-24">Charge</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {invLines.va.map((l) => (
                                                <TableRow key={l.id}>
                                                  <TableCell className="text-xs py-1.5">{l.description || "Task"}</TableCell>
                                                  <TableCell className="text-xs text-right py-1.5">{(Number(l.billable_seconds) / 3600).toFixed(2)}h</TableCell>
                                                  <TableCell className="text-xs text-right py-1.5">{fmtGBP(l.rate)}</TableCell>
                                                  <TableCell className="text-xs text-right py-1.5">{fmtGBP(l.charge)}</TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        }
                      });
                    }
                    return rows;
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Confirm delete */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete?.mode === "all-drafts"
                ? `Delete all ${selectableDraftCount} draft invoice(s) in view?`
                : confirmDelete?.mode === "selected"
                ? `Delete ${confirmDelete?.ids.length} selected draft(s)?`
                : "Delete this draft invoice?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the draft invoice and its line items. Only draft invoices are affected — approved or sent invoices are skipped. You can then amend the customer's package/pricing and use "Regenerate" to rebuild fresh drafts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyBulk}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runDelete} disabled={busyBulk}>
              {busyBulk ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm regenerate */}
      <AlertDialog open={!!confirmRegenerate} onOpenChange={(o) => !o && setConfirmRegenerate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmRegenerate?.mode === "selected"
                ? `Regenerate ${confirmRegenerate?.ids.length} draft invoice(s)?`
                : "Regenerate this draft invoice?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The draft will be rebuilt from the customer's current package, pricing, and the period's call & task data. Existing line items on the draft will be replaced. Approved or sent invoices are skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyBulk}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runRegenerate} disabled={busyBulk}>
              {busyBulk ? "Regenerating…" : "Regenerate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm bulk approve */}
      <AlertDialog open={!!confirmApprove} onOpenChange={(o) => !o && setConfirmApprove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Approve {confirmApprove?.ids.length} draft invoice(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the selected draft invoices as approved. Only draft invoices are affected — approved or sent invoices are skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyBulk}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runApprove} disabled={busyBulk}>
              {busyBulk ? "Approving…" : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && (setViewing(null), setEditMode(false))}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {current && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-2 flex-wrap">
                  <span>{current.invoice_number}</span>
                  <div className="flex gap-2">
                    {!editMode && viewing?.status !== "sent_to_xero" && (
                      <Button size="sm" variant="outline" onClick={startEdit}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                    )}
                    {editMode && (
                      <>
                        <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                          <X className="h-3.5 w-3.5 mr-1" /> Cancel
                        </Button>
                        <Button size="sm" onClick={saveEdit} disabled={saving}>
                          <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save"}
                        </Button>
                      </>
                    )}
                  </div>
                </DialogTitle>
                <DialogDescription>
                  {editMode ? (
                    <Input
                      value={current.customer_name || ""}
                      onChange={(e) => updateDraft({ customer_name: e.target.value })}
                      className="mt-2 max-w-md"
                    />
                  ) : (
                    <>
                      {current.customer_name} ·{" "}
                      <Badge variant={STATUS_VARIANTS[current.status] || "secondary"}>
                        {current.status.replace(/_/g, " ")}
                      </Badge>
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <Label className="text-muted-foreground text-xs">Call package</Label>
                    {editMode ? (
                      <Input
                        value={current.call_package_name || ""}
                        onChange={(e) => updateDraft({ call_package_name: e.target.value })}
                      />
                    ) : (
                      <div className="font-medium">{current.call_package_name || "—"}</div>
                    )}
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">VA package</Label>
                    {editMode ? (
                      <Input
                        value={current.va_package_name || ""}
                        onChange={(e) => updateDraft({ va_package_name: e.target.value })}
                      />
                    ) : (
                      <div className="font-medium">{current.va_package_name || "—"}</div>
                    )}
                  </div>
                </div>

                {/* Call Answering Lines */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold text-sm">Call Answering Lines</div>
                    {editMode && (
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={addOverageSummaryLine} title="Insert overage summary line from period totals">
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add overage summary
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={regenerateOverageSummaryLine}
                          disabled={!draftCallLines.some(isOverageSummaryLine)}
                          title="Recompute the overage summary line from the inputs below without duplicating"
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerate overage
                        </Button>
                        <Button size="sm" variant="outline" onClick={addBlankCallLine}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add line
                        </Button>
                      </div>
                    )}
                  </div>
                  {editMode && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2 p-2 rounded border bg-muted/30">
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Package total</Label>
                        <Input
                          type="number"
                          value={packageAllowance}
                          onChange={(e) => setPackageAllowance(Number(e.target.value))}
                          className="h-8 text-right text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Answered calls</Label>
                        <Input
                          type="number"
                          value={period?.total_calls ?? 0}
                          onChange={(e) =>
                            setPeriod((p) => ({
                              total_calls: Number(e.target.value),
                              included_calls: p?.included_calls ?? 0,
                              overage_calls: p?.overage_calls ?? 0,
                            }))
                          }
                          className="h-8 text-right text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Rate / call</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={callRatePerCall}
                          onChange={(e) => setCallRatePerCall(Number(e.target.value))}
                          className="h-8 text-right text-xs"
                        />
                      </div>
                      <div className="flex flex-col justify-end">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Over</span>
                        <span className="text-xs font-semibold tabular-nums">
                          {Math.max(0, (period?.total_calls ?? 0) - (packageAllowance || period?.included_calls || 0))} ·{" "}
                          {fmtGBP(
                            Math.max(0, (period?.total_calls ?? 0) - (packageAllowance || period?.included_calls || 0)) * callRatePerCall
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                  {editMode && (() => {
                    const missing: string[] = [];
                    if (!(packageAllowance > 0) && !(period?.included_calls ?? 0)) missing.push("package allowance");
                    if (!(callRatePerCall > 0)) missing.push("rate per call");
                    if ((period?.total_calls ?? 0) <= 0) missing.push("answered calls");
                    return missing.length ? (
                      <div className="text-[11px] mb-2 rounded border border-destructive/40 bg-destructive/10 text-destructive px-2 py-1">
                        Missing data for overage calculation: {missing.join(", ")}. The summary line may be inaccurate.
                      </div>
                    ) : null;
                  })()}
                  {currentCallLines.length === 0 ? (
                    <div className="text-xs text-muted-foreground border rounded p-3">No call lines.</div>
                  ) : (
                    <div className="border rounded overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right w-24">Duration</TableHead>
                            <TableHead className="w-28">Type</TableHead>
                            <TableHead className="text-right w-28">Charge</TableHead>
                            {editMode && <TableHead className="w-10"></TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentCallLines.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="text-xs">
                                {editMode ? (
                                  <Textarea
                                    value={l.description || ""}
                                    onChange={(e) => updateCallLine(l.id, { description: e.target.value })}
                                    className="min-h-[2.25rem] text-xs"
                                    rows={2}
                                  />
                                ) : (
                                  l.description || "Call"
                                )}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {editMode ? (
                                  <Input
                                    type="number"
                                    value={l.duration_seconds}
                                    onChange={(e) => updateCallLine(l.id, { duration_seconds: Number(e.target.value) })}
                                    className="h-8 text-right text-xs"
                                  />
                                ) : (
                                  `${l.duration_seconds}s`
                                )}
                              </TableCell>
                              <TableCell>
                                {editMode ? (
                                  <Select
                                    value={l.is_overage ? "overage" : "included"}
                                    onValueChange={(v) => updateCallLine(l.id, { is_overage: v === "overage" })}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="included">included</SelectItem>
                                      <SelectItem value="overage">overage</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Badge variant={l.is_overage ? "destructive" : "secondary"} className="text-xs">
                                    {l.is_overage ? "overage" : "included"}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {editMode ? (
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={l.charge}
                                    onChange={(e) => updateCallLine(l.id, { charge: Number(e.target.value) })}
                                    className="h-8 text-right text-xs"
                                  />
                                ) : (
                                  fmtGBP(l.charge)
                                )}
                              </TableCell>
                              {editMode && (
                                <TableCell>
                                  <Button size="icon" variant="ghost" onClick={() => removeCallLine(l.id)}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* VA Lines */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold text-sm">Virtual Assistant Lines</div>
                    {editMode && (
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={addVaOverageSummaryLine} title="Insert VA hours overage summary line">
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add hours overage
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={regenerateVaOverageSummaryLine}
                          disabled={!draftVaLines.some(isVaOverageSummaryLine)}
                          title="Recompute the VA hours overage summary line without duplicating"
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerate hours overage
                        </Button>
                        <Button size="sm" variant="outline" onClick={addBlankVaLine}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add line
                        </Button>
                      </div>
                    )}
                  </div>
                  {editMode && (() => {
                    const usedSec = draftVaLines
                      .filter((l) => !isVaOverageSummaryLine(l))
                      .reduce((acc, l) => acc + Number(l.billable_seconds || 0), 0);
                    const usedH = usedSec / 3600;
                    const overH = Math.max(0, usedH - Number(vaPackageHours || 0));
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2 p-2 rounded border bg-muted/30">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Package hours</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={vaPackageHours}
                            onChange={(e) => setVaPackageHours(Number(e.target.value))}
                            className="h-8 text-right text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Time used (h)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={usedH.toFixed(2)}
                            readOnly
                            className="h-8 text-right text-xs bg-background/50"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Rate / hour</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={vaHourlyRate}
                            onChange={(e) => setVaHourlyRate(Number(e.target.value))}
                            className="h-8 text-right text-xs"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Over</span>
                          <span className="text-xs font-semibold tabular-nums">
                            {overH.toFixed(2)}h · {fmtGBP(overH * vaHourlyRate)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                  {editMode && (() => {
                    const usedSec = draftVaLines
                      .filter((l) => !isVaOverageSummaryLine(l))
                      .reduce((acc, l) => acc + Number(l.billable_seconds || 0), 0);
                    const missing: string[] = [];
                    if (!(vaPackageHours > 0)) missing.push("VA package hours");
                    if (!(vaHourlyRate > 0)) missing.push("VA hourly rate");
                    if (usedSec <= 0) missing.push("billable VA time");
                    return missing.length ? (
                      <div className="text-[11px] mb-2 rounded border border-destructive/40 bg-destructive/10 text-destructive px-2 py-1">
                        Missing data for VA overage calculation: {missing.join(", ")}. The summary line may be inaccurate.
                      </div>
                    ) : null;
                  })()}
                  {currentVaLines.length === 0 ? (
                    <div className="text-xs text-muted-foreground border rounded p-3">No VA lines.</div>
                  ) : (
                    <div className="border rounded overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right w-24">Time (h)</TableHead>
                            <TableHead className="text-right w-24">Rate</TableHead>
                            <TableHead className="text-right w-28">Charge</TableHead>
                            {editMode && <TableHead className="w-10"></TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentVaLines.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="text-xs">
                                {editMode ? (
                                  <Textarea
                                    value={l.description || ""}
                                    onChange={(e) => updateVaLine(l.id, { description: e.target.value })}
                                    className="min-h-[2.25rem] text-xs"
                                    rows={2}
                                  />
                                ) : (
                                  l.description || "Task"
                                )}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {editMode ? (
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={(Number(l.billable_seconds) / 3600).toFixed(2)}
                                    onChange={(e) => updateVaLine(l.id, { billable_seconds: Math.round(Number(e.target.value) * 3600) })}
                                    className="h-8 text-right text-xs"
                                  />
                                ) : (
                                  `${(Number(l.billable_seconds) / 3600).toFixed(2)}h`
                                )}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {editMode ? (
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={l.rate}
                                    onChange={(e) => updateVaLine(l.id, { rate: Number(e.target.value) })}
                                    className="h-8 text-right text-xs"
                                  />
                                ) : (
                                  fmtGBP(l.rate)
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {editMode ? (
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={l.charge}
                                    onChange={(e) => updateVaLine(l.id, { charge: Number(e.target.value) })}
                                    className="h-8 text-right text-xs"
                                  />
                                ) : (
                                  fmtGBP(l.charge)
                                )}
                              </TableCell>
                              {editMode && (
                                <TableCell>
                                  <Button size="icon" variant="ghost" onClick={() => removeVaLine(l.id)}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Digital Typing Lines (read-only — sourced from DT-tagged tasks) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold text-sm">Digital Typing Lines</div>
                    <div className="text-xs text-muted-foreground">
                      Pulled from tasks tagged Digital Typing. Re-generate the period to refresh.
                    </div>
                  </div>
                  {dtLines.length === 0 ? (
                    <div className="text-xs text-muted-foreground rounded border bg-muted/20 p-3">
                      No Digital Typing tasks recorded for this period.
                    </div>
                  ) : (
                    <div className="rounded border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Minutes</TableHead>
                            <TableHead className="text-right">Rate (£/min)</TableHead>
                            <TableHead className="text-right">Charge</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dtLines.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="text-sm">{l.description || "Digital Typing task"}</TableCell>
                              <TableCell className="text-right tabular-nums">{Number(l.minutes).toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtGBP(Number(l.rate_per_minute))}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{fmtGBP(Number(l.charge))}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell colSpan={3} className="text-right text-sm font-semibold">Digital Typing subtotal</TableCell>
                            <TableCell className="text-right text-sm font-bold tabular-nums">
                              {fmtGBP(dtLines.reduce((acc, l) => acc + Number(l.charge || 0), 0))}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Totals (editable in edit mode) */}

                <div className="border-t pt-3 space-y-2 text-sm">
                  {editMode ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <EditNumber label="Call base" value={draft!.call_base_charge} onChange={(v) => updateDraft({ call_base_charge: v })} />
                      <EditNumber label="Call overage" value={draft!.call_overage_charge} onChange={(v) => updateDraft({ call_overage_charge: v })} />
                      <EditNumber label="VA base" value={draft!.va_base_charge} onChange={(v) => updateDraft({ va_base_charge: v })} />
                      <EditNumber label="VA overage" value={draft!.va_overage_charge} onChange={(v) => updateDraft({ va_overage_charge: v })} />
                      <EditNumber label="VA task" value={draft!.va_task_charge} onChange={(v) => updateDraft({ va_task_charge: v })} />
                      <EditNumber label="VAT rate (e.g. 0.20)" value={draft!.vat_rate} step={0.01} onChange={(v) => updateDraft({ vat_rate: v })} />
                      <div className="md:col-span-2 flex items-center justify-between rounded border p-2 bg-muted/30">
                        <Button size="sm" variant="outline" onClick={recalcTotals}>
                          <Calculator className="h-3.5 w-3.5 mr-1" /> Recalculate totals
                        </Button>
                        <div className="text-right text-sm space-y-0.5">
                          <div>Subtotal: <span className="font-semibold">{fmtGBP(draft!.subtotal)}</span></div>
                          <div>VAT: <span className="font-semibold">{fmtGBP(draft!.vat_amount)}</span></div>
                          <div className="text-base">Total: <span className="font-bold">{fmtGBP(draft!.total)}</span></div>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs text-muted-foreground">Notes</Label>
                        <Textarea
                          value={draft!.notes || ""}
                          onChange={(e) => updateDraft({ notes: e.target.value })}
                          rows={2}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <Row label="Call Answering" value={fmtGBP(Number(current.call_base_charge) + Number(current.call_overage_charge))} />
                      <Row label="Virtual Assistant" value={fmtGBP(Number(current.va_base_charge) + Number(current.va_overage_charge) + Number(current.va_task_charge))} />
                      <Row label="Subtotal" value={fmtGBP(current.subtotal)} />
                      <Row label={`VAT (${(Number(current.vat_rate) * 100).toFixed(0)}%)`} value={fmtGBP(current.vat_amount)} />
                      <Row label="Total" value={fmtGBP(current.total)} bold />
                      {current.notes && (
                        <div className="pt-2 text-xs text-muted-foreground whitespace-pre-wrap">{current.notes}</div>
                      )}
                    </>
                  )}
                </div>

                {!editMode && (
                  <div className="flex justify-end gap-2 pt-2">
                    {current.status === "draft" && (
                      <Button onClick={() => updateStatus(current.id, "approved")}>
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                      </Button>
                    )}
                    {current.status === "approved" && (
                      <Button variant="outline" onClick={() => updateStatus(current.id, "sent_to_xero")}>
                        <Send className="h-4 w-4 mr-2" /> Mark Sent to Xero
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Combined invoice view */}
      <Dialog open={!!combinedView} onOpenChange={(o) => !o && setCombinedView(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {combinedView && (() => {
            const totalsCombined = combinedView.invoices.reduce(
              (acc, i) => ({
                call: acc.call + Number(i.call_base_charge || 0) + Number(i.call_overage_charge || 0),
                va: acc.va + Number(i.va_base_charge || 0) + Number(i.va_overage_charge || 0) + Number(i.va_task_charge || 0),
                subtotal: acc.subtotal + Number(i.subtotal || 0),
                vat: acc.vat + Number(i.vat_amount || 0),
                total: acc.total + Number(i.total || 0),
              }),
              { call: 0, va: 0, subtotal: 0, vat: 0, total: 0 }
            );
            const escapeCsv = (v: any) => {
              const s = v === null || v === undefined ? "" : String(v);
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const exportCsv = () => {
              const rows: string[][] = [];
              rows.push(["Account", combinedView.title.replace(" — Combined invoice", "")]);
              rows.push(["Period", combinedView.periodLabel]);
              rows.push([]);
              rows.push(["Customer", "Invoice #", "Section", "Description", "Qty/Duration", "Rate/Type", "Charge"]);
              combinedView.invoices.forEach((inv) => {
                const cLines = combinedView.callLinesByInvoice[inv.id] || [];
                const vLines = combinedView.vaLinesByInvoice[inv.id] || [];
                cLines.forEach((l) => rows.push([
                  inv.customer_name, inv.invoice_number, "Call",
                  l.description || "Call", `${l.duration_seconds}s`,
                  l.is_overage ? "overage" : "included", Number(l.charge || 0).toFixed(2),
                ]));
                vLines.forEach((l) => rows.push([
                  inv.customer_name, inv.invoice_number, "VA",
                  l.description || "Task", `${(Number(l.billable_seconds) / 3600).toFixed(2)}h`,
                  Number(l.rate || 0).toFixed(2), Number(l.charge || 0).toFixed(2),
                ]));
                rows.push([inv.customer_name, inv.invoice_number, "Subtotal", "", "", "", Number(inv.subtotal || 0).toFixed(2)]);
                rows.push([inv.customer_name, inv.invoice_number, "VAT", "", "", "", Number(inv.vat_amount || 0).toFixed(2)]);
                rows.push([inv.customer_name, inv.invoice_number, "Total", "", "", "", Number(inv.total || 0).toFixed(2)]);
                rows.push([]);
              });
              rows.push(["", "", "", "", "", "Combined Call", totalsCombined.call.toFixed(2)]);
              rows.push(["", "", "", "", "", "Combined VA", totalsCombined.va.toFixed(2)]);
              rows.push(["", "", "", "", "", "Combined Subtotal", totalsCombined.subtotal.toFixed(2)]);
              rows.push(["", "", "", "", "", "Combined VAT", totalsCombined.vat.toFixed(2)]);
              rows.push(["", "", "", "", "", "Combined Total", totalsCombined.total.toFixed(2)]);
              const csv = rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              const safe = combinedView.title.replace(/[^a-z0-9]+/gi, "_");
              a.href = url; a.download = `${safe}_${combinedView.periodLabel}.csv`; a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            };
            const printCombined = () => {
              const w = window.open("", "_blank", "width=900,height=1000");
              if (!w) return;
              const fmt = (n: number) => `£${Number(n || 0).toFixed(2)}`;
              const esc = (s: unknown) =>
                String(s ?? "")
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;")
                  .replace(/'/g, "&#39;");
              const sections = combinedView.invoices.map((inv) => {
                const cLines = combinedView.callLinesByInvoice[inv.id] || [];
                const vLines = combinedView.vaLinesByInvoice[inv.id] || [];
                const callRows = cLines.map((l) => `<tr><td>${esc(l.description || "Call")}</td><td style="text-align:right">${esc(l.duration_seconds)}s</td><td>${l.is_overage ? "overage" : "included"}</td><td style="text-align:right">${esc(fmt(l.charge))}</td></tr>`).join("");
                const vaRows = vLines.map((l) => `<tr><td>${esc(l.description || "Task")}</td><td style="text-align:right">${esc((Number(l.billable_seconds) / 3600).toFixed(2))}h</td><td style="text-align:right">${esc(fmt(l.rate))}</td><td style="text-align:right">${esc(fmt(l.charge))}</td></tr>`).join("");
                return `
                  <div class="cust">
                    <div class="cust-h"><strong>${esc(inv.customer_name)}</strong> <span class="mono">${esc(inv.invoice_number)}</span></div>
                    ${cLines.length ? `<div class="sec">Call Answering</div><table><thead><tr><th>Description</th><th style="text-align:right">Duration</th><th>Type</th><th style="text-align:right">Charge</th></tr></thead><tbody>${callRows}</tbody></table>` : ""}
                    ${vLines.length ? `<div class="sec">Virtual Assistant</div><table><thead><tr><th>Description</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate</th><th style="text-align:right">Charge</th></tr></thead><tbody>${vaRows}</tbody></table>` : ""}
                    <div class="sub">Subtotal: <strong>${esc(fmt(inv.subtotal))}</strong> &nbsp; VAT: <strong>${esc(fmt(inv.vat_amount))}</strong> &nbsp; Total: <strong>${esc(fmt(inv.total))}</strong></div>
                  </div>`;
              }).join("");
              w.document.write(`<!doctype html><html><head><title>${esc(combinedView.title)}</title>
                <style>
                  body{font-family:Arial,sans-serif;color:#222;padding:24px;font-size:12px}
                  h1{font-size:18px;margin:0 0 4px}
                  .meta{color:#666;margin-bottom:16px}
                  .totals{display:flex;gap:16px;margin:12px 0 20px;padding:10px;border:1px solid #ddd;border-radius:6px}
                  .totals div{flex:1}
                  .totals .lbl{color:#666;font-size:10px;text-transform:uppercase}
                  table{width:100%;border-collapse:collapse;margin:6px 0 10px}
                  th,td{border-bottom:1px solid #eee;padding:4px 6px;font-size:11px;text-align:left}
                  th{background:#f7f7f7}
                  .cust{border:1px solid #ddd;border-radius:6px;padding:10px;margin-bottom:14px;page-break-inside:avoid}
                  .cust-h{margin-bottom:6px}
                  .mono{font-family:monospace;color:#666;font-size:10px}
                  .sec{font-weight:bold;font-size:11px;margin-top:6px}
                  .sub{text-align:right;font-size:11px;margin-top:6px}
                  .grand{margin-top:20px;padding-top:10px;border-top:2px solid #222;text-align:right;font-size:14px}
                  @media print{ body{padding:12px} }
                </style></head><body>
                <h1>${esc(combinedView.title)}</h1>
                <div class="meta">Period ${esc(combinedView.periodLabel)} · ${combinedView.invoices.length} customers</div>
                <div class="totals">
                  <div><div class="lbl">Call</div><strong>${esc(fmt(totalsCombined.call))}</strong></div>
                  <div><div class="lbl">VA</div><strong>${esc(fmt(totalsCombined.va))}</strong></div>
                  <div><div class="lbl">Subtotal</div><strong>${esc(fmt(totalsCombined.subtotal))}</strong></div>
                  <div><div class="lbl">VAT</div><strong>${esc(fmt(totalsCombined.vat))}</strong></div>
                  <div><div class="lbl">Total</div><strong>${esc(fmt(totalsCombined.total))}</strong></div>
                </div>
                ${sections}
                <div class="grand">Combined Total (inc. VAT): <strong>${esc(fmt(totalsCombined.total))}</strong></div>
                <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
              </body></html>`);
              w.document.close();
            };
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5" /> {combinedView.title}
                  </DialogTitle>
                  <DialogDescription>
                    Period {combinedView.periodLabel} · {combinedView.invoices.length} customers grouped under this Account.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex justify-end gap-2 mb-3">
                  <Button size="sm" variant="outline" onClick={exportCsv}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={printCombined}>
                    <Printer className="h-3.5 w-3.5 mr-1" /> Print / PDF
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                  <Stat label="Call" value={fmtGBP(totalsCombined.call)} />
                  <Stat label="VA" value={fmtGBP(totalsCombined.va)} />
                  <Stat label="Subtotal" value={fmtGBP(totalsCombined.subtotal)} />
                  <Stat label="VAT" value={fmtGBP(totalsCombined.vat)} />
                  <Stat label="Total" value={fmtGBP(totalsCombined.total)} highlight />
                </div>

                <div className="space-y-6">
                  {combinedView.invoices.map((inv) => {
                    const cLines = combinedView.callLinesByInvoice[inv.id] || [];
                    const vLines = combinedView.vaLinesByInvoice[inv.id] || [];
                    return (
                      <div key={inv.id} className="border rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <div className="font-semibold">{inv.customer_name}</div>
                            <div className="text-xs font-mono text-muted-foreground">{inv.invoice_number}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={STATUS_VARIANTS[inv.status] || "secondary"}>{inv.status.replace(/_/g, " ")}</Badge>
                            <Button size="sm" variant="outline" onClick={() => { setCombinedView(null); openInvoice(inv); }}>
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Open / edit
                            </Button>
                          </div>
                        </div>

                        {cLines.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold mb-1">Call Answering</div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Description</TableHead>
                                  <TableHead className="text-right w-24">Duration</TableHead>
                                  <TableHead className="w-24">Type</TableHead>
                                  <TableHead className="text-right w-28">Charge</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {cLines.map((l) => (
                                  <TableRow key={l.id}>
                                    <TableCell className="text-xs">{l.description || "Call"}</TableCell>
                                    <TableCell className="text-right text-xs">{l.duration_seconds}s</TableCell>
                                    <TableCell>
                                      <Badge variant={l.is_overage ? "destructive" : "secondary"} className="text-[10px]">
                                        {l.is_overage ? "overage" : "included"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right text-xs">{fmtGBP(l.charge)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}

                        {vLines.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold mb-1">Virtual Assistant</div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Description</TableHead>
                                  <TableHead className="text-right w-24">Hours</TableHead>
                                  <TableHead className="text-right w-24">Rate</TableHead>
                                  <TableHead className="text-right w-28">Charge</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {vLines.map((l) => (
                                  <TableRow key={l.id}>
                                    <TableCell className="text-xs">{l.description || "Task"}</TableCell>
                                    <TableCell className="text-right text-xs">{(Number(l.billable_seconds) / 3600).toFixed(2)}h</TableCell>
                                    <TableCell className="text-right text-xs">{fmtGBP(l.rate)}</TableCell>
                                    <TableCell className="text-right text-xs">{fmtGBP(l.charge)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}

                        <div className="flex justify-end text-xs gap-6">
                          <span>Subtotal: <strong>{fmtGBP(inv.subtotal)}</strong></span>
                          <span>VAT: <strong>{fmtGBP(inv.vat_amount)}</strong></span>
                          <span>Total: <strong>{fmtGBP(inv.total)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-4 border-t mt-4">
                  <Row label="Combined Total (inc. VAT)" value={fmtGBP(totalsCombined.total)} bold />
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "bg-primary/5 border-primary/30" : "bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EditNumber({
  label,
  value,
  onChange,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 text-right"
      />
    </div>
  );
}
