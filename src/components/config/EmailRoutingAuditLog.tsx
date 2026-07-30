import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, ScrollText, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

interface LogRow {
  id: string;
  received_at: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  status: string;
  task_id: string | null;
  assigned_to: string | null;
  customer_id: string | null;
  matched_rule_id: string | null;
  error_message: string | null;
  attachment_count: number;
}

interface Rule { id: string; match_type: string; match_value: string }
interface UserLite { id: string; name: string | null; email: string | null }
interface CustomerLite { id: string; name: string | null }

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  processed: "default",
  received: "secondary",
  retrying: "secondary",
  failed: "destructive",
  skipped: "outline",
};

const MATCH_LABEL: Record<string, string> = {
  email: "Sender email",
  name_contains: "Sender name",
  domain: "Sender domain",
  subject_contains: "Subject",
  body_contains: "Body keyword",
};

export default function EmailRoutingAuditLog() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: logs }, { data: rulesData }, { data: userData }, { data: custData }] = await Promise.all([
      supabase
        .from("inbound_email_log")
        .select("id, received_at, from_email, from_name, subject, status, task_id, assigned_to, customer_id, matched_rule_id, error_message, attachment_count")
        .order("received_at", { ascending: false })
        .limit(100),
      (supabase.from("email_intake_rules" as any) as any).select("id, match_type, match_value"),
      supabase.from("system_users").select("id, name, email"),
      (supabase.rpc("get_customer_directory" as any) as any),
    ]);
    setRows(((logs as any) || []) as LogRow[]);
    setRules(((rulesData as any) || []) as Rule[]);
    setUsers(((userData as any) || []) as UserLite[]);
    setCustomers(((custData as any) || []) as CustomerLite[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const ruleMap = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const custMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.from_email, r.from_name, r.subject, r.status, r.error_message]
        .some((v) => (v || "").toLowerCase().includes(q)),
    );
  }, [rows, filter]);

  const describeRoute = (r: LogRow): string => {
    if (r.status === "failed") return r.error_message || "Processing failed";
    if (r.status !== "processed") return `Status: ${r.status}`;
    const parts: string[] = [];
    if (r.matched_rule_id) {
      const rule = ruleMap.get(r.matched_rule_id);
      parts.push(rule
        ? `Matched rule: ${MATCH_LABEL[rule.match_type] || rule.match_type} = "${rule.match_value}"`
        : "Matched a rule (deleted)");
    } else {
      parts.push("No rule matched — auto-routed");
    }
    return parts.join(" · ");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><ScrollText className="h-4 w-4" /> Routing audit log</CardTitle>
          <CardDescription>
            Last 100 inbound emails with the rule that matched, who they were assigned to, and the resulting task status. Use this to troubleshoot why a message was (or wasn't) routed as expected.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Filter by sender, subject, status…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-md"
        />
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Received</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Routing reason</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead className="text-right">Task</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">No inbound emails yet.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const cust = r.customer_id ? custMap.get(r.customer_id) : null;
                const user = r.assigned_to ? userMap.get(r.assigned_to) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.received_at).toLocaleString("en-GB")}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{r.from_name || r.from_email}</div>
                      {r.from_name && <div className="text-xs text-muted-foreground">{r.from_email}</div>}
                    </TableCell>
                    <TableCell className="text-sm max-w-[240px] truncate" title={r.subject || ""}>
                      {r.subject || <span className="text-muted-foreground">(no subject)</span>}
                      {r.attachment_count > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">📎 {r.attachment_count}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status] || "outline"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[300px]">{describeRoute(r)}</TableCell>
                    <TableCell className="text-sm">{cust?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">{user?.name || user?.email || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">
                      {r.task_id ? (
                        <Link to={`/tasks?task=${r.task_id}`} className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                          Open <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
