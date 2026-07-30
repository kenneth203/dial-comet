import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Filter } from "lucide-react";

type MatchType = "email" | "name_contains" | "domain" | "subject_contains" | "body_contains";
type TaskStatus = "To Do" | "In Progress" | "Completed";

interface Rule {
  id: string;
  match_type: MatchType;
  match_value: string;
  customer_id: string | null;
  assignee_id: string | null;
  task_status: TaskStatus;
  task_priority: string | null;
  enabled: boolean;
  sort_order: number;
}

interface CustomerLite { id: string; name: string | null }
interface UserLite { id: string; name: string | null; email: string | null }

const MATCH_LABEL: Record<MatchType, string> = {
  email: "Sender email is",
  name_contains: "Sender name contains",
  domain: "Sender domain is",
  subject_contains: "Subject contains",
  body_contains: "Body contains keyword",
};

const MATCH_PLACEHOLDER: Record<MatchType, string> = {
  email: "ianb@alanboswell.com",
  name_contains: "Ian Bowes",
  domain: "alanboswell.com",
  subject_contains: "invoice",
  body_contains: "urgent",
};

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "To Do", label: "New Task (To Do)" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed", label: "Completed" },
];

const PRIORITY_OPTIONS = ["Low", "Medium", "High"] as const;

const emptyDraft: Omit<Rule, "id" | "sort_order"> = {
  match_type: "email",
  match_value: "",
  customer_id: null,
  assignee_id: null,
  task_status: "To Do",
  task_priority: "Medium",
  enabled: true,
};

export default function EmailIntakeRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [draft, setDraft] = useState<typeof emptyDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: rulesData }, { data: custData }, { data: userData }] = await Promise.all([
      (supabase.from("email_intake_rules" as any) as any)
        .select("id, match_type, match_value, customer_id, assignee_id, task_status, task_priority, enabled, sort_order")
        .order("sort_order", { ascending: true }),
      (supabase.rpc("get_customer_directory" as any) as any),
      supabase.from("system_users").select("id, name, email").order("name"),
    ]);
    setRules(((rulesData as any) || []) as Rule[]);
    setCustomers(((custData as any) || []) as CustomerLite[]);
    setUsers(((userData as any) || []) as UserLite[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const openAdd = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setDialogOpen(true);
  };

  const openEdit = (r: Rule) => {
    setEditing(r);
    setDraft({
      match_type: r.match_type,
      match_value: r.match_value,
      customer_id: r.customer_id,
      assignee_id: r.assignee_id,
      task_status: r.task_status,
      task_priority: r.task_priority || "Medium",
      enabled: r.enabled,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const value = draft.match_value.trim().toLowerCase();
    if (!value) {
      toast({ title: "Match value required", variant: "destructive" });
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await (supabase.from("email_intake_rules" as any) as any)
        .update({
          match_type: draft.match_type,
          match_value: value,
          customer_id: draft.customer_id,
          assignee_id: draft.assignee_id,
          task_status: draft.task_status,
          task_priority: draft.task_priority,
          enabled: draft.enabled,
        })
        .eq("id", editing.id);
      setSaving(false);
      if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    } else {
      const nextOrder = (rules[rules.length - 1]?.sort_order || 100) + 10;
      const { error } = await (supabase.from("email_intake_rules" as any) as any).insert({
        match_type: draft.match_type,
        match_value: value,
        customer_id: draft.customer_id,
        assignee_id: draft.assignee_id,
        task_status: draft.task_status,
        task_priority: draft.task_priority,
        enabled: draft.enabled,
        sort_order: nextOrder,
      });
      setSaving(false);
      if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: "Saved", description: "Routing rule updated." });
    setDialogOpen(false);
    load();
  };

  const remove = async (r: Rule) => {
    if (!confirm(`Delete rule "${MATCH_LABEL[r.match_type]} ${r.match_value}"?`)) return;
    const { error } = await (supabase.from("email_intake_rules" as any) as any).delete().eq("id", r.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Deleted" });
    load();
  };

  const toggleEnabled = async (r: Rule) => {
    const { error } = await (supabase.from("email_intake_rules" as any) as any)
      .update({ enabled: !r.enabled })
      .eq("id", r.id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const move = async (r: Rule, dir: -1 | 1) => {
    const idx = rules.findIndex((x) => x.id === r.id);
    const j = idx + dir;
    if (j < 0 || j >= rules.length) return;
    const other = rules[j];
    await (supabase.from("email_intake_rules" as any) as any).update({ sort_order: other.sort_order }).eq("id", r.id);
    await (supabase.from("email_intake_rules" as any) as any).update({ sort_order: r.sort_order }).eq("id", other.id);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Filter className="h-4 w-4" /> Sender routing rules</CardTitle>
          <CardDescription>
            When an incoming email matches a rule, its task is automatically linked to the chosen customer, assigned to the chosen user, and given the selected status. Rules are checked in order — the first enabled match wins.
          </CardDescription>
        </div>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" /> Add rule</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading rules…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No routing rules yet. Add one to automatically assign emails from specific senders.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px]">Order</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Assign to</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(r, -1)} disabled={i === 0}><ArrowUp className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(r, 1)} disabled={i === rules.length - 1}><ArrowDown className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground">{MATCH_LABEL[r.match_type]}</span>{" "}
                      <span className="font-medium">{r.match_value}</span>
                    </TableCell>
                    <TableCell className="text-sm">{r.customer_id ? (customerMap.get(r.customer_id)?.name || "—") : <span className="text-muted-foreground">Auto-match</span>}</TableCell>
                    <TableCell className="text-sm">{r.assignee_id ? (userMap.get(r.assignee_id)?.name || "—") : <span className="text-muted-foreground">Round-robin</span>}</TableCell>
                    <TableCell className="text-sm">{r.task_status === "To Do" ? "New Task" : r.task_status}</TableCell>
                    <TableCell className="text-sm">{r.task_priority || "Medium"}</TableCell>
                    <TableCell><Switch checked={r.enabled} onCheckedChange={() => toggleEnabled(r)} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit routing rule" : "Add routing rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Match type</Label>
                <Select value={draft.match_type} onValueChange={(v) => setDraft((d) => ({ ...d, match_type: v as MatchType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Sender email is</SelectItem>
                    <SelectItem value="name_contains">Sender name contains</SelectItem>
                    <SelectItem value="domain">Sender domain is</SelectItem>
                    <SelectItem value="subject_contains">Subject contains</SelectItem>
                    <SelectItem value="body_contains">Body contains keyword</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Match value</Label>
                <Input
                  value={draft.match_value}
                  onChange={(e) => setDraft((d) => ({ ...d, match_value: e.target.value }))}
                  placeholder={MATCH_PLACEHOLDER[draft.match_type]}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Assign to customer</Label>
              <Select value={draft.customer_id || "__auto"} onValueChange={(v) => setDraft((d) => ({ ...d, customer_id: v === "__auto" ? null : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto">Auto-match from sender</SelectItem>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name || "Unnamed"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Assign to user</Label>
              <Select value={draft.assignee_id || "__rr"} onValueChange={(v) => setDraft((d) => ({ ...d, assignee_id: v === "__rr" ? null : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__rr">Round-robin (default)</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Task status</Label>
                <Select value={draft.task_status} onValueChange={(v) => setDraft((d) => ({ ...d, task_status: v as TaskStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={draft.task_priority || "Medium"} onValueChange={(v) => setDraft((d) => ({ ...d, task_priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="rule-enabled">Enabled</Label>
              <Switch id="rule-enabled" checked={draft.enabled} onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save rule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
