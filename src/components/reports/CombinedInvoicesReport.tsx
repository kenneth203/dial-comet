import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, RefreshCw, PoundSterling, Receipt, Clock, AlertTriangle } from "lucide-react";
import { formatGBP } from "@/lib/currency";
import { useInvoiceReport, isCountable, type UnifiedInvoiceRow } from "@/hooks/useInvoiceReport";

const SOURCE_LABEL: Record<string, string> = {
  crm: "CRM",
  billing: "Billing",
  legacy_billing: "Billing (legacy)",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default",
  sent: "secondary",
  overdue: "destructive",
  draft: "outline",
  cancelled: "outline",
};

function isoMonthsAgo(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB");
}

/**
 * All Invoices — a single report covering CRM (proposal) invoices and
 * Billing (monthly/internal) invoices so the business can see combined
 * cash and invoicing figures in one place.
 */
export function CombinedInvoicesReport() {
  const [from, setFrom] = useState<string>(isoMonthsAgo(11));
  const [to, setTo] = useState<string>(todayIso());
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { rows, totals, loading, error, refresh } = useInvoiceReport(from || null, to || null);

  const filtered = useMemo(() => rows.filter((r) => {
    const sourceOk = sourceFilter === "all"
      || (sourceFilter === "crm" ? r.source === "crm" : r.source !== "crm");
    const statusOk = statusFilter === "all" || r.status_normalised === statusFilter;
    return sourceOk && statusOk;
  }), [rows, sourceFilter, statusFilter]);

  const filteredTotal = useMemo(
    () => filtered.filter(isCountable).reduce((s, r) => s + r.total, 0),
    [filtered],
  );

  const exportCsv = () => {
    const header = ["Source", "Invoice Number", "Customer", "Issued", "Due", "Period", "Subtotal", "VAT", "Total", "Status"];
    const lines = filtered.map((r: UnifiedInvoiceRow) => [
      SOURCE_LABEL[r.source] || r.source,
      r.invoice_number ?? "",
      r.customer_name,
      formatDate(r.issued_date),
      formatDate(r.due_date),
      r.period_label ?? "",
      r.subtotal.toFixed(2),
      r.vat_amount.toFixed(2),
      r.total.toFixed(2),
      r.status_normalised,
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `all-invoices-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = [
    { label: "Total Invoiced", value: totals.all.invoiced, icon: Receipt, key: "invoiced" as const },
    { label: "Total VAT", value: totals.all.vat, icon: PoundSterling, key: "vat" as const },
    { label: "Paid", value: totals.all.paid, icon: PoundSterling, key: "paid" as const },
    { label: "Outstanding", value: totals.all.outstanding, icon: Clock, key: "outstanding" as const },
    { label: "Overdue", value: totals.all.overdue, icon: AlertTriangle, key: "overdue" as const },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>All Invoices — CRM &amp; Billing</CardTitle>
          <CardDescription>
            Combined view of CRM (proposal) invoices and monthly billing invoices. Drafts and cancellations are listed but excluded from totals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="inv-from">From</Label>
              <Input id="inv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-to">To</Label>
              <Input id="inv-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label>Source</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="crm">CRM invoices</SelectItem>
                  <SelectItem value="billing">Billing invoices</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{error}</CardContent></Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {loading
          ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full" />)
          : summary.map(({ label, value, icon: Icon, key }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatGBP(value)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  CRM {formatGBP(totals.crm[key])} · Billing {formatGBP(totals.billing[key])}
                </p>
              </CardContent>
            </Card>
          ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>
            {filtered.length} invoice{filtered.length === 1 ? "" : "s"} · counted total {formatGBP(filteredTotal)}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No invoices for the selected filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={`${r.source}-${r.invoice_id}`}>
                    <TableCell><Badge variant="outline">{SOURCE_LABEL[r.source] || r.source}</Badge></TableCell>
                    <TableCell className="font-medium">{r.invoice_number || "—"}</TableCell>
                    <TableCell>{r.customer_name}</TableCell>
                    <TableCell>{formatDate(r.issued_date)}</TableCell>
                    <TableCell>{r.period_label || "—"}</TableCell>
                    <TableCell className="text-right">{formatGBP(r.subtotal)}</TableCell>
                    <TableCell className="text-right">{formatGBP(r.vat_amount)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatGBP(r.total)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status_normalised] || "outline"} className="capitalize">
                        {r.status_normalised}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
