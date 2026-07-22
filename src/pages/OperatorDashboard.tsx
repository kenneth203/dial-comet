import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PhoneCall, Clock, TrendingUp, Users, Radio, AlertTriangle, Settings } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

type CallRow = {
  call_id: string;
  customer_name: string | null;
  agent: string | null;
  duration_seconds: number | null;
  status: string | null;
  date: string | null;
  call_started_at: string | null;
};

const ALL = "__all__";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function formatDuration(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

const BAR_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--brand-navy, 214 63% 30%))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--accent))",
];

type Thresholds = {
  enabled: boolean;
  callsPerDay: number;
  ahtSeconds: number;
  perOpCalls: number;
  perOpAhtSeconds: number;
  outcomeAlerts: string[];
};

const DEFAULT_THRESHOLDS: Thresholds = {
  enabled: true,
  callsPerDay: 100,
  ahtSeconds: 300,
  perOpCalls: 40,
  perOpAhtSeconds: 360,
  outcomeAlerts: ["Missed"],
};

const THRESHOLDS_KEY = "operator-dashboard-thresholds";
const VIEWS_KEY = "operator-dashboard-saved-views";
const LAST_VIEW_KEY = "operator-dashboard-last-view";

type SavedView = {
  id: string;
  name: string;
  from: string;
  to: string;
  customer: string;
  operator: string;
  live: boolean;
  intervalSec: string;
};

function loadThresholds(): Thresholds {
  try {
    const raw = localStorage.getItem(THRESHOLDS_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


const FILTERS_KEY = "opdash:filters";
type PersistedFilters = { from: string; to: string; customer: string; operator: string };
function loadPersistedFilters(): Partial<PersistedFilters> {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export default function OperatorDashboard() {
  const persisted = loadPersistedFilters();
  const [from, setFrom] = useState<string>(persisted.from || daysAgoISO(29));
  const [to, setTo] = useState<string>(persisted.to || todayISO());
  const [customer, setCustomer] = useState<string>(persisted.customer || ALL);
  const [operator, setOperator] = useState<string>(persisted.operator || ALL);

  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<boolean>(true);
  const [intervalSec, setIntervalSec] = useState<string>("30");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const inFlightRef = useRef(false);
  const preserveScrollRef = useRef<number | null>(null);

  const [thresholds, setThresholds] = useState<Thresholds>(() => loadThresholds());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [outcomeFilter, setOutcomeFilter] = useState<string | null>(null);
  const notifiedKeysRef = useRef<Set<string>>(new Set());
  const seenOutcomeCallsRef = useRef<{ initialised: boolean; ids: Set<string> }>({
    initialised: false,
    ids: new Set(),
  });

  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());
  const [activeViewId, setActiveViewId] = useState<string>(() => {
    try { return localStorage.getItem(LAST_VIEW_KEY) || ""; } catch { return ""; }
  });

  // Apply the last-used view on first mount
  const didApplyInitialViewRef = useRef(false);
  useEffect(() => {
    if (didApplyInitialViewRef.current) return;
    didApplyInitialViewRef.current = true;
    const v = savedViews.find((x) => x.id === activeViewId);
    if (v) applyView(v, { persist: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(thresholds));
    } catch {
      /* ignore */
    }
  }, [thresholds]);

  useEffect(() => {
    try { localStorage.setItem(VIEWS_KEY, JSON.stringify(savedViews)); } catch { /* ignore */ }
  }, [savedViews]);

  useEffect(() => {
    try { localStorage.setItem(LAST_VIEW_KEY, activeViewId); } catch { /* ignore */ }
  }, [activeViewId]);

  // Persist filter selections so they survive reloads and background refreshes.
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ from, to, customer, operator }));
    } catch { /* ignore */ }
  }, [from, to, customer, operator]);

  function applyView(v: SavedView, opts: { persist?: boolean } = { persist: true }) {
    setFrom(v.from);
    setTo(v.to);
    setCustomer(v.customer);
    setOperator(v.operator);
    setLive(v.live);
    setIntervalSec(v.intervalSec);
    if (opts.persist !== false) setActiveViewId(v.id);
  }

  function handleSaveView() {
    const name = window.prompt("Name this view (e.g. 'Last 7 days — Team A')");
    if (!name || !name.trim()) return;
    const view: SavedView = {
      id: (crypto as any)?.randomUUID?.() ?? `v_${Date.now()}`,
      name: name.trim(),
      from, to, customer, operator, live, intervalSec,
    };
    setSavedViews((prev) => [...prev, view]);
    setActiveViewId(view.id);
    toast.success(`View "${view.name}" saved`);
  }

  function handleUpdateView() {
    if (!activeViewId) return;
    setSavedViews((prev) => prev.map((v) =>
      v.id === activeViewId ? { ...v, from, to, customer, operator, live, intervalSec } : v
    ));
    const name = savedViews.find((v) => v.id === activeViewId)?.name;
    toast.success(`View "${name}" updated`);
  }

  function handleDeleteView() {
    if (!activeViewId) return;
    const v = savedViews.find((x) => x.id === activeViewId);
    if (!v) return;
    if (!window.confirm(`Delete view "${v.name}"?`)) return;
    setSavedViews((prev) => prev.filter((x) => x.id !== activeViewId));
    setActiveViewId("");
    toast.success(`View "${v.name}" deleted`);
  }


  const load = async (silent = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (!silent) setLoading(true);
    // Capture scroll position before a background refresh so re-renders don't
    // shove the user away from where they were reading.
    if (silent && typeof window !== "undefined") {
      preserveScrollRef.current = window.scrollY;
    }
    setError(null);
    try {
      const { data, error } = await supabase
        .from("call_logs")
        .select("call_id,customer_name,agent,duration_seconds,status,date,call_started_at")
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false })
        .limit(10000);
      if (error) throw error;
      setRows((data as CallRow[]) || []);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load call logs");
      if (!silent) setRows([]);
    } finally {
      if (!silent) setLoading(false);
      inFlightRef.current = false;
    }
  };

  // Restore scroll after a silent refresh commits new rows to the DOM.
  useEffect(() => {
    if (preserveScrollRef.current == null) return;
    const y = preserveScrollRef.current;
    preserveScrollRef.current = null;
    const raf = requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }));
    return () => cancelAnimationFrame(raf);
  }, [rows]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // Polling auto-refresh
  useEffect(() => {
    if (!live) return;
    const ms = Math.max(5, parseInt(intervalSec, 10) || 30) * 1000;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, intervalSec, from, to]);

  // Realtime: refresh on any change to call_logs
  useEffect(() => {
    if (!live) return;
    let debounceId: number | undefined;
    const channel = supabase
      .channel("operator-dashboard-call-logs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_logs" },
        () => {
          window.clearTimeout(debounceId);
          debounceId = window.setTimeout(() => load(true), 800);
        }
      )
      .subscribe();
    return () => {
      window.clearTimeout(debounceId);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, from, to]);

  // Tick "updated Xs ago"
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);


  const customers = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.customer_name && set.add(r.customer_name));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const operators = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (!r.agent) return;
      r.agent.split(",").forEach((a) => {
        const t = a.trim();
        if (t) set.add(t);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredNoOutcome = useMemo(() => {
    return rows.filter((r) => {
      if (customer !== ALL && r.customer_name !== customer) return false;
      if (operator !== ALL) {
        const agents = (r.agent || "").split(",").map((s) => s.trim());
        if (!agents.includes(operator)) return false;
      }
      return true;
    });
  }, [rows, customer, operator]);

  const filtered = useMemo(() => {
    if (!outcomeFilter) return filteredNoOutcome;
    return filteredNoOutcome.filter(
      (r) => ((r.status || "Unknown").trim() || "Unknown") === outcomeFilter,
    );
  }, [filteredNoOutcome, outcomeFilter]);

  // Clear outcome filter if it no longer matches any row in the current window
  useEffect(() => {
    if (!outcomeFilter) return;
    const exists = filteredNoOutcome.some(
      (r) => ((r.status || "Unknown").trim() || "Unknown") === outcomeFilter,
    );
    if (!exists) setOutcomeFilter(null);
  }, [filteredNoOutcome, outcomeFilter]);

  const totalCalls = filtered.length;
  const totalDuration = useMemo(
    () => filtered.reduce((sum, r) => sum + (r.duration_seconds || 0), 0),
    [filtered]
  );
  const avgHandling = totalCalls > 0 ? totalDuration / totalCalls : 0;
  const uniqueOperators = useMemo(() => {
    const set = new Set<string>();
    filtered.forEach((r) => {
      (r.agent || "").split(",").forEach((a) => {
        const t = a.trim();
        if (t) set.add(t);
      });
    });
    return set.size;
  }, [filtered]);

  const outcomeData = useMemo(() => {
    const map = new Map<string, number>();
    filteredNoOutcome.forEach((r) => {
      const key = (r.status || "Unknown").trim() || "Unknown";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredNoOutcome]);

  // Reset the "seen" set when the query window or watched outcomes change,
  // so we don't retroactively alert on rows that were already visible.
  useEffect(() => {
    seenOutcomeCallsRef.current = { initialised: false, ids: new Set() };
  }, [from, to, customer, operator, thresholds.outcomeAlerts.join("|")]);

  // Outcome-based alerts: toast when a call matching a watched outcome appears
  // during live updates. First load only primes the seen set (no toast spam).
  useEffect(() => {
    const watched = new Set(
      (thresholds.outcomeAlerts || []).map((s) => s.trim()).filter(Boolean),
    );
    const seen = seenOutcomeCallsRef.current;

    if (!seen.initialised) {
      filtered.forEach((r) => seen.ids.add(r.call_id));
      seen.initialised = true;
      return;
    }

    if (!live || !thresholds.enabled || watched.size === 0) {
      // Still track ids so we don't alert for a backlog when settings re-enable
      filtered.forEach((r) => seen.ids.add(r.call_id));
      return;
    }

    const newHits: CallRow[] = [];
    filtered.forEach((r) => {
      if (seen.ids.has(r.call_id)) return;
      seen.ids.add(r.call_id);
      const status = (r.status || "Unknown").trim() || "Unknown";
      if (watched.has(status)) newHits.push(r);
    });

    if (newHits.length === 0) return;

    // Group by status for a tidy toast
    const byStatus = new Map<string, CallRow[]>();
    newHits.forEach((r) => {
      const s = (r.status || "Unknown").trim() || "Unknown";
      const list = byStatus.get(s) || [];
      list.push(r);
      byStatus.set(s, list);
    });
    byStatus.forEach((list, status) => {
      const sample = list[0];
      const who = sample?.customer_name || sample?.agent || "unknown";
      toast.warning(
        `${list.length} new "${status}" call${list.length === 1 ? "" : "s"}`,
        { description: list.length === 1 ? `Customer: ${who}` : `Latest: ${who}` },
      );
    });
  }, [filtered, live, thresholds.enabled, thresholds.outcomeAlerts]);


  const operatorData = useMemo(() => {
    const map = new Map<string, { calls: number; total: number }>();
    filtered.forEach((r) => {
      const agents = (r.agent || "").split(",").map((s) => s.trim()).filter(Boolean);
      const list = agents.length ? agents : ["Unassigned"];
      list.forEach((a) => {
        const cur = map.get(a) || { calls: 0, total: 0 };
        cur.calls += 1;
        cur.total += r.duration_seconds || 0;
        map.set(a, cur);
      });
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        calls: v.calls,
        avgSeconds: v.calls > 0 ? Math.round(v.total / v.calls) : 0,
      }))
      .sort((a, b) => b.calls - a.calls);
  }, [filtered]);

  // Date-range span in days (inclusive)
  const rangeDays = useMemo(() => {
    const f = new Date(from + "T00:00:00");
    const t = new Date(to + "T00:00:00");
    const diff = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
    return Math.max(1, diff);
  }, [from, to]);

  const callsPerDay = totalCalls / rangeDays;

  // Threshold breaches
  const breaches = useMemo(() => {
    if (!thresholds.enabled) return [] as { key: string; label: string; detail: string }[];
    const list: { key: string; label: string; detail: string }[] = [];
    if (thresholds.callsPerDay > 0 && callsPerDay > thresholds.callsPerDay) {
      list.push({
        key: "callsPerDay",
        label: "High call volume",
        detail: `${callsPerDay.toFixed(1)} calls/day exceeds threshold of ${thresholds.callsPerDay}.`,
      });
    }
    if (thresholds.ahtSeconds > 0 && avgHandling > thresholds.ahtSeconds) {
      list.push({
        key: "aht",
        label: "Abnormal average handling time",
        detail: `AHT ${formatDuration(avgHandling)} exceeds threshold of ${formatDuration(thresholds.ahtSeconds)}.`,
      });
    }
    operatorData.forEach((o) => {
      if (thresholds.perOpCalls > 0 && o.calls > thresholds.perOpCalls) {
        list.push({
          key: `op-calls-${o.name}`,
          label: `${o.name}: high call volume`,
          detail: `${o.calls} calls exceeds per-operator threshold of ${thresholds.perOpCalls}.`,
        });
      }
      if (thresholds.perOpAhtSeconds > 0 && o.avgSeconds > thresholds.perOpAhtSeconds) {
        list.push({
          key: `op-aht-${o.name}`,
          label: `${o.name}: abnormal AHT`,
          detail: `AHT ${formatDuration(o.avgSeconds)} exceeds per-operator threshold of ${formatDuration(thresholds.perOpAhtSeconds)}.`,
        });
      }
    });
    return list;
  }, [thresholds, callsPerDay, avgHandling, operatorData]);

  // Toast on newly-crossed breach while live
  useEffect(() => {
    if (!live || !thresholds.enabled) return;
    breaches.forEach((b) => {
      if (!notifiedKeysRef.current.has(b.key)) {
        notifiedKeysRef.current.add(b.key);
        toast.warning(b.label, { description: b.detail });
      }
    });
    // clear stale keys so re-crossing after clearing can re-alert
    const active = new Set(breaches.map((b) => b.key));
    notifiedKeysRef.current.forEach((k) => {
      if (!active.has(k)) notifiedKeysRef.current.delete(k);
    });
  }, [breaches, live, thresholds.enabled]);

  const opBreachSet = useMemo(() => {
    const s = new Set<string>();
    breaches.forEach((b) => {
      const m = b.key.match(/^op-(?:calls|aht)-(.+)$/);
      if (m) s.add(m[1]);
    });
    return s;
  }, [breaches]);

  // Alerts history: every outcome-match call in the range + per-day threshold
  // breaches derived from the same filtered window.
  type AlertEntry = {
    id: string;
    when: string; // ISO or date
    type: "Outcome" | "Volume" | "AHT";
    label: string;
    detail: string;
  };
  const alertsHistory = useMemo<AlertEntry[]>(() => {
    const list: AlertEntry[] = [];
    const watched = new Set(
      (thresholds.outcomeAlerts || []).map((s) => s.trim()).filter(Boolean),
    );

    if (thresholds.enabled && watched.size > 0) {
      filteredNoOutcome.forEach((r) => {
        const status = (r.status || "Unknown").trim() || "Unknown";
        if (!watched.has(status)) return;
        const when = r.call_started_at || r.date || "";
        const who = r.customer_name || "Unknown customer";
        const agent = r.agent || "Unassigned";
        list.push({
          id: `outcome-${r.call_id}`,
          when,
          type: "Outcome",
          label: status,
          detail: `${who} • ${agent} • ${formatDuration(r.duration_seconds || 0)}`,
        });
      });
    }

    if (thresholds.enabled) {
      // Per-day aggregates for volume + AHT threshold breaches
      const byDay = new Map<string, { calls: number; total: number }>();
      filteredNoOutcome.forEach((r) => {
        const day = (r.date || (r.call_started_at || "").slice(0, 10)) || "";
        if (!day) return;
        const cur = byDay.get(day) || { calls: 0, total: 0 };
        cur.calls += 1;
        cur.total += r.duration_seconds || 0;
        byDay.set(day, cur);
      });
      byDay.forEach((v, day) => {
        if (thresholds.callsPerDay > 0 && v.calls > thresholds.callsPerDay) {
          list.push({
            id: `vol-${day}`,
            when: `${day}T23:59:59`,
            type: "Volume",
            label: "High call volume",
            detail: `${v.calls} calls exceeded threshold of ${thresholds.callsPerDay}.`,
          });
        }
        const aht = v.calls > 0 ? v.total / v.calls : 0;
        if (thresholds.ahtSeconds > 0 && aht > thresholds.ahtSeconds) {
          list.push({
            id: `aht-${day}`,
            when: `${day}T23:59:59`,
            type: "AHT",
            label: "Abnormal handling time",
            detail: `AHT ${formatDuration(aht)} exceeded threshold of ${formatDuration(thresholds.ahtSeconds)}.`,
          });
        }
      });
    }

    return list.sort((a, b) => (b.when || "").localeCompare(a.when || ""));
  }, [
    filteredNoOutcome,
    thresholds.enabled,
    thresholds.outcomeAlerts,
    thresholds.callsPerDay,
    thresholds.ahtSeconds,
  ]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Operator Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Team · Call volume, average handling time and outcomes for the selected range.
          </p>
        </div>
        <ThresholdSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          value={thresholds}
          availableOutcomes={outcomeData.map((o) => o.status)}
          onSave={(t) => {
            setThresholds(t);
            notifiedKeysRef.current.clear();
          }}
        />
      </div>

      {breaches.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {breaches.length} alert{breaches.length === 1 ? "" : "s"} triggered
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1 text-sm list-disc pl-5">
              {breaches.map((b) => (
                <li key={b.key}>
                  <span className="font-medium">{b.label}:</span> {b.detail}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}


      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-2 border-b pb-3">
            <div className="space-y-1 min-w-[220px]">
              <Label className="text-xs text-muted-foreground">Saved views</Label>
              <Select
                value={activeViewId || ALL}
                onValueChange={(val) => {
                  if (val === ALL) { setActiveViewId(""); return; }
                  const v = savedViews.find((x) => x.id === val);
                  if (v) applyView(v);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={savedViews.length ? "Choose a view" : "No saved views"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>— None —</SelectItem>
                  {savedViews.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={handleSaveView}>Save as new</Button>
            <Button variant="outline" size="sm" onClick={handleUpdateView} disabled={!activeViewId}>
              Update current
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDeleteView} disabled={!activeViewId}>
              Delete
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              Views capture date range, customer, operator and live-refresh settings.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="space-y-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Customer</Label>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger><SelectValue placeholder="All customers" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={ALL}>All customers</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Operator</Label>
              <Select value={operator} onValueChange={setOperator}>
                <SelectTrigger><SelectValue placeholder="All operators" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={ALL}>All operators</SelectItem>
                  {operators.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button onClick={() => load(false)} className="w-full" disabled={loading}>
                {loading ? "Loading…" : "Refresh"}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 border-t pt-3">
            <div className="flex items-center gap-2">
              <Radio className={`h-4 w-4 ${live ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
              <Label htmlFor="live-toggle" className="text-sm">Live updates</Label>
              <Switch id="live-toggle" checked={live} onCheckedChange={setLive} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Every</Label>
              <Select value={intervalSec} onValueChange={setIntervalSec} disabled={!live}>
                <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="60">1m</SelectItem>
                  <SelectItem value="300">5m</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground ml-auto">
              {lastUpdated
                ? `Updated ${Math.max(0, Math.floor((now.getTime() - lastUpdated.getTime()) / 1000))}s ago`
                : "Not yet updated"}
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={<PhoneCall className="h-4 w-4" />} label="Total calls" value={totalCalls.toLocaleString()} loading={loading} />
        <MetricCard icon={<Clock className="h-4 w-4" />} label="Avg handling time" value={formatDuration(avgHandling)} loading={loading} />
        <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Total handling time" value={formatDuration(totalDuration)} loading={loading} />
        <MetricCard icon={<Users className="h-4 w-4" />} label="Operators active" value={uniqueOperators.toLocaleString()} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>Outcome breakdown</span>
              <span className="text-xs font-normal text-muted-foreground">
                {outcomeFilter ? `Filtering by "${outcomeFilter}"` : "Click a bar to filter the dashboard"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <Skeleton className="w-full h-full" />
            ) : outcomeData.length === 0 ? (
              <div className="text-sm text-muted-foreground">No calls in this range.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={outcomeData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={(d: any) => {
                      const s = d?.payload?.status ?? d?.status;
                      if (!s) return;
                      const str = String(s);
                      setOutcomeFilter((cur) => (cur === str ? null : str));
                    }}
                  >
                    {outcomeData.map((entry, i) => {
                      const active = outcomeFilter && entry.status !== outcomeFilter;
                      return (
                        <Cell
                          key={i}
                          fill={BAR_COLORS[i % BAR_COLORS.length]}
                          fillOpacity={active ? 0.25 : 1}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calls per operator</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <Skeleton className="w-full h-full" />
            ) : operatorData.length === 0 ? (
              <div className="text-sm text-muted-foreground">No calls in this range.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={operatorData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={140} />
                  <Tooltip />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operator summary</CardTitle>
        </CardHeader>
        <CardContent>
          {operatorData.length === 0 ? (
            <div className="text-sm text-muted-foreground">No calls in this range.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Operator</th>
                    <th className="py-2 pr-4">Calls</th>
                    <th className="py-2 pr-4">Avg handling</th>
                  </tr>
                </thead>
                <tbody>
                  {operatorData.map((o) => {
                    const flagged = opBreachSet.has(o.name);
                    return (
                      <tr
                        key={o.name}
                        className={`border-b last:border-0 ${flagged ? "bg-destructive/10" : ""}`}
                      >
                        <td className="py-2 pr-4 font-medium">
                          <span className="inline-flex items-center gap-2">
                            {flagged && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                            {o.name}
                          </span>
                        </td>
                        <td className="py-2 pr-4">{o.calls.toLocaleString()}</td>
                        <td className="py-2 pr-4">{formatDuration(o.avgSeconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertsHistory entries={alertsHistory} />

      <CallLogsTable
        rows={filtered}
        outcomeFilter={outcomeFilter}
        onClearOutcome={() => setOutcomeFilter(null)}
      />
    </div>
  );
}

type AlertEntry = {
  id: string;
  when: string;
  type: "Outcome" | "Volume" | "AHT";
  label: string;
  detail: string;
};

function AlertsHistory({ entries }: { entries: AlertEntry[] }) {
  const [typeFilter, setTypeFilter] = useState<"all" | "Outcome" | "Volume" | "AHT">("all");
  const [limit, setLimit] = useState(50);
  useEffect(() => setLimit(50), [entries.length, typeFilter]);

  const filtered = useMemo(
    () => (typeFilter === "all" ? entries : entries.filter((e) => e.type === typeFilter)),
    [entries, typeFilter],
  );
  const visible = filtered.slice(0, limit);

  const fmtWhen = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const badgeClass = (t: AlertEntry["type"]) =>
    t === "Outcome"
      ? "bg-destructive/10 text-destructive"
      : t === "Volume"
        ? "bg-primary/10 text-primary"
        : "bg-amber-500/10 text-amber-600 dark:text-amber-400";

  const types: Array<"all" | "Outcome" | "Volume" | "AHT"> = ["all", "Outcome", "Volume", "AHT"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            Alerts history
          </span>
          <span className="flex items-center gap-1 text-xs font-normal">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2 py-0.5 rounded-full border ${
                  typeFilter === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t === "all" ? "All" : t}
              </button>
            ))}
            <span className="ml-2 text-muted-foreground">
              {filtered.length.toLocaleString()} alert{filtered.length === 1 ? "" : "s"}
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No alerts fired for the current filters. Configure watched outcomes and thresholds in
            settings to populate this history.
          </div>
        ) : (
          <>
            <div className="max-h-[50vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="py-2 px-3 font-medium">When</th>
                    <th className="py-2 px-3 font-medium">Type</th>
                    <th className="py-2 px-3 font-medium">Alert</th>
                    <th className="py-2 px-3 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                        {fmtWhen(e.when)}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${badgeClass(e.type)}`}>
                          {e.type}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-medium">{e.label}</td>
                      <td className="py-2 px-3 text-muted-foreground">{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > visible.length && (
              <div className="mt-3 flex justify-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + 50)}>
                  Show more ({filtered.length - visible.length} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CallLogsTable({
  rows,
  outcomeFilter,
  onClearOutcome,
}: {
  rows: CallRow[];
  outcomeFilter: string | null;
  onClearOutcome: () => void;
}) {
  const [limit, setLimit] = useState(100);
  useEffect(() => setLimit(100), [outcomeFilter, rows.length]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ta = a.call_started_at || a.date || "";
      const tb = b.call_started_at || b.date || "";
      return tb.localeCompare(ta);
    });
  }, [rows]);

  const visible = sorted.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
          <span>Call logs</span>
          <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            {outcomeFilter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5">
                Outcome: {outcomeFilter}
                <button
                  type="button"
                  onClick={onClearOutcome}
                  className="ml-1 hover:underline"
                  aria-label="Clear outcome filter"
                >
                  ✕
                </button>
              </span>
            )}
            <span>
              {sorted.length.toLocaleString()} call{sorted.length === 1 ? "" : "s"}
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="text-sm text-muted-foreground">No calls match the current filters.</div>
        ) : (
          <>
            <div className="max-h-[60vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="py-2 px-3 font-medium">When</th>
                    <th className="py-2 px-3 font-medium">Customer</th>
                    <th className="py-2 px-3 font-medium">Operator</th>
                    <th className="py-2 px-3 font-medium">Outcome</th>
                    <th className="py-2 px-3 font-medium">Duration</th>
                    <th className="py-2 px-3 font-medium">Call ID</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const when = r.call_started_at
                      ? new Date(r.call_started_at).toLocaleString("en-GB")
                      : r.date || "—";
                    return (
                      <tr key={r.call_id} className="border-t">
                        <td className="py-2 px-3 whitespace-nowrap">{when}</td>
                        <td className="py-2 px-3">{r.customer_name || "—"}</td>
                        <td className="py-2 px-3">{r.agent || "Unassigned"}</td>
                        <td className="py-2 px-3">{(r.status || "Unknown").trim() || "Unknown"}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{formatDuration(r.duration_seconds || 0)}</td>
                        <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{r.call_id}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sorted.length > visible.length && (
              <div className="mt-3 flex justify-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + 200)}>
                  Show more ({sorted.length - visible.length} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          <span>{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-24 mt-2" />
        ) : (
          <div className="text-2xl font-semibold mt-1 text-foreground">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function ThresholdSettings({
  open,
  onOpenChange,
  value,
  availableOutcomes,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: Thresholds;
  availableOutcomes: string[];
  onSave: (t: Thresholds) => void;
}) {
  const [draft, setDraft] = useState<Thresholds>(value);
  const [customOutcome, setCustomOutcome] = useState("");
  useEffect(() => {
    if (open) {
      setDraft(value);
      setCustomOutcome("");
    }
  }, [open, value]);

  type NumericKey = "callsPerDay" | "ahtSeconds" | "perOpCalls" | "perOpAhtSeconds";
  const numField = (
    key: NumericKey,
    label: string,
    help: string,
    suffix?: string,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`th-${key}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={`th-${key}`}
          type="number"
          min={0}
          value={draft[key]}
          onChange={(e) =>
            setDraft((d) => ({ ...d, [key]: Math.max(0, Number(e.target.value) || 0) }))
          }
        />
        {suffix && <span className="text-xs text-muted-foreground w-14">{suffix}</span>}
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );

  const watched = draft.outcomeAlerts || [];
  const suggestionPool = Array.from(
    new Set([...availableOutcomes, "Missed", "Voicemail", "Abandoned", "Failed"]),
  ).filter((s) => s && !watched.includes(s));

  function addOutcome(s: string) {
    const v = s.trim();
    if (!v) return;
    if (watched.includes(v)) return;
    setDraft((d) => ({ ...d, outcomeAlerts: [...(d.outcomeAlerts || []), v] }));
  }
  function removeOutcome(s: string) {
    setDraft((d) => ({ ...d, outcomeAlerts: (d.outcomeAlerts || []).filter((x) => x !== s) }));
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Alert thresholds
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Alert thresholds</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable alerts</div>
              <div className="text-xs text-muted-foreground">
                Show a banner and toast when thresholds are exceeded.
              </div>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {numField(
              "callsPerDay",
              "High call volume",
              "Avg calls per day across the selected range.",
              "calls/day",
            )}
            {numField(
              "ahtSeconds",
              "Abnormal avg handling time",
              "Overall average handling time.",
              "seconds",
            )}
            {numField(
              "perOpCalls",
              "Per-operator calls",
              "Flag any operator exceeding this call count.",
              "calls",
            )}
            {numField(
              "perOpAhtSeconds",
              "Per-operator AHT",
              "Flag any operator exceeding this AHT.",
              "seconds",
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Set a value to 0 to disable that individual check.
          </p>

          <div className="space-y-2 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Outcome alerts</div>
              <div className="text-xs text-muted-foreground">
                Toast me during live updates whenever a call with one of these outcomes arrives.
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {watched.length === 0 ? (
                <span className="text-xs text-muted-foreground">No outcomes watched.</span>
              ) : (
                watched.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => removeOutcome(s)}
                    className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs hover:bg-destructive/20"
                    title="Remove"
                  >
                    {s} <span aria-hidden>×</span>
                  </button>
                ))
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={customOutcome}
                onChange={(e) => setCustomOutcome(e.target.value)}
                placeholder="Add outcome (e.g. Missed)"
                className="h-8 max-w-[220px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOutcome(customOutcome);
                    setCustomOutcome("");
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => { addOutcome(customOutcome); setCustomOutcome(""); }}
              >
                Add
              </Button>
            </div>
            {suggestionPool.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground self-center">Suggestions:</span>
                {suggestionPool.slice(0, 10).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addOutcome(s)}
                    className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => setDraft(DEFAULT_THRESHOLDS)}
          >
            Reset defaults
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

