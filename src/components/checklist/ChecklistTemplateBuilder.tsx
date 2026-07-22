import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Copy } from "lucide-react";

type Frequency = "once" | "twice" | "three_times" | "hourly" | "two_hourly" | "morning" | "afternoon" | "end_of_shift" | "custom";
type ShiftScope = "all" | "morning" | "afternoon" | "evening" | "weekend" | "custom";
type Priority = "low" | "medium" | "high" | "critical";

interface Template {
  id: string;
  template_name: string;
  description: string | null;
  category: string | null;
  assigned_role: string | null;
  assigned_department: string | null;
  assigned_user_id: string | null;
  frequency_type: Frequency;
  custom_times: string[];
  shift_scope: ShiftScope;
  priority: Priority;
  reminder_offset_minutes: number | null;
  is_active: boolean;
  days_of_week: number[];
  customer_id: string | null;
  is_internal: boolean;
  require_contact_names: boolean;
  min_contact_names: number;
}

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const sameDays = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

const daysPreset = (days: number[]): "every" | "weekdays" | "weekends" | "custom" => {
  if (!days || days.length === 0 || sameDays(days, ALL_DAYS)) return "every";
  if (sameDays(days, WEEKDAYS)) return "weekdays";
  if (sameDays(days, WEEKENDS)) return "weekends";
  return "custom";
};

const emptyForm: Template = {
  id: "",
  template_name: "",
  description: "",
  category: "",
  assigned_role: null,
  assigned_department: null,
  assigned_user_id: null,
  frequency_type: "once",
  custom_times: [],
  shift_scope: "all",
  priority: "medium",
  reminder_offset_minutes: null,
  is_active: true,
  days_of_week: [],
  customer_id: null,
  is_internal: false,
  require_contact_names: false,
  min_contact_names: 3,
};

export default function ChecklistTemplateBuilder() {
  const { user } = useAuth();
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Template>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<Template | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; name: string; role: string | null; department: string | null }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("checklist_templates").select("*").order("template_name");
    setItems((data ?? []) as Template[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    (async () => {
      const { data } = await (supabase as any).rpc("get_active_users_for_admin");
      if (data) {
        const ids = (data as any[]).map((u) => u.id);
        const { data: full } = await supabase
          .from("system_users")
          .select("id,name,role,department")
          .in("id", ids);
        setUsers((full ?? []) as any);
      }
    })();
    (async () => {
      const { data } = await supabase.from("customers").select("id,name").order("name");
      setCustomers((data ?? []) as any);
    })();
  }, []);

  const openCreate = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (t: Template) => {
    setForm({
      ...t,
      custom_times: Array.isArray(t.custom_times) ? t.custom_times : [],
      days_of_week: Array.isArray((t as any).days_of_week) ? (t as any).days_of_week : [],
      customer_id: (t as any).customer_id ?? null,
      is_internal: Boolean((t as any).is_internal),
      require_contact_names: Boolean((t as any).require_contact_names),
      min_contact_names: Number((t as any).min_contact_names ?? 3),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user || !form.template_name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      template_name: form.template_name.trim(),
      description: form.description || null,
      category: form.category || null,
      assigned_role: form.assigned_role || null,
      assigned_department: form.assigned_department || null,
      assigned_user_id: form.assigned_user_id || null,
      frequency_type: form.frequency_type,
      custom_times: form.custom_times,
      shift_scope: form.shift_scope,
      priority: form.priority,
      reminder_offset_minutes: form.reminder_offset_minutes,
      is_active: form.is_active,
      days_of_week: form.days_of_week ?? [],
      customer_id: form.is_internal ? null : (form.customer_id || null),
      is_internal: form.is_internal,
      require_contact_names: form.require_contact_names,
      min_contact_names: Math.max(1, Number(form.min_contact_names) || 3),
    };
    let error: any = null;
    if (form.id) {
      ({ error } = await (supabase as any).from("checklist_templates").update(payload).eq("id", form.id));
    } else {
      payload.created_by = user.id;
      ({ error } = await (supabase as any).from("checklist_templates").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: form.id ? "Template updated" : "Template created" });
    setOpen(false);
    load();
  };

  const toggleActive = async (t: Template) => {
    await (supabase as any).from("checklist_templates").update({ is_active: !t.is_active }).eq("id", t.id);
    load();
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await (supabase as any).from("checklist_templates").delete().eq("id", deleteId);
    setDeleteId(null);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Template deleted" });
    load();
  };

  const duplicate = async () => {
    if (!duplicateTarget || !user) return;
    setDuplicating(true);
    const t = duplicateTarget;
    const payload: any = {
      template_name: `${t.template_name} (Copy)`,
      description: t.description,
      category: t.category,
      assigned_role: t.assigned_role,
      assigned_department: t.assigned_department,
      assigned_user_id: t.assigned_user_id,
      frequency_type: t.frequency_type,
      custom_times: Array.isArray(t.custom_times) ? t.custom_times : [],
      shift_scope: t.shift_scope,
      priority: t.priority,
      reminder_offset_minutes: t.reminder_offset_minutes,
      is_active: t.is_active,
      days_of_week: Array.isArray((t as any).days_of_week) ? (t as any).days_of_week : [],
      customer_id: (t as any).is_internal ? null : ((t as any).customer_id ?? null),
      is_internal: Boolean((t as any).is_internal),
      require_contact_names: Boolean((t as any).require_contact_names),
      min_contact_names: Number((t as any).min_contact_names ?? 3),
      created_by: user.id,
    };
    const { error } = await (supabase as any).from("checklist_templates").insert(payload);
    setDuplicating(false);
    setDuplicateTarget(null);
    if (error) {
      toast({ title: "Duplicate failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Template duplicated" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Create recurring checklist tasks that appear in staff Daily Handover.
        </p>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> New Template</Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No templates yet</TableCell></TableRow>
            ) : items.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="font-medium">{t.template_name}</div>
                  {t.description && <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>}
                </TableCell>
                <TableCell className="capitalize">{t.frequency_type.replace(/_/g, " ")}</TableCell>
                <TableCell className="capitalize">{t.shift_scope}</TableCell>
                <TableCell className="text-xs">
                  {t.assigned_user_id ? users.find((u) => u.id === t.assigned_user_id)?.name ?? "User" : "Everyone"}
                </TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{t.priority}</Badge></TableCell>
                <TableCell>
                  <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(t)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDuplicateTarget(t)} title="Duplicate"><Copy className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(t.id)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit" : "New"} Checklist Template</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Template name</Label>
              <Input value={form.template_name} onChange={(e) => setForm({ ...form, template_name: e.target.value })} placeholder="Check Customer Emails" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Communications" />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v: Priority) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["low", "medium", "high", "critical"] as Priority[]).map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency_type} onValueChange={(v: Frequency) => setForm({ ...form, frequency_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Once per shift</SelectItem>
                    <SelectItem value="twice">Twice per shift</SelectItem>
                    <SelectItem value="three_times">3 times per shift</SelectItem>
                    <SelectItem value="hourly">Every hour</SelectItem>
                    <SelectItem value="two_hourly">Every 2 hours</SelectItem>
                    <SelectItem value="morning">Morning only</SelectItem>
                    <SelectItem value="afternoon">Afternoon only</SelectItem>
                    <SelectItem value="end_of_shift">End of shift only</SelectItem>
                    <SelectItem value="custom">Custom times</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Shift type</Label>
                <Select value={form.shift_scope} onValueChange={(v: ShiftScope) => setForm({ ...form, shift_scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All shifts</SelectItem>
                    <SelectItem value="morning">Morning shift</SelectItem>
                    <SelectItem value="afternoon">Afternoon shift</SelectItem>
                    <SelectItem value="evening">Evening shift</SelectItem>
                    <SelectItem value="weekend">Weekend shift</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.frequency_type === "custom" && (
              <div>
                <Label>Custom times (comma-separated, 24h)</Label>
                <Input
                  value={(form.custom_times ?? []).join(", ")}
                  onChange={(e) => setForm({ ...form, custom_times: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="09:00, 13:00, 17:00"
                />
              </div>
            )}



            <div>
              <Label>Run on these days</Label>
              <div className="mt-2 space-y-2">
                <Select
                  value={daysPreset(form.days_of_week)}
                  onValueChange={(v) => {
                    if (v === "every") setForm({ ...form, days_of_week: [] });
                    else if (v === "weekdays") setForm({ ...form, days_of_week: [...WEEKDAYS] });
                    else if (v === "weekends") setForm({ ...form, days_of_week: [...WEEKENDS] });
                    else setForm({ ...form, days_of_week: form.days_of_week.length ? form.days_of_week : [1] });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="every">Every day</SelectItem>
                    <SelectItem value="weekdays">Weekdays (Mon–Fri)</SelectItem>
                    <SelectItem value="weekends">Weekends (Sat & Sun)</SelectItem>
                    <SelectItem value="custom">Selected days…</SelectItem>
                  </SelectContent>
                </Select>
                {daysPreset(form.days_of_week) === "custom" && (
                  <div className="flex flex-wrap gap-1">
                    {DAYS.map((d) => {
                      const active = form.days_of_week.includes(d.value);
                      return (
                        <Button
                          key={d.value}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          onClick={() => {
                            const next = active
                              ? form.days_of_week.filter((x) => x !== d.value)
                              : [...form.days_of_week, d.value];
                            setForm({ ...form, days_of_week: next });
                          }}
                        >
                          {d.label}
                        </Button>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Tasks will only be auto-created on the selected days. Choose "Every day" to run daily.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label>Internal task</Label>
                <p className="text-xs text-muted-foreground">
                  Mark as an internal/team task (e.g. voicemails). Internal tasks are not linked to a customer.
                </p>
              </div>
              <Switch
                checked={form.is_internal}
                onCheckedChange={(v) => setForm({ ...form, is_internal: v, customer_id: v ? null : form.customer_id })}
              />
            </div>

            <div>
              <Label>Customer</Label>
              <Select
                value={form.customer_id ?? "__none"}
                onValueChange={(v) => setForm({ ...form, customer_id: v === "__none" ? null : v })}
                disabled={form.is_internal}
              >
                <SelectTrigger><SelectValue placeholder="No customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No customer</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {form.is_internal ? "Disabled — this is an internal task." : "Optional — link this checklist task to a specific customer."}
              </p>
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require contact names on completion</Label>
                  <p className="text-xs text-muted-foreground">
                    Operators must enter the names of people they contacted before this task can be marked complete.
                  </p>
                </div>
                <Switch
                  checked={form.require_contact_names}
                  onCheckedChange={(v) => setForm({ ...form, require_contact_names: v })}
                />
              </div>
              {form.require_contact_names && (
                <div>
                  <Label>Minimum names required</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.min_contact_names}
                    onChange={(e) => setForm({ ...form, min_contact_names: Math.max(1, Number(e.target.value) || 1) })}
                    className="max-w-[120px]"
                  />
                </div>
              )}
            </div>





            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Assigned user</Label>
                <Select value={form.assigned_user_id ?? "__none"} onValueChange={(v) => setForm({ ...form, assigned_user_id: v === "__none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Anyone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Anyone</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Reminder (minutes before due)</Label>
                <Input
                  type="number"
                  value={form.reminder_offset_minutes ?? ""}
                  onChange={(e) => setForm({ ...form, reminder_offset_minutes: e.target.value ? Number(e.target.value) : null })}
                  placeholder="No reminder"
                />
              </div>
              <div className="flex items-end gap-2">
                <Switch checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: c })} />
                <Label>Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the template and all its generated tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!duplicateTarget} onOpenChange={(o) => !o && !duplicating && setDuplicateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate template?</AlertDialogTitle>
            <AlertDialogDescription>
              A copy of "{duplicateTarget?.template_name}" will be created with all the same settings. You can edit it afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={duplicating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={duplicate} disabled={duplicating}>
              {duplicating && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Duplicate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
