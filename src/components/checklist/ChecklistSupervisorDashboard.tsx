import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface InstanceRow {
  id: string;
  user_id: string;
  task_date: string;
  title: string;
  status: string;
  priority: string;
  due_time: string | null;
  completed_at: string | null;
  completion_notes: string | null;
  skipped_reason: string | null;
  system_user_id: string | null;
}

export default function ChecklistSupervisorDashboard() {
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [userFilter, setUserFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("system_users").select("id,user_id,name");
      const map: Record<string, string> = {};
      (data ?? []).forEach((u: any) => {
        if (u.user_id) map[u.user_id] = u.name;
        if (u.id) map[u.id] = u.name;
      });
      setUsers(map);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("checklist_instances")
        .select("id,user_id,system_user_id,task_date,title,status,priority,due_time,completed_at,completion_notes,skipped_reason")
        .eq("task_date", date)
        .order("user_id");
      setRows((data ?? []) as InstanceRow[]);
      setLoading(false);
    })();
  }, [date]);

  const filtered = useMemo(() => rows.filter((r) =>
    (userFilter === "all" || r.user_id === userFilter) &&
    (statusFilter === "all" || r.status === statusFilter) &&
    (priorityFilter === "all" || r.priority === priorityFilter)
  ), [rows, userFilter, statusFilter, priorityFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const completed = filtered.filter((r) => r.status === "completed").length;
    const overdue = filtered.filter((r) => r.status === "overdue").length;
    const skipped = filtered.filter((r) => r.status === "skipped" || r.status === "not_applicable").length;
    return {
      total, completed, overdue, skipped,
      pct: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [filtered]);

  const uniqueUsers = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((r) => set.set(r.user_id, users[r.user_id] || "Unknown"));
    return Array.from(set.entries());
  }, [rows, users]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Completed</div><div className="text-2xl font-bold text-green-600">{stats.completed}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Overdue</div><div className="text-2xl font-bold text-destructive">{stats.overdue}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Skipped/NA</div><div className="text-2xl font-bold">{stats.skipped}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">On-time %</div><div className="text-2xl font-bold">{stats.pct}%</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <Label>Staff</Label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {uniqueUsers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="not_started">Not started</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
                <SelectItem value="not_applicable">Not applicable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No tasks for this date/filters</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{users[r.user_id] || users[r.system_user_id ?? ""] || "Unknown"}</TableCell>
                <TableCell className="text-sm">{r.title}</TableCell>
                <TableCell>{r.due_time?.slice(0, 5) ?? "-"}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{r.priority}</Badge></TableCell>
                <TableCell>
                  <Badge variant={r.status === "completed" ? "default" : r.status === "overdue" ? "destructive" : "secondary"} className="capitalize">
                    {r.status.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {r.completed_at ? new Date(r.completed_at).toLocaleString("en-GB") : "-"}
                </TableCell>
                <TableCell className="text-xs max-w-xs truncate">
                  {r.completion_notes || r.skipped_reason || "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
