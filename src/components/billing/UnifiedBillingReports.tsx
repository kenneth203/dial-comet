import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Users, PoundSterling } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatGBP } from "@/lib/currency";

type PeriodRow = {
  id: string;
  customer_id: string;
  period_label: string;
  call_base_charge: number;
  call_overage_charge: number;
  va_base_charge: number;
  va_overage_charge: number;
  va_task_charge: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  total_calls: number;
  overage_calls: number;
  total_va_seconds: number;
  overage_va_seconds: number;
  status: string;
};

type CustomerLite = { id: string; name: string };

const GBP = formatGBP;

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--secondary))", "hsl(var(--muted-foreground))"];

function monthLabel(label: string) {
  // label format YYYY-MM
  const [y, m] = label.split("-").map(Number);
  if (!y || !m) return label;
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function defaultRange() {
  const now = new Date();
  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const startLabel = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  return { startLabel, endLabel: end };
}

export function UnifiedBillingReports() {
  const { startLabel, endLabel } = defaultRange();
  const [from, setFrom] = useState(startLabel);
  const [to, setTo] = useState(endLabel);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const { data: periods, error } = await supabase
        .from("internal_billing_periods")
        .select(
          "id, customer_id, period_label, call_base_charge, call_overage_charge, va_base_charge, va_overage_charge, va_task_charge, subtotal, vat_amount, total, total_calls, overage_calls, total_va_seconds, overage_va_seconds, status"
        )
        .gte("period_label", from)
        .lte("period_label", to)
        .order("period_label", { ascending: true });
      if (error) throw error;

      const list = (periods || []) as PeriodRow[];
      setRows(list);

      const ids = Array.from(new Set(list.map((r) => r.customer_id)));
      if (ids.length) {
        const { data: custs } = await supabase
          .from("customers")
          .select("id, name")
          .in("id", ids);
        const map: Record<string, string> = {};
        (custs as CustomerLite[] | null)?.forEach((c) => (map[c.id] = c.name));
        setCustomers(map);
      } else {
        setCustomers({});
      }
    } catch (e: any) {
      toast({ title: "Failed to load reports", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // Aggregations
  const totals = useMemo(() => {
    const callRev = rows.reduce((s, r) => s + Number(r.call_base_charge) + Number(r.call_overage_charge), 0);
    const vaRev = rows.reduce(
      (s, r) => s + Number(r.va_base_charge) + Number(r.va_overage_charge) + Number(r.va_task_charge),
      0,
    );
    const overage = rows.reduce(
      (s, r) => s + Number(r.call_overage_charge) + Number(r.va_overage_charge),
      0,
    );
    const subtotal = rows.reduce((s, r) => s + Number(r.subtotal), 0);
    const grand = rows.reduce((s, r) => s + Number(r.total), 0);
    const uniqueCustomers = new Set(rows.map((r) => r.customer_id)).size;
    const uniqueMonths = new Set(rows.map((r) => r.period_label)).size || 1;
    const arpc = uniqueCustomers ? grand / uniqueCustomers / uniqueMonths : 0;
    return { callRev, vaRev, overage, subtotal, grand, uniqueCustomers, arpc };
  }, [rows]);

  // By month
  const byMonth = useMemo(() => {
    const m = new Map<string, { label: string; call: number; va: number; total: number }>();
    for (const r of rows) {
      const cur = m.get(r.period_label) ?? { label: r.period_label, call: 0, va: 0, total: 0 };
      cur.call += Number(r.call_base_charge) + Number(r.call_overage_charge);
      cur.va += Number(r.va_base_charge) + Number(r.va_overage_charge) + Number(r.va_task_charge);
      cur.total += Number(r.total);
      m.set(r.period_label, cur);
    }
    return Array.from(m.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((x) => ({ ...x, label: monthLabel(x.label) }));
  }, [rows]);

  // By customer
  const byCustomer = useMemo(() => {
    const m = new Map<
      string,
      { id: string; name: string; call: number; va: number; total: number; months: Set<string>; usesBoth: boolean }
    >();
    for (const r of rows) {
      const cur =
        m.get(r.customer_id) ??
        {
          id: r.customer_id,
          name: customers[r.customer_id] || "—",
          call: 0,
          va: 0,
          total: 0,
          months: new Set<string>(),
          usesBoth: false,
        };
      cur.call += Number(r.call_base_charge) + Number(r.call_overage_charge);
      cur.va += Number(r.va_base_charge) + Number(r.va_overage_charge) + Number(r.va_task_charge);
      cur.total += Number(r.total);
      cur.months.add(r.period_label);
      m.set(r.customer_id, cur);
    }
    const arr = Array.from(m.values()).map((c) => ({ ...c, usesBoth: c.call > 0 && c.va > 0 }));
    return arr.sort((a, b) => b.total - a.total);
  }, [rows, customers]);

  const splitPie = useMemo(
    () => [
      { name: "Call Answering", value: Math.round(totals.callRev * 100) / 100 },
      { name: "Virtual Assistant", value: Math.round(totals.vaRev * 100) / 100 },
    ],
    [totals],
  );

  // Trend vs prior month for top customers
  const trend = useMemo(() => {
    // For each customer, compare last month in range vs the one before
    const months = Array.from(new Set(rows.map((r) => r.period_label))).sort();
    if (months.length < 2) return [] as { id: string; name: string; current: number; previous: number; change: number }[];
    const cur = months[months.length - 1];
    const prev = months[months.length - 2];
    const sumFor = (label: string, cid: string) =>
      rows
        .filter((r) => r.period_label === label && r.customer_id === cid)
        .reduce((s, r) => s + Number(r.total), 0);
    const ids = Array.from(new Set(rows.map((r) => r.customer_id)));
    return ids
      .map((id) => {
        const current = sumFor(cur, id);
        const previous = sumFor(prev, id);
        const change = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
        return { id, name: customers[id] || "—", current, previous, change };
      })
      .filter((x) => x.current > 0 || x.previous > 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 8);
  }, [rows, customers]);

  const exportCsv = () => {
    const headers = [
      "Customer",
      "Period",
      "Call Base",
      "Call Overage",
      "VA Base",
      "VA Overage",
      "VA Tasks",
      "Subtotal",
      "VAT",
      "Total",
      "Status",
    ];
    const lines = rows.map((r) =>
      [
        `"${(customers[r.customer_id] || "").replace(/"/g, '""')}"`,
        r.period_label,
        r.call_base_charge,
        r.call_overage_charge,
        r.va_base_charge,
        r.va_overage_charge,
        r.va_task_charge,
        r.subtotal,
        r.vat_amount,
        r.total,
        r.status,
      ].join(","),
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-report_${from}_to_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <CardTitle>Revenue Reports</CardTitle>
            <CardDescription>
              Unified call answering + virtual assistant revenue, sourced from generated billing periods.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="from" className="text-xs">From</Label>
              <Input id="from" type="month" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to" className="text-xs">To</Label>
              <Input id="to" type="month" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard label="Total Revenue" value={GBP(totals.grand)} icon={<PoundSterling className="h-4 w-4" />} loading={loading} />
        <KpiCard label="Call Answering" value={GBP(totals.callRev)} loading={loading} />
        <KpiCard label="Virtual Assistant" value={GBP(totals.vaRev)} loading={loading} />
        <KpiCard label="Overage Charges" value={GBP(totals.overage)} loading={loading} />
        <KpiCard
          label="Avg Revenue / Customer / Month"
          value={GBP(totals.arpc)}
          icon={<Users className="h-4 w-4" />}
          loading={loading}
        />
      </div>

      {/* Trend + Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Revenue Trend</CardTitle>
            <CardDescription>Call vs VA revenue per month</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : byMonth.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `£${v}`} />
                  <Tooltip formatter={(v: number) => GBP(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  <Line type="monotone" dataKey="call" name="Call" stroke={CHART_COLORS[0]} strokeWidth={2} />
                  <Line type="monotone" dataKey="va" name="VA" stroke={CHART_COLORS[1]} strokeWidth={2} />
                  <Line type="monotone" dataKey="total" name="Total" stroke={CHART_COLORS[2]} strokeWidth={2} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Split</CardTitle>
            <CardDescription>Call vs VA contribution</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : totals.grand === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={splitPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {splitPie.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => GBP(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top customers */}
      <Card>
        <CardHeader>
          <CardTitle>Top Customers by Revenue</CardTitle>
          <CardDescription>Across the selected range</CardDescription>
        </CardHeader>
        <CardContent className="h-[320px]">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : byCustomer.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCustomer.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `£${v}`} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={140} />
                <Tooltip formatter={(v: number) => GBP(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Bar dataKey="call" name="Call" stackId="a" fill={CHART_COLORS[0]} />
                <Bar dataKey="va" name="VA" stackId="a" fill={CHART_COLORS[1]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Customer detail table */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Revenue Breakdown</CardTitle>
          <CardDescription>
            {totals.uniqueCustomers} customer{totals.uniqueCustomers === 1 ? "" : "s"} billed in this range
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Call</TableHead>
                  <TableHead className="text-right">VA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Services</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCustomer.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">{GBP(c.call)}</TableCell>
                    <TableCell className="text-right">{GBP(c.va)}</TableCell>
                    <TableCell className="text-right font-semibold">{GBP(c.total)}</TableCell>
                    <TableCell className="text-center">
                      {c.usesBoth ? (
                        <Badge variant="secondary">Call + VA</Badge>
                      ) : c.call > 0 ? (
                        <Badge variant="outline">Call</Badge>
                      ) : (
                        <Badge variant="outline">VA</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {byCustomer.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No billing periods in range
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Month-over-month movers */}
      {trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Month-over-Month Movers</CardTitle>
            <CardDescription>Latest month vs previous month in range</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Previous</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trend.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-right">{GBP(t.previous)}</TableCell>
                    <TableCell className="text-right">{GBP(t.current)}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          t.change > 0 ? "text-green-600" : t.change < 0 ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {t.change > 0 ? <TrendingUp className="h-3 w-3" /> : t.change < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                        {t.change.toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <div className="mt-2 text-2xl font-semibold">
          {loading ? <Skeleton className="h-7 w-24" /> : value}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      No data for the selected period
    </div>
  );
}

export default UnifiedBillingReports;
