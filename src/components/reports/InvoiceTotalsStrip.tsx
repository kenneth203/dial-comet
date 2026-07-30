import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatGBP } from "@/lib/currency";
import { useInvoiceReport, type InvoiceReportTotals } from "@/hooks/useInvoiceReport";
import { PoundSterling, Receipt, Clock, AlertTriangle } from "lucide-react";

interface Props {
  /** ISO date (YYYY-MM-DD). Omit for all time. */
  from?: string | null;
  to?: string | null;
  /** Description of the period, e.g. "This month". */
  periodLabel?: string;
  title?: string;
}

function Metric({
  title, value, split, icon: Icon,
}: {
  title: string;
  value: string;
  split?: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {split && <p className="text-xs text-muted-foreground mt-1">{split}</p>}
      </CardContent>
    </Card>
  );
}

function splitLine(t: InvoiceReportTotals, key: "invoiced" | "paid" | "outstanding" | "vat") {
  return `CRM ${formatGBP(t.crm[key])} · Billing ${formatGBP(t.billing[key])}`;
}

/**
 * Combined CRM + Billing invoice totals.
 * Rendered on both the CRM dashboard and the Billing dashboard so the
 * two areas can never report different numbers.
 */
export function InvoiceTotalsStrip({ from, to, periodLabel, title = "Invoiced Revenue (CRM + Billing)" }: Props) {
  const { totals, loading, error } = useInvoiceReport(from, to);

  if (error) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <PoundSterling className="h-5 w-5 text-primary" /> {title}
        {periodLabel && <span className="text-sm font-normal text-muted-foreground">· {periodLabel}</span>}
      </h2>
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Metric title="Total Invoiced" value={formatGBP(totals.all.invoiced)}
            split={splitLine(totals, "invoiced")} icon={Receipt} />
          <Metric title="Paid" value={formatGBP(totals.all.paid)}
            split={splitLine(totals, "paid")} icon={PoundSterling} />
          <Metric title="Outstanding" value={formatGBP(totals.all.outstanding)}
            split={splitLine(totals, "outstanding")} icon={Clock} />
          <Metric title="Overdue" value={formatGBP(totals.all.overdue)}
            split={`${totals.all.count} invoice${totals.all.count === 1 ? "" : "s"} in period`} icon={AlertTriangle} />
        </div>
      )}
    </div>
  );
}
