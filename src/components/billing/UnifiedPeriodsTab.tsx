import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Play, RefreshCw, CheckCircle2, Send, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatGBP as fmtGBP } from "@/lib/currency";

interface PeriodRow {
  id: string;
  customer_id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  total_calls: number;
  overage_calls: number;
  total_va_seconds: number;
  overage_va_seconds: number;
  call_base_charge: number;
  call_overage_charge: number;
  va_base_charge: number;
  va_overage_charge: number;
  va_task_charge: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  status: string;
  generated_at: string | null;
  customer_name?: string;
  invoice_id?: string | null;
  invoice_status?: string | null;
}

interface CustomerOpt {
  id: string;
  name: string;
}

function currentPeriodLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}


const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  sent_to_xero: "outline",
  internal_record_only: "outline",
};

export function UnifiedPeriodsTab() {
  const [periodLabel, setPeriodLabel] = useState(currentPeriodLabel());
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: custData }, { data: periods, error }] = await Promise.all([
        supabase.from("customers").select("id,name").order("name"),
        supabase
          .from("internal_billing_periods")
          .select("*")
          .eq("period_label", periodLabel)
          .order("updated_at", { ascending: false }),
      ]);

      if (error) throw error;

      const custList = (custData || []).map((c: any) => ({ id: c.id, name: c.name }));
      setCustomers(custList);
      const nameMap = new Map(custList.map((c) => [c.id, c.name]));

      const periodIds = (periods || []).map((p: any) => p.id);
      let invMap = new Map<string, { id: string; status: string }>();
      if (periodIds.length) {
        const { data: invs } = await supabase
          .from("internal_invoices")
          .select("id,period_id,status")
          .in("period_id", periodIds);
        invMap = new Map((invs || []).map((i: any) => [i.period_id, { id: i.id, status: i.status }]));
      }

      setRows(
        (periods || []).map((p: any) => ({
          ...p,
          customer_name: nameMap.get(p.customer_id) || "Unknown",
          invoice_id: invMap.get(p.id)?.id ?? null,
          invoice_status: invMap.get(p.id)?.status ?? null,
        }))
      );
    } catch (e: any) {
      console.error("Periods fetch error:", e);
      toast({ title: "Error", description: "Failed to load billing periods", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [periodLabel]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRows = useMemo(
    () => (customerFilter === "all" ? rows : rows.filter((r) => r.customer_id === customerFilter)),
    [rows, customerFilter]
  );

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => ({
        call: acc.call + Number(r.call_base_charge || 0) + Number(r.call_overage_charge || 0),
        va:
          acc.va +
          Number(r.va_base_charge || 0) +
          Number(r.va_overage_charge || 0) +
          Number(r.va_task_charge || 0),
        vat: acc.vat + Number(r.vat_amount || 0),
        total: acc.total + Number(r.total || 0),
      }),
      { call: 0, va: 0, vat: 0, total: 0 }
    );
  }, [filteredRows]);

  const handleGenerateAll = async () => {
    setBulkBusy(true);
    try {
      const { error } = await supabase.rpc("generate_internal_invoices_for_period" as any, {
        p_period_label: periodLabel,
      });
      if (error) throw error;
      toast({ title: "Generated", description: `Billing generated for ${periodLabel}` });
      await fetchData();
    } catch (e: any) {
      console.error(e);
      toast({ title: "Error", description: e.message || "Generation failed", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleGenerateOne = async (customerId: string) => {
    setBusyId(customerId);
    try {
      const { error } = await supabase.rpc("generate_internal_invoice_for_period" as any, {
        p_customer_id: customerId,
        p_period_label: periodLabel,
      });
      if (error) throw error;
      toast({ title: "Regenerated", description: "Period recalculated." });
      await fetchData();
    } catch (e: any) {
      console.error(e);
      toast({ title: "Error", description: e.message || "Generation failed", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdateStatus = async (invoiceId: string, status: "approved" | "sent_to_xero") => {
    setBusyId(invoiceId);
    try {
      const patch: any = { status };
      if (status === "approved") {
        patch.approved_at = new Date().toISOString();
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) patch.approved_by = userData.user.id;
      }
      const { error } = await supabase.from("internal_invoices").update(patch).eq("id", invoiceId);
      if (error) throw error;
      toast({ title: "Updated", description: `Invoice marked ${status.replace("_", " ")}.` });
      await fetchData();
    } catch (e: any) {
      console.error(e);
      toast({ title: "Error", description: e.message || "Status update failed", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Unified Billing Periods
          </CardTitle>
          <CardDescription>
            Generate and review combined Call Answering + Virtual Assistant billing per customer per month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-end gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Period (YYYY-MM)</label>
              <Input
                type="month"
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                className="w-[180px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Customer</label>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 md:ml-auto">
              <Button variant="outline" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <Button onClick={handleGenerateAll} disabled={bulkBusy}>
                {bulkBusy ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Generate / Regenerate All
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SummaryStat label="Call Revenue" value={fmtGBP(totals.call)} />
            <SummaryStat label="VA Revenue" value={fmtGBP(totals.va)} />
            <SummaryStat label="VAT" value={fmtGBP(totals.vat)} />
            <SummaryStat label="Total (inc. VAT)" value={fmtGBP(totals.total)} highlight />
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Call £</TableHead>
                  <TableHead className="text-right">VA Hrs</TableHead>
                  <TableHead className="text-right">VA £</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading…" : `No periods generated for ${periodLabel}. Click "Generate / Regenerate All".`}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((r) => {
                    const callTotal = Number(r.call_base_charge || 0) + Number(r.call_overage_charge || 0);
                    const vaTotal =
                      Number(r.va_base_charge || 0) +
                      Number(r.va_overage_charge || 0) +
                      Number(r.va_task_charge || 0);
                    const vaHrs = (Number(r.total_va_seconds || 0) / 3600).toFixed(2);
                    const status = r.invoice_status || r.status || "draft";
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.customer_name}</TableCell>
                        <TableCell className="text-right">
                          {r.total_calls}
                          {r.overage_calls > 0 && (
                            <span className="text-xs text-muted-foreground"> (+{r.overage_calls})</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{fmtGBP(callTotal)}</TableCell>
                        <TableCell className="text-right">{vaHrs}</TableCell>
                        <TableCell className="text-right">{fmtGBP(vaTotal)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtGBP(r.total)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[status] || "secondary"}>
                            {status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === r.customer_id}
                              onClick={() => handleGenerateOne(r.customer_id)}
                              title="Regenerate"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                            {r.invoice_id && status === "draft" && (
                              <Button
                                size="sm"
                                variant="default"
                                disabled={busyId === r.invoice_id}
                                onClick={() => handleUpdateStatus(r.invoice_id!, "approved")}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                              </Button>
                            )}
                            {r.invoice_id && status === "approved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId === r.invoice_id}
                                onClick={() => handleUpdateStatus(r.invoice_id!, "sent_to_xero")}
                              >
                                <Send className="h-3.5 w-3.5 mr-1" /> Mark Sent
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${highlight ? "bg-primary/5 border-primary/30" : "bg-card"}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
