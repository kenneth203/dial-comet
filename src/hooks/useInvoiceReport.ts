import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { secureLog } from "@/lib/secureLogger";

export type InvoiceSource = "crm" | "billing" | "legacy_billing";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export interface UnifiedInvoiceRow {
  source: InvoiceSource;
  invoice_id: string;
  invoice_number: string | null;
  customer_id: string | null;
  customer_name: string;
  issued_date: string | null;
  due_date: string | null;
  period_label: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  status_normalised: InvoiceStatus;
  created_at: string;
}

export interface InvoiceTotals {
  count: number;
  invoiced: number;
  vat: number;
  paid: number;
  outstanding: number;
  overdue: number;
}

export interface InvoiceReportTotals {
  all: InvoiceTotals;
  crm: InvoiceTotals;
  billing: InvoiceTotals;
}

const EMPTY: InvoiceTotals = { count: 0, invoiced: 0, vat: 0, paid: 0, outstanding: 0, overdue: 0 };

/** Rows that count towards financial totals (drafts and cancellations excluded). */
export function isCountable(row: UnifiedInvoiceRow) {
  return row.status_normalised !== "draft" && row.status_normalised !== "cancelled";
}

function accumulate(rows: UnifiedInvoiceRow[]): InvoiceTotals {
  return rows.reduce<InvoiceTotals>((acc, r) => {
    if (!isCountable(r)) return acc;
    const total = Number(r.total) || 0;
    acc.count += 1;
    acc.invoiced += total;
    acc.vat += Number(r.vat_amount) || 0;
    if (r.status_normalised === "paid") acc.paid += total;
    else acc.outstanding += total;
    if (r.status_normalised === "overdue") acc.overdue += total;
    return acc;
  }, { ...EMPTY });
}

/**
 * Shared invoice reporting hook.
 *
 * Reads the combined CRM (proposal) + Billing (internal/legacy) invoice
 * stream through the `get_invoice_report` RPC so every screen reports the
 * exact same figures.
 */
export function useInvoiceReport(from?: string | null, to?: string | null) {
  const [rows, setRows] = useState<UnifiedInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await (supabase as any).rpc("get_invoice_report", {
        p_from: from ?? null,
        p_to: to ?? null,
      });
      if (rpcError) throw rpcError;
      setRows(((data as UnifiedInvoiceRow[]) || []).map((r) => ({
        ...r,
        subtotal: Number(r.subtotal) || 0,
        vat_amount: Number(r.vat_amount) || 0,
        total: Number(r.total) || 0,
      })));
    } catch (e: any) {
      secureLog.error("Failed to load invoice report", e);
      setError("Unable to load invoice figures");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo<InvoiceReportTotals>(() => ({
    all: accumulate(rows),
    crm: accumulate(rows.filter((r) => r.source === "crm")),
    billing: accumulate(rows.filter((r) => r.source !== "crm")),
  }), [rows]);

  return { rows, totals, loading, error, refresh: load };
}

/** Convenience: first day / last day of the current month as ISO dates. */
export function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(start), to: iso(end) };
}
