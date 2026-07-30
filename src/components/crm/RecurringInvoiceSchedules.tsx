import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Repeat, Plus, Pencil, Trash2, Play, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { usePackages } from "@/context/PackagesContext";
import { formatGBP } from "@/lib/currency";
import { InvoiceLineItemsEditor, extraLineTotal, type ExtraLineItem } from "./InvoiceLineItemsEditor";

type Schedule = {
  id: string;
  customer_id: string;
  service_type: string;
  package_name: string;
  package_price: number;
  vat_rate: number;
  client_name: string | null;
  company_name: string | null;
  client_address: string | null;
  notes: string | null;
  frequency: string;
  day_of_month: number;
  next_run_at: string;
  last_run_at: string | null;
  active: boolean;
  weekend_cover: boolean;
  weekend_cover_fee: number;
  additional_lines: boolean;
  additional_lines_fee: number;
  extra_line_items: ExtraLineItem[] | null;
};

type Customer = { id: string; name: string; email: string | null; contact: string | null; address: string | null };

const SERVICE_TYPES = ["VR", "VA", "CL", "CB", "AI", "DT", "Other"];

type FormState = Omit<Schedule, "id" | "last_run_at" | "next_run_at"> & { next_run_at: string };

const emptyForm = (): FormState => ({
  customer_id: "",
  service_type: "VR",
  package_name: "",
  package_price: 0,
  vat_rate: 0.20,
  client_name: "",
  company_name: "",
  client_address: "",
  notes: "",
  frequency: "monthly",
  day_of_month: 1,
  next_run_at: new Date(new Date().setDate(1)).toISOString().slice(0, 10),
  active: true,
  weekend_cover: false,
  weekend_cover_fee: 99,
  additional_lines: false,
  additional_lines_fee: 49,
  extra_line_items: [],
});

export function RecurringInvoiceSchedules({ onInvoicesGenerated }: { onInvoicesGenerated?: () => void }) {
  const { toast } = useToast();
  const { packages } = usePackages();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [sRes, cRes] = await Promise.all([
      (supabase as any).from("recurring_invoice_schedules").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id,name,email,contact,address").order("name"),
    ]);
    setLoading(false);
    if (sRes.error) toast({ title: "Failed to load schedules", description: sRes.error.message, variant: "destructive" });
    else setSchedules((sRes.data as Schedule[]) || []);
    if (!cRes.error) setCustomers((cRes.data as any[]) || []);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (s: Schedule) => {
    setEditingId(s.id);
    setForm({
      customer_id: s.customer_id,
      service_type: s.service_type,
      package_name: s.package_name,
      package_price: Number(s.package_price),
      vat_rate: Number(s.vat_rate),
      client_name: s.client_name || "",
      company_name: s.company_name || "",
      client_address: s.client_address || "",
      notes: s.notes || "",
      frequency: s.frequency,
      day_of_month: s.day_of_month,
      next_run_at: s.next_run_at.slice(0, 10),
      active: s.active,
      weekend_cover: !!s.weekend_cover,
      weekend_cover_fee: Number(s.weekend_cover_fee) || 0,
      additional_lines: !!s.additional_lines,
      additional_lines_fee: Number(s.additional_lines_fee) || 0,
      extra_line_items: Array.isArray(s.extra_line_items)
        ? s.extra_line_items.map(li => ({
            description: li.description,
            quantity: Number(li.quantity) || 1,
            unit_price: Number(li.unit_price) || 0,
          }))
        : [],
    });
    setOpen(true);
  };

  const onCustomerSelect = (id: string) => {
    const c = customers.find(x => x.id === id);
    setForm(f => ({
      ...f,
      customer_id: id,
      company_name: f.company_name || c?.name || "",
      client_name: f.client_name || c?.contact || "",
      client_address: f.client_address || c?.address || "",
    }));
  };

  const submit = async () => {
    if (!form.customer_id) return toast({ title: "Customer required", variant: "destructive" });
    if (!form.package_name.trim()) return toast({ title: "Package required", variant: "destructive" });
    const extras = (form.extra_line_items || []).filter(li => li.description.trim());
    if ((form.extra_line_items || []).length !== extras.length) {
      return toast({ title: "Additional lines need a description", variant: "destructive" });
    }
    setSaving(true);
    const payload = {
      ...form,
      package_price: Number(form.package_price) || 0,
      vat_rate: Number(form.vat_rate) || 0,
      day_of_month: Number(form.day_of_month) || 1,
      next_run_at: new Date(form.next_run_at).toISOString(),
      client_name: form.client_name || null,
      company_name: form.company_name || null,
      client_address: form.client_address || null,
      notes: form.notes || null,
      weekend_cover: !!form.weekend_cover,
      weekend_cover_fee: form.weekend_cover ? Number(form.weekend_cover_fee) || 0 : 0,
      additional_lines: !!form.additional_lines,
      additional_lines_fee: form.additional_lines ? Number(form.additional_lines_fee) || 0 : 0,
      extra_line_items: extras.map(li => ({
        description: li.description,
        quantity: Number(li.quantity) || 1,
        unit_price: Number(li.unit_price) || 0,
      })),
    };
    let error;
    if (editingId) {
      ({ error } = await (supabase as any).from("recurring_invoice_schedules").update(payload).eq("id", editingId));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await (supabase as any).from("recurring_invoice_schedules").insert({ ...payload, created_by: user?.id }));
    }
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: editingId ? "Schedule updated" : "Schedule created" });
    setOpen(false);
    load();
  };

  const toggleActive = async (s: Schedule) => {
    const { error } = await (supabase as any).from("recurring_invoice_schedules").update({ active: !s.active }).eq("id", s.id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    setSchedules(prev => prev.map(x => x.id === s.id ? { ...x, active: !s.active } : x));
  };

  const remove = async (s: Schedule) => {
    if (!confirm("Delete this recurring schedule?")) return;
    const { error } = await (supabase as any).from("recurring_invoice_schedules").delete().eq("id", s.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    setSchedules(prev => prev.filter(x => x.id !== s.id));
    toast({ title: "Schedule deleted" });
  };

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await (supabase as any).rpc("generate_due_recurring_invoices");
    setRunning(false);
    if (error) return toast({ title: "Run failed", description: error.message, variant: "destructive" });
    const count = Array.isArray(data) ? data.length : 0;
    toast({ title: count > 0 ? `${count} invoice(s) generated` : "No schedules are due right now" });
    load();
    onInvoicesGenerated?.();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <CardTitle className="flex items-center gap-2"><Repeat className="h-5 w-5" /> Recurring Invoice Schedules</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={runNow} disabled={running}>
            <Play className={`h-4 w-4 mr-2 ${running ? "animate-pulse" : ""}`} /> Run due now
          </Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> New Schedule</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Package</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {loading ? "Loading..." : "No recurring schedules yet."}
                </TableCell></TableRow>
              ) : schedules.map(s => {
                const cust = customers.find(c => c.id === s.customer_id);
                const weekendFee = s.weekend_cover ? Number(s.weekend_cover_fee) || 0 : 0;
                const addlFee = s.additional_lines ? Number(s.additional_lines_fee) || 0 : 0;
                const scheduleExtras = Array.isArray(s.extra_line_items) ? s.extra_line_items : [];
                const extrasTotal = extraLineTotal(scheduleExtras as ExtraLineItem[]);
                const subtotal = Number(s.package_price) + weekendFee + addlFee + extrasTotal;
                const total = subtotal * (1 + Number(s.vat_rate));
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.company_name || cust?.name || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{s.service_type}</Badge></TableCell>
                    <TableCell>
                      <div>{s.package_name}</div>
                      {(s.weekend_cover || s.additional_lines || scheduleExtras.length > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {s.weekend_cover && <Badge variant="secondary" className="text-xs">Weekend</Badge>}
                          {s.additional_lines && <Badge variant="secondary" className="text-xs">+Lines</Badge>}
                          {scheduleExtras.length > 0 && <Badge variant="secondary" className="text-xs">+{scheduleExtras.length} extra</Badge>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatGBP(total)}</TableCell>
                    <TableCell>{s.day_of_month}</TableCell>
                    <TableCell>{format(new Date(s.next_run_at), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{s.last_run_at ? format(new Date(s.last_run_at), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell><Switch checked={s.active} onCheckedChange={() => toggleActive(s)} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit Schedule" : "New Recurring Schedule"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Customer *</Label>
              <Select value={form.customer_id} onValueChange={onCustomerSelect}>
                <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service Type</Label>
              <Select value={form.service_type} onValueChange={(v) => setForm(f => ({ ...f, service_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Package *</Label>
              <Select
                value={packages.find(p => p.name === form.package_name && p.services.includes(form.service_type))?.id || "__custom__"}
                onValueChange={(id) => {
                  if (id === "__custom__") { setForm(f => ({ ...f, package_name: "" })); return; }
                  const pkg = packages.find(p => p.id === id);
                  if (!pkg) return;
                  const price = form.service_type === "AI" ? pkg.aiMonthlyFee : form.service_type === "DT" ? pkg.digitalPricePerMinute : pkg.price;
                  setForm(f => ({ ...f, package_name: pkg.name, package_price: price ?? 0 }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select package..." /></SelectTrigger>
                <SelectContent>
                  {packages.filter(p => p.services.includes(form.service_type)).map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatGBP((form.service_type === "AI" ? p.aiMonthlyFee : form.service_type === "DT" ? p.digitalPricePerMinute : p.price))}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">Custom / Other…</SelectItem>
                </SelectContent>
              </Select>
              <Input className="mt-2" placeholder="Package name" value={form.package_name} onChange={(e) => setForm(f => ({ ...f, package_name: e.target.value }))} />
            </div>
            <div>
              <Label>Package Price (£)</Label>
              <Input type="number" step="0.01" value={form.package_price} onChange={(e) => setForm(f => ({ ...f, package_price: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>VAT Rate</Label>
              <Input type="number" step="0.01" value={form.vat_rate} onChange={(e) => setForm(f => ({ ...f, vat_rate: Number(e.target.value) }))} />
            </div>
            <div className="col-span-2 border rounded-md p-3 space-y-3 bg-muted/30">
              <Label className="text-sm font-semibold">Add-ons (added to every recurring invoice)</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Switch checked={form.weekend_cover} onCheckedChange={(v) => setForm(f => ({ ...f, weekend_cover: v }))} />
                <Label className="cursor-pointer" onClick={() => setForm(f => ({ ...f, weekend_cover: !f.weekend_cover }))}>Weekend Cover</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Fee (£)"
                  disabled={!form.weekend_cover}
                  value={form.weekend_cover_fee}
                  onChange={(e) => setForm(f => ({ ...f, weekend_cover_fee: Number(e.target.value) }))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Switch checked={form.additional_lines} onCheckedChange={(v) => setForm(f => ({ ...f, additional_lines: v }))} />
                <Label className="cursor-pointer" onClick={() => setForm(f => ({ ...f, additional_lines: !f.additional_lines }))}>Additional Lines</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Fee (£)"
                  disabled={!form.additional_lines}
                  value={form.additional_lines_fee}
                  onChange={(e) => setForm(f => ({ ...f, additional_lines_fee: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm(f => ({ ...f, frequency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="monthly">Monthly</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>Day of Month (1-28)</Label>
              <Input type="number" min={1} max={28} value={form.day_of_month} onChange={(e) => setForm(f => ({ ...f, day_of_month: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>First Run Date</Label>
              <Input type="date" value={form.next_run_at} onChange={(e) => setForm(f => ({ ...f, next_run_at: e.target.value }))} />
            </div>
            <div>
              <Label>Company Name</Label>
              <Input value={form.company_name || ""} onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))} />
            </div>
            <div>
              <Label>Client Name</Label>
              <Input value={form.client_name || ""} onChange={(e) => setForm(f => ({ ...f, client_name: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Client Address</Label>
              <Textarea rows={2} value={form.client_address || ""} onChange={(e) => setForm(f => ({ ...f, client_address: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <InvoiceLineItemsEditor
                items={(form.extra_line_items as ExtraLineItem[]) || []}
                onChange={(items) => setForm(f => ({ ...f, extra_line_items: items }))}
                title="Extra Lines (added to every generated invoice)"
                description="Recurring extras such as extra hours, postage or expenses."
              />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes || ""} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {(() => {
              const pkg = Number(form.package_price) || 0;
              const weekend = form.weekend_cover ? Number(form.weekend_cover_fee) || 0 : 0;
              const addl = form.additional_lines ? Number(form.additional_lines_fee) || 0 : 0;
              const extrasSum = extraLineTotal((form.extra_line_items as ExtraLineItem[]) || []);
              const sub = pkg + weekend + addl + extrasSum;
              const rate = Number(form.vat_rate) || 0;
              return (
                <div className="col-span-2 bg-muted/40 rounded-md p-3 text-sm">
                  <div className="flex justify-between"><span>Package</span><span>{formatGBP(pkg)}</span></div>
                  {weekend > 0 && <div className="flex justify-between"><span>Weekend cover</span><span>{formatGBP(weekend)}</span></div>}
                  {addl > 0 && <div className="flex justify-between"><span>Additional lines</span><span>{formatGBP(addl)}</span></div>}
                  {extrasSum > 0 && <div className="flex justify-between"><span>Extra lines</span><span>{formatGBP(extrasSum)}</span></div>}
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatGBP(sub)}</span></div>
                  <div className="flex justify-between"><span>VAT</span><span>{formatGBP(sub * rate)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Total per invoice</span><span>{formatGBP(sub * (1 + rate))}</span></div>
                </div>
              );
            })()}
            <div className="col-span-2 flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm(f => ({ ...f, active: v }))} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : editingId ? "Save Changes" : "Create Schedule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
