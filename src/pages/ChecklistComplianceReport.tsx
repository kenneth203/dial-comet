import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, MinusCircle, Loader2, Download, ChevronRight, User, Calendar } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { formatDisplayName } from "@/lib/nameUtils";
import { toast } from "@/hooks/use-toast";

const BERKSHIRE_ID = "282d1f63-ac46-4330-a5fb-51e43e9524f5";

type ReportMode = "daily" | "weekly";

interface InstanceRow {
  id: string;
  task_date: string;
  due_time: string | null;
  occurrence_label: string | null;
  title: string;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  contact_names: string[];
  user_id: string;
  template_id: string;
  min_contact_names: number;
  require_contact_names: boolean;
  user_name: string;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // Monday as start
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function formatUKDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface Compliance {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: React.ReactNode;
  tone: "met" | "incomplete" | "shortfall" | "skipped";
}

function classify(row: InstanceRow): Compliance {
  const count = row.contact_names.length;
  const min = Math.max(1, row.min_contact_names || 3);
  if (row.status === "skipped" || row.status === "not_applicable") {
    return { label: "Skipped", variant: "secondary", icon: <MinusCircle className="h-3 w-3" />, tone: "skipped" };
  }
  if (row.status === "completed") {
    if (count >= min) {
      return { label: "Met", variant: "default", icon: <CheckCircle2 className="h-3 w-3" />, tone: "met" };
    }
    return { label: `Completed – short (${count}/${min})`, variant: "destructive", icon: <AlertTriangle className="h-3 w-3" />, tone: "shortfall" };
  }
  // not_started / overdue
  return { label: `Incomplete (${count}/${min})`, variant: "destructive", icon: <AlertTriangle className="h-3 w-3" />, tone: "incomplete" };
}

export default function ChecklistComplianceReport() {
  const today = toISODate(new Date());
  const [mode, setMode] = useState<ReportMode>("daily");
  const [anchorDate, setAnchorDate] = useState<string>(today);
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<InstanceRow | null>(null);

  const { startDate, endDate } = useMemo(() => {
    if (mode === "daily") return { startDate: anchorDate, endDate: anchorDate };
    const s = startOfWeek(anchorDate);
    return { startDate: s, endDate: addDays(s, 6) };
  }, [mode, anchorDate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: templates, error: tErr } = await (supabase as any)
        .from("checklist_templates")
        .select("id, require_contact_names, min_contact_names")
        .eq("customer_id", BERKSHIRE_ID)
        .eq("require_contact_names", true);
      if (tErr) throw tErr;
      const tmplMap = new Map<string, { min: number; require: boolean }>();
      (templates || []).forEach((t: any) => {
        tmplMap.set(t.id, { min: Number(t.min_contact_names ?? 3), require: Boolean(t.require_contact_names) });
      });

      if (tmplMap.size === 0) {
        setRows([]);
        return;
      }

      const { data: inst, error: iErr } = await (supabase as any)
        .from("checklist_instances")
        .select("id, task_date, due_time, occurrence_label, title, status, completed_at, completed_by, contact_names, user_id, template_id")
        .in("template_id", Array.from(tmplMap.keys()))
        .gte("task_date", startDate)
        .lte("task_date", endDate)
        .order("task_date", { ascending: true })
        .order("due_time", { ascending: true, nullsFirst: false });
      if (iErr) throw iErr;

      // Dedupe fan-out rows: group by (task_date, template_id, occurrence_label/due_time)
      // Prefer the row whose user_id matches completed_by (the actual closer);
      // fall back to any completed row, else the first row.
      const groups = new Map<string, any[]>();
      (inst || []).forEach((r: any) => {
        const key = `${r.task_date}|${r.template_id}|${r.occurrence_label ?? r.due_time ?? ""}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      });
      const deduped: any[] = [];
      groups.forEach((grp) => {
        const closer = grp.find((r) => r.completed_by && r.user_id === r.completed_by);
        if (closer) { deduped.push(closer); return; }
        const anyCompleted = grp.find((r) => r.status === "completed" && r.completed_by);
        if (anyCompleted) {
          // Surface the actual closer's user_id for name lookup
          deduped.push({ ...anyCompleted, user_id: anyCompleted.completed_by });
          return;
        }
        deduped.push(grp[0]);
      });

      const userIds = Array.from(new Set(deduped.map((r: any) => r.user_id))) as string[];
      const nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", userIds);
        (profs || []).forEach((p: any) => nameMap.set(p.user_id, formatDisplayName(p.name || "")));
      }

      const out: InstanceRow[] = deduped.map((r: any) => {
        const t = tmplMap.get(r.template_id);
        return {
          id: r.id,
          task_date: r.task_date,
          due_time: r.due_time,
          occurrence_label: r.occurrence_label,
          title: r.title,
          status: r.status,
          completed_at: r.completed_at,
          completed_by: r.completed_by,
          contact_names: Array.isArray(r.contact_names) ? r.contact_names : [],
          user_id: r.user_id,
          template_id: r.template_id,
          min_contact_names: t?.min ?? 3,
          require_contact_names: t?.require ?? true,
          user_name: nameMap.get(r.user_id) || "Unknown user",
        };
      });
      setRows(out);
    } catch (e: any) {
      toast({ title: "Could not load report", description: e?.message || "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    let met = 0, incomplete = 0, shortfall = 0, skipped = 0;
    rows.forEach((r) => {
      const t = classify(r).tone;
      if (t === "met") met++;
      else if (t === "incomplete") incomplete++;
      else if (t === "shortfall") shortfall++;
      else if (t === "skipped") skipped++;
    });
    return { total: rows.length, met, incomplete, shortfall, skipped };
  }, [rows]);

  const exportCsv = () => {
    if (rows.length === 0) return;
    const header = ["Date", "Operator", "Occurrence", "Task", "Status", "Names entered", "Minimum required", "Contact names"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      const c = classify(r);
      const cells = [
        formatUKDate(r.task_date),
        r.user_name,
        r.occurrence_label || (r.due_time ? r.due_time.slice(0, 5) : ""),
        r.title,
        c.label,
        String(r.contact_names.length),
        String(r.min_contact_names),
        r.contact_names.join("; "),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `berkshire-checklist-compliance-${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Helmet>
        <title>Berkshire Checklist Compliance | Reports</title>
        <meta name="description" content="Admin report showing Berkshire Heating Solutions shift contact-name compliance." />
      </Helmet>

      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Berkshire Checklist Compliance</h1>
          <p className="text-sm text-muted-foreground">
            Which Berkshire Heating Solutions shifts met the minimum contact-name requirement and which were left incomplete.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Choose a day or a week (Mon–Sun) to review.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <Label>Report type</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as ReportMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{mode === "daily" ? "Date" : "Any day in target week"}</Label>
                <Input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
              </div>
              <div className="text-sm text-muted-foreground">
                Range: <span className="font-medium">{formatUKDate(startDate)}</span>
                {startDate !== endDate && <> – <span className="font-medium">{formatUKDate(endDate)}</span></>}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => void load()} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                </Button>
                <Button onClick={exportCsv} disabled={rows.length === 0}>
                  <Download className="h-4 w-4 mr-2" /> CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryStat label="Shifts" value={summary.total} />
          <SummaryStat label="Met minimum" value={summary.met} tone="met" />
          <SummaryStat label="Incomplete" value={summary.incomplete} tone="bad" />
          <SummaryStat label="Completed short" value={summary.shortfall} tone="bad" />
          <SummaryStat label="Skipped / N/A" value={summary.skipped} tone="muted" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Shift-by-shift breakdown</CardTitle>
            <CardDescription>
              A row per Berkshire task instance. "Met" means the operator entered at least the required number of contact names.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No Berkshire checklist tasks with contact-name requirements found in this range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Occurrence</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead className="text-center">Names</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Contacts</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const c = classify(r);
                      return (
                        <TableRow
                          key={r.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelected(r)}
                        >
                          <TableCell className="whitespace-nowrap">{formatUKDate(r.task_date)}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.user_name}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {r.occurrence_label || (r.due_time ? r.due_time.slice(0, 5) : "—")}
                          </TableCell>
                          <TableCell>{r.title}</TableCell>
                          <TableCell className="text-center font-medium">
                            {r.contact_names.length}/{r.min_contact_names}
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.variant} className="gap-1">
                              {c.icon}{c.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[280px]">
                            {r.contact_names.length > 0 ? r.contact_names.join(", ") : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <ChevronRight className="h-4 w-4" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (() => {
            const c = classify(selected);
            const shiftItems = rows.filter(
              (r) => r.user_id === selected.user_id && r.task_date === selected.task_date
            );
            return (
              <>
                <SheetHeader>
                  <SheetTitle>Shift details</SheetTitle>
                  <SheetDescription>
                    Checklist items and entered contact names for this shift.
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-4">
                  <div className="rounded-md border p-3 space-y-1 bg-muted/30">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{selected.user_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{formatUKDate(selected.task_date)}</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                      Focused task
                    </div>
                    <div className="rounded-md border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium">{selected.title}</div>
                        <Badge variant={c.variant} className="gap-1 shrink-0">
                          {c.icon}{c.label}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Occurrence: {selected.occurrence_label || (selected.due_time ? selected.due_time.slice(0, 5) : "—")}
                        {selected.completed_at && (
                          <> · Completed {new Date(selected.completed_at).toLocaleString("en-GB")}</>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">
                          Contact names ({selected.contact_names.length}/{selected.min_contact_names})
                        </div>
                        {selected.contact_names.length === 0 ? (
                          <div className="text-sm text-muted-foreground italic">No names entered</div>
                        ) : (
                          <ol className="list-decimal pl-5 space-y-0.5 text-sm">
                            {selected.contact_names.map((n, i) => (
                              <li key={i}>{n}</li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  </div>

                  {shiftItems.length > 1 && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                        Other tasks on this shift ({shiftItems.length - 1})
                      </div>
                      <div className="space-y-2">
                        {shiftItems.filter((s) => s.id !== selected.id).map((s) => {
                          const sc = classify(s);
                          return (
                            <div
                              key={s.id}
                              className="rounded-md border p-3 space-y-1 cursor-pointer hover:bg-muted/40"
                              onClick={() => setSelected(s)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-medium">{s.title}</div>
                                <Badge variant={sc.variant} className="gap-1 shrink-0">
                                  {sc.icon}{sc.label}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {s.occurrence_label || (s.due_time ? s.due_time.slice(0, 5) : "—")}
                                {" · "}Names: {s.contact_names.length}/{s.min_contact_names}
                              </div>
                              {s.contact_names.length > 0 && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {s.contact_names.join(", ")}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone?: "met" | "bad" | "muted" }) {
  const cls =
    tone === "met" ? "text-green-600 dark:text-green-400"
    : tone === "bad" ? "text-destructive"
    : tone === "muted" ? "text-muted-foreground"
    : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
