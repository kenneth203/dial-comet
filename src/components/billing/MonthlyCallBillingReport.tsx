import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Printer, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { formatGBP, formatNumber2dp } from "@/lib/currency";

interface Row {
  customer_id: string;
  customer_name: string;
  package_name: string;
  base_allowance: number;
  monthly_charge: number;
  rate_per_call: number;
  rate_per_minute: number;
  rate_txfer_landline: number;
  rate_txfer_mobile: number;
  vat_rate: number;
  billing_unit: string;
  // aggregates
  total_calls: number;
  total_seconds: number;
  txfer_landline_count: number;
  txfer_mobile_count: number;
  // computed
  base_calls_charge: number;
  additional_minutes: number;
  per_call_charge: number;
  per_minute_charge: number;
  txfer_landline_charge: number;
  txfer_mobile_charge: number;
  additional_charges: number;
  monthly_invoice: number;
  incl_vat: number;
  over_under: number;
}

function defaultMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

export function MonthlyCallBillingReport() {
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth());
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const fetchData = async () => {
    if (!selectedMonth) return;
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);
      const startStr = format(periodStart, "yyyy-MM-dd");
      const endStr = format(periodEnd, "yyyy-MM-dd");

      const [billingCustomersResult, customerProfilesResult] = await Promise.all([
        supabase
          .from("billing_customers")
          .select("*")
          .eq("active", true),
        supabase
          .from("customers")
          .select("*")
          .eq("status", "Active"),
      ]);

      if (billingCustomersResult.error) throw billingCustomersResult.error;
      if (customerProfilesResult.error) throw customerProfilesResult.error;

      const billingCustomers = billingCustomersResult.data || [];
      const customerProfiles = customerProfilesResult.data || [];
      const normaliseName = (value?: string | null) => (value || "").trim().toLowerCase();
      const profileByName = new Map(
        customerProfiles.map((profile: any) => [normaliseName(profile.name), profile]),
      );

      // Paginate call_logs (Supabase default cap is 1000 rows per query)
      const pageSize = 1000;
      let callLogs: any[] = [];
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("call_logs")
          .select("customer_id,duration_seconds,channel_type,result,notes,date")
          .gte("date", startStr)
          .lte("date", endStr)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        callLogs = callLogs.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const byCustomer = new Map<string, Row>();
      billingCustomers.forEach((billingCustomer: any) => {
        const profile = profileByName.get(normaliseName(billingCustomer.name));
        const profileMonthlyCharge = Number(
          profile?.call_monthly_charge || profile?.cl_price || profile?.vr_price || 0,
        );
        const profileBaseAllowance = Number(
          profile?.call_base_allowance || profile?.cl_included_minutes || profile?.vr_included_minutes || 0,
        );
        const profileRatePerMinute = Number(
          profile?.call_rate_per_minute || profile?.cl_overage_rate || profile?.vr_overage_rate || 0,
        );

        byCustomer.set(billingCustomer.customer_id, {
          customer_id: billingCustomer.customer_id,
          customer_name: billingCustomer.name,
          package_name: profile?.call_package_name || profile?.cl_package || profile?.vr_package || billingCustomer.package_name || "",
          base_allowance: Number(billingCustomer.base_call_allowance || profileBaseAllowance || 0),
          monthly_charge: Number(billingCustomer.monthly_charge || profileMonthlyCharge || 0),
          rate_per_call: Number(billingCustomer.rate_per_call || profile?.call_rate_per_call || 0),
          rate_per_minute: Number(billingCustomer.rate_per_minute || profileRatePerMinute || 0),
          rate_txfer_landline: Number(
            billingCustomer.rate_transfer_landline || profile?.call_rate_transfer_landline || 0,
          ),
          rate_txfer_mobile: Number(
            billingCustomer.rate_transfer_mobile || profile?.call_rate_transfer_mobile || 0,
          ),
          vat_rate: Number(profile?.vat_rate ?? 0.2),
          billing_unit: profile?.call_billing_unit || "per_call",
          total_calls: 0,
          total_seconds: 0,
          txfer_landline_count: 0,
          txfer_mobile_count: 0,
          base_calls_charge: 0,
          additional_minutes: 0,
          per_call_charge: 0,
          per_minute_charge: 0,
          txfer_landline_charge: 0,
          txfer_mobile_charge: 0,
          additional_charges: 0,
          monthly_invoice: 0,
          incl_vat: 0,
          over_under: 0,
        });
      });

      (callLogs || []).forEach((call: any) => {
        if (!call.customer_id) return;
        const row = byCustomer.get(call.customer_id);
        if (!row) return;
        row.total_calls += 1;
        row.total_seconds += Number(call.duration_seconds || 0);
        const blob = `${call.channel_type || ""} ${call.result || ""} ${call.notes || ""}`.toLowerCase();
        if (blob.includes("transfer") || blob.includes("txfer")) {
          if (blob.includes("mobile")) row.txfer_mobile_count += 1;
          else row.txfer_landline_count += 1;
        }
      });

      const finalRows: Row[] = [];
      byCustomer.forEach((r) => {
        if (r.total_calls === 0 && r.monthly_charge === 0) return;

        if (r.billing_unit === "per_minute") {
          const includedSeconds = r.base_allowance * 60; // base_allowance treated as included minutes
          const overSeconds = Math.max(0, r.total_seconds - includedSeconds);
          r.additional_minutes = overSeconds / 60;
          r.per_minute_charge = r.additional_minutes * r.rate_per_minute;
        } else {
          const billableCalls = Math.max(0, r.total_calls - r.base_allowance);
          r.per_call_charge = billableCalls * r.rate_per_call;
          r.base_calls_charge = r.per_call_charge;
        }

        r.txfer_landline_charge = r.txfer_landline_count * r.rate_txfer_landline;
        r.txfer_mobile_charge = r.txfer_mobile_count * r.rate_txfer_mobile;
        r.additional_charges =
          r.per_minute_charge + r.txfer_landline_charge + r.txfer_mobile_charge;
        r.monthly_invoice = r.monthly_charge + r.base_calls_charge + r.additional_charges;
        r.incl_vat = r.monthly_invoice * (1 + r.vat_rate);
        r.over_under = r.total_calls - r.base_allowance;
        finalRows.push(r);
      });

      finalRows.sort((a, b) => a.customer_name.localeCompare(b.customer_name));
      setRows(finalRows);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message || "Failed to load report", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const totals = useMemo(() => {
    const t = {
      monthly_charge: 0,
      base_calls_charge: 0,
      additional_minutes: 0,
      additional_charges: 0,
      total_calls: 0,
      monthly_invoice: 0,
      incl_vat: 0,
      per_call_charge: 0,
      per_minute_charge: 0,
      txfer_landline_charge: 0,
      txfer_mobile_charge: 0,
      base_allowance: 0,
      over_under: 0,
    };
    rows.forEach((r) => {
      t.monthly_charge += r.monthly_charge;
      t.base_calls_charge += r.base_calls_charge;
      t.additional_minutes += r.additional_minutes;
      t.additional_charges += r.additional_charges;
      t.total_calls += r.total_calls;
      t.monthly_invoice += r.monthly_invoice;
      t.incl_vat += r.incl_vat;
      t.per_call_charge += r.per_call_charge;
      t.per_minute_charge += r.per_minute_charge;
      t.txfer_landline_charge += r.txfer_landline_charge;
      t.txfer_mobile_charge += r.txfer_mobile_charge;
      t.base_allowance += r.base_allowance;
      t.over_under += r.over_under;
    });
    return t;
  }, [rows]);

  const exportCsv = (view: "summary" | "breakdown") => {
    if (rows.length === 0) return;
    let csv = "";
    if (view === "summary") {
      csv =
        ["Customer", "Monthly Charge", "Base Calls", "Additional Mins", "Additional Charges", "Calls Total", "Monthly Invoice", "VAT", "Incl VAT"].join(",") +
        "\n" +
        rows
          .map((r) =>
            [
              `"${r.customer_name}"`,
              r.monthly_charge.toFixed(2),
              r.base_calls_charge.toFixed(2),
              r.additional_minutes.toFixed(2),
              r.additional_charges.toFixed(2),
              r.total_calls,
              r.monthly_invoice.toFixed(2),
              `${Math.round(r.vat_rate * 100)}%`,
              r.incl_vat.toFixed(2),
            ].join(","),
          )
          .join("\n");
    } else {
      csv =
        ["Customer", "per Call", "per Minute", "Txfer Landline", "Txfer Mobile", "Total Calls", "Package", "Over/Under"].join(",") +
        "\n" +
        rows
          .map((r) =>
            [
              `"${r.customer_name}"`,
              r.per_call_charge.toFixed(2),
              r.per_minute_charge.toFixed(2),
              r.txfer_landline_charge.toFixed(2),
              r.txfer_mobile_charge.toFixed(2),
              r.total_calls,
              r.base_allowance,
              r.over_under,
            ].join(","),
          )
          .join("\n");
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `call-billing-${view}-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle>Monthly Call Billing Report</CardTitle>
          <div className="flex flex-wrap items-center gap-2 no-print">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="report-month">Month:</Label>
              <Input
                id="report-month"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-40"
              />
            </div>
            <Button onClick={fetchData} disabled={loading} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => window.print()} variant="outline" disabled={rows.length === 0}>
              <Printer className="h-4 w-4 mr-2" />
              Print / PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">No data for {selectedMonth}.</div>
        ) : (
          <Tabs defaultValue="summary" className="space-y-4 print-area">
            <div className="flex justify-between items-center no-print">
              <TabsList>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="breakdown">Per-Customer Breakdown</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="summary">
              <div className="flex justify-end mb-2 no-print">
                <Button variant="outline" size="sm" onClick={() => exportCsv("summary")}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Monthly Charge</TableHead>
                      <TableHead className="text-right">Base Calls</TableHead>
                      <TableHead className="text-right">Additional Mins</TableHead>
                      <TableHead className="text-right">Additional Charges</TableHead>
                      <TableHead className="text-right">Calls Total</TableHead>
                      <TableHead className="text-right">Monthly Invoice</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right">Incl VAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.customer_id}>
                        <TableCell className="font-medium">{r.customer_name}</TableCell>
                        <TableCell className="text-right">{formatGBP(r.monthly_charge)}</TableCell>
                        <TableCell className="text-right">{formatGBP(r.base_calls_charge)}</TableCell>
                        <TableCell className="text-right">{formatNumber2dp(r.additional_minutes)}</TableCell>
                        <TableCell className="text-right">{formatGBP(r.additional_charges)}</TableCell>
                        <TableCell className="text-right">{r.total_calls}</TableCell>
                        <TableCell className="text-right">{formatGBP(r.monthly_invoice)}</TableCell>
                        <TableCell className="text-right">{Math.round(r.vat_rate * 100)}%</TableCell>
                        <TableCell className="text-right font-medium">{formatGBP(r.incl_vat)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell>Grand Total</TableCell>
                      <TableCell className="text-right">{formatGBP(totals.monthly_charge)}</TableCell>
                      <TableCell className="text-right">{formatGBP(totals.base_calls_charge)}</TableCell>
                      <TableCell className="text-right">{formatNumber2dp(totals.additional_minutes)}</TableCell>
                      <TableCell className="text-right">{formatGBP(totals.additional_charges)}</TableCell>
                      <TableCell className="text-right">{totals.total_calls}</TableCell>
                      <TableCell className="text-right">{formatGBP(totals.monthly_invoice)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right">{formatGBP(totals.incl_vat)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="breakdown">
              <div className="flex justify-end mb-2 no-print">
                <Button variant="outline" size="sm" onClick={() => exportCsv("breakdown")}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">per Call</TableHead>
                      <TableHead className="text-right">per Minute</TableHead>
                      <TableHead className="text-right">Txfer Landline</TableHead>
                      <TableHead className="text-right">Txfer Mobile</TableHead>
                      <TableHead className="text-right">Total Calls</TableHead>
                      <TableHead className="text-right">Package</TableHead>
                      <TableHead className="text-right">Over/Under</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.customer_id}>
                        <TableCell className="font-medium">{r.customer_name}</TableCell>
                        <TableCell className="text-right">{formatGBP(r.per_call_charge)}</TableCell>
                        <TableCell className="text-right">{formatGBP(r.per_minute_charge)}</TableCell>
                        <TableCell className="text-right">{formatGBP(r.txfer_landline_charge)}</TableCell>
                        <TableCell className="text-right">{formatGBP(r.txfer_mobile_charge)}</TableCell>
                        <TableCell className="text-right">{r.total_calls}</TableCell>
                        <TableCell className="text-right">{r.base_allowance || ""}</TableCell>
                        <TableCell className={`text-right ${r.over_under > 0 ? "text-destructive font-medium" : ""}`}>
                          {r.over_under}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell>Grand Total</TableCell>
                      <TableCell className="text-right">{formatGBP(totals.per_call_charge)}</TableCell>
                      <TableCell className="text-right">{formatGBP(totals.per_minute_charge)}</TableCell>
                      <TableCell className="text-right">{formatGBP(totals.txfer_landline_charge)}</TableCell>
                      <TableCell className="text-right">{formatGBP(totals.txfer_mobile_charge)}</TableCell>
                      <TableCell className="text-right">{totals.total_calls}</TableCell>
                      <TableCell className="text-right">{totals.base_allowance}</TableCell>
                      <TableCell className="text-right">{totals.over_under}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

export default MonthlyCallBillingReport;
