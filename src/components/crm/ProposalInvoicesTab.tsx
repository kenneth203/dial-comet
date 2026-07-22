import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, RefreshCw, Search, Plus, Eye, Pencil, Mail, Download } from "lucide-react";
import { buildInvoicePdf, uploadInvoicePdf, downloadInvoicePdfBlob, type InvoicePdfData } from "@/lib/invoicePdf";
import { format } from "date-fns";
import { usePackages } from "@/context/PackagesContext";
import { RecurringInvoiceSchedules } from "./RecurringInvoiceSchedules";
import { formatGBP } from "@/lib/currency";

type Invoice = {
  id: string;
  customer_id: string;
  proposal_token_id: string | null;
  invoice_number: string;
  service_type: string;
  package_name: string;
  package_price: number;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  status: string;
  issued_at: string;
  due_at: string;
  client_name: string | null;
  company_name: string | null;
  client_address: string | null;
  notes: string | null;
  line_items?: Array<{ description: string; quantity: number; unit_price: number; amount: number }> | null;
};

type Customer = { id: string; name: string; email: string | null; contact: string | null; address: string | null };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary", sent: "outline", paid: "default", cancelled: "destructive",
};

const SERVICE_TYPES = ["VR", "VA", "CL", "CB", "AI", "DT", "Other"];

type FormState = {
  customer_id: string;
  invoice_number: string;
  service_type: string;
  package_name: string;
  package_price: string;
  vat_rate: string;
  due_at: string;
  client_name: string;
  company_name: string;
  client_address: string;
  notes: string;
  status: string;
};

const emptyForm = (): FormState => ({
  customer_id: "",
  invoice_number: `INV-${Date.now().toString().slice(-8)}`,
  service_type: "VR",
  package_name: "",
  package_price: "0",
  vat_rate: "0.20",
  due_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  client_name: "",
  company_name: "",
  client_address: "",
  notes: "",
  status: "pending",
});

export function ProposalInvoicesTab() {
  const { toast } = useToast();
  const { packages } = usePackages();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [emailingId, setEmailingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [invRes, custRes] = await Promise.all([
      (supabase as any).from("proposal_invoices").select("*").order("issued_at", { ascending: false }),
      supabase.from("customers").select("id,name,email,contact,address").order("name"),
    ]);
    setLoading(false);
    if (invRes.error) {
      toast({ title: "Failed to load invoices", description: invRes.error.message, variant: "destructive" });
    } else setInvoices((invRes.data as Invoice[]) || []);
    if (!custRes.error) setCustomers((custRes.data as any[]) || []);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => invoices.filter((inv) => {
    if (statusFilter !== "all" && inv.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.client_name || "").toLowerCase().includes(q) ||
      (inv.company_name || "").toLowerCase().includes(q) ||
      inv.package_name.toLowerCase().includes(q)
    );
  }), [invoices, search, statusFilter]);

  const totals = useMemo(() => ({
    total: filtered.reduce((a, i) => a + Number(i.total || 0), 0),
    outstanding: filtered.filter(i => i.status === "pending" || i.status === "sent").reduce((a, i) => a + Number(i.total || 0), 0),
    paid: filtered.filter(i => i.status === "paid").reduce((a, i) => a + Number(i.total || 0), 0),
    count: filtered.length,
  }), [filtered]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).from("proposal_invoices").update({ status }).eq("id", id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    toast({ title: "Invoice updated" });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (inv: Invoice) => {
    setEditingId(inv.id);
    setForm({
      customer_id: inv.customer_id,
      invoice_number: inv.invoice_number,
      service_type: inv.service_type,
      package_name: inv.package_name,
      package_price: String(inv.package_price),
      vat_rate: String(inv.vat_rate),
      due_at: inv.due_at.slice(0, 10),
      client_name: inv.client_name || "",
      company_name: inv.company_name || "",
      client_address: inv.client_address || "",
      notes: inv.notes || "",
      status: inv.status,
    });
    setFormOpen(true);
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

  const submitForm = async () => {
    if (!form.customer_id) return toast({ title: "Customer is required", variant: "destructive" });
    if (!form.package_name.trim()) return toast({ title: "Package name is required", variant: "destructive" });
    setSaving(true);
    const subtotal = Number(form.package_price) || 0;
    const vat_rate = Number(form.vat_rate) || 0;
    const vat_amount = subtotal * vat_rate;
    const total = subtotal + vat_amount;
    const payload = {
      customer_id: form.customer_id,
      invoice_number: form.invoice_number,
      service_type: form.service_type,
      package_name: form.package_name,
      package_price: subtotal,
      subtotal,
      vat_rate,
      vat_amount,
      total,
      status: form.status,
      due_at: new Date(form.due_at).toISOString(),
      client_name: form.client_name || null,
      company_name: form.company_name || null,
      client_address: form.client_address || null,
      notes: form.notes || null,
    };
    let error;
    if (editingId) {
      ({ error } = await (supabase as any).from("proposal_invoices").update(payload).eq("id", editingId));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await (supabase as any).from("proposal_invoices").insert({ ...payload, created_by: user?.id }));
    }
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: editingId ? "Invoice updated" : "Invoice created" });
    setFormOpen(false);
    load();
  };

  const invoiceToPdfData = (inv: Invoice): InvoicePdfData => ({
    invoice_number: inv.invoice_number,
    issued_at: inv.issued_at,
    due_at: inv.due_at,
    service_type: inv.service_type,
    package_name: inv.package_name,
    subtotal: Number(inv.subtotal),
    vat_rate: Number(inv.vat_rate),
    vat_amount: Number(inv.vat_amount),
    total: Number(inv.total),
    client_name: inv.client_name,
    company_name: inv.company_name,
    client_address: inv.client_address,
    notes: inv.notes,
    reference: inv.notes || `${inv.service_type} — ${inv.package_name}`,
    line_items: inv.line_items || null,
  });

  const downloadInvoice = async (inv: Invoice) => {
    try {
      const blob = await buildInvoicePdf(invoiceToPdfData(inv));
      downloadInvoicePdfBlob(blob, `${inv.invoice_number}.pdf`);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const emailInvoice = async (inv: Invoice) => {
    const customer = customers.find(c => c.id === inv.customer_id);
    const recipientEmail = customer?.email;
    if (!recipientEmail) return toast({ title: "No email on file for customer", variant: "destructive" });
    setEmailingId(inv.id);
    try {
      const blob = await buildInvoicePdf(invoiceToPdfData(inv));
      const pdfUrl = await uploadInvoicePdf(inv.id, inv.invoice_number, blob);
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "proposal-invoice",
          recipientEmail,
          idempotencyKey: `proposal-invoice-${inv.id}-${Date.now()}`,
          templateData: {
            invoiceNumber: inv.invoice_number,
            clientName: inv.client_name || customer?.contact || "",
            companyName: inv.company_name || customer?.name || "",
            serviceType: inv.service_type,
            packageName: inv.package_name,
            subtotal: Number(inv.subtotal),
            vatAmount: Number(inv.vat_amount),
            total: Number(inv.total),
            issuedAt: inv.issued_at,
            dueAt: inv.due_at,
            notes: inv.notes || "",
            pdfUrl,
          },
        },
      });
      if (error) throw error;
      // persist pdf_url + last_emailed_at so reminder workflow can reuse the PDF link
      await supabase.from("proposal_invoices").update({
        pdf_url: pdfUrl,
        last_emailed_at: new Date().toISOString(),
      }).eq("id", inv.id);
      toast({ title: "Invoice emailed", description: `Sent to ${recipientEmail}` });
      if (inv.status === "pending") updateStatus(inv.id, "sent");
    } catch (e: any) {
      toast({ title: "Email failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setEmailingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle>Invoices</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold">{totals.count}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle>Total Value</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold">{formatGBP(totals.total)}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle>Outstanding</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold text-[hsl(var(--destructive))]">{formatGBP(totals.outstanding)}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle>Paid</CardTitle></CardHeader><CardContent><span className="text-2xl font-bold text-green-600">{formatGBP(totals.paid)}</span></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Proposal Invoices</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> New Invoice</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search invoice, client, company, package..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading..." : "No invoices yet."}
                  </TableCell></TableRow>
                ) : filtered.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell>{format(new Date(inv.issued_at), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{format(new Date(inv.due_at), "dd/MM/yyyy")}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{inv.company_name || inv.client_name || "—"}</div>
                      {inv.company_name && inv.client_name && <div className="text-xs text-muted-foreground">{inv.client_name}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline">{inv.service_type}</Badge></TableCell>
                    <TableCell>{inv.package_name}</TableCell>
                    <TableCell className="text-right font-semibold">{formatGBP(Number(inv.total))}</TableCell>
                    <TableCell>
                      <Select value={inv.status} onValueChange={(v) => updateStatus(inv.id, v)}>
                        <SelectTrigger className="w-32 h-8">
                          <Badge variant={STATUS_VARIANT[inv.status] || "outline"} className="capitalize">{inv.status}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="View" onClick={() => setViewInvoice(inv)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(inv)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Download PDF" onClick={() => downloadInvoice(inv)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Email invoice" disabled={emailingId === inv.id} onClick={() => emailInvoice(inv)}>
                          <Mail className={`h-4 w-4 ${emailingId === inv.id ? "animate-pulse" : ""}`} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RecurringInvoiceSchedules onInvoicesGenerated={load} />

      {/* View dialog */}
      <Dialog open={!!viewInvoice} onOpenChange={(o) => !o && setViewInvoice(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Invoice {viewInvoice?.invoice_number}</DialogTitle></DialogHeader>
          {viewInvoice && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><div className="text-muted-foreground">Issued</div><div className="font-medium">{format(new Date(viewInvoice.issued_at), "dd/MM/yyyy")}</div></div>
                <div><div className="text-muted-foreground">Due</div><div className="font-medium">{format(new Date(viewInvoice.due_at), "dd/MM/yyyy")}</div></div>
                <div><div className="text-muted-foreground">Company</div><div className="font-medium">{viewInvoice.company_name || "—"}</div></div>
                <div><div className="text-muted-foreground">Client</div><div className="font-medium">{viewInvoice.client_name || "—"}</div></div>
                <div className="col-span-2"><div className="text-muted-foreground">Address</div><div className="font-medium whitespace-pre-line">{viewInvoice.client_address || "—"}</div></div>
                <div><div className="text-muted-foreground">Service</div><div className="font-medium">{viewInvoice.service_type}</div></div>
              </div>
              {(() => {
                const items = (viewInvoice.line_items && viewInvoice.line_items.length > 0)
                  ? viewInvoice.line_items
                  : [{ description: `${viewInvoice.package_name}${viewInvoice.service_type ? ` (${viewInvoice.service_type})` : ""}`, quantity: 1, unit_price: Number(viewInvoice.subtotal), amount: Number(viewInvoice.subtotal) }];
                return (
                  <div className="border-t pt-3">
                    <div className="overflow-hidden rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">Description</th>
                            <th className="text-right px-3 py-2 font-medium">Amount</th>
                            <th className="text-right px-3 py-2 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((li, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-2">{li.description}</td>
                              <td className="px-3 py-2 text-right">{formatGBP(Number(li.unit_price))}</td>
                              <td className="px-3 py-2 text-right">{formatGBP(Number(li.amount))}</td>
                            </tr>
                          ))}
                          <tr className="border-t">
                            <td className="px-3 py-2" colSpan={2}>VAT @ {(Number(viewInvoice.vat_rate) * 100).toFixed(0)}%</td>
                            <td className="px-3 py-2 text-right">{formatGBP(Number(viewInvoice.vat_amount))}</td>
                          </tr>
                          <tr className="border-t bg-muted/50 font-semibold">
                            <td className="px-3 py-2" colSpan={2}>Total</td>
                            <td className="px-3 py-2 text-right text-[hsl(var(--primary))]">{formatGBP(Number(viewInvoice.total))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
              {viewInvoice.notes && <div className="border-t pt-3"><div className="text-muted-foreground">Notes</div><div>{viewInvoice.notes}</div></div>}
            </div>
          )}
          <DialogFooter>
            {viewInvoice && <Button variant="outline" onClick={() => { openEdit(viewInvoice); setViewInvoice(null); }}><Pencil className="h-4 w-4 mr-2" />Edit</Button>}
            {viewInvoice && <Button variant="outline" onClick={() => downloadInvoice(viewInvoice)}><Download className="h-4 w-4 mr-2" />Download PDF</Button>}
            {viewInvoice && <Button onClick={() => emailInvoice(viewInvoice)}><Mail className="h-4 w-4 mr-2" />Email</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit Invoice" : "Create Invoice"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
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
              <Label>Invoice Number</Label>
              <Input value={form.invoice_number} onChange={(e) => setForm(f => ({ ...f, invoice_number: e.target.value }))} />
            </div>
            <div>
              <Label>Service Type</Label>
              <Select value={form.service_type} onValueChange={(v) => setForm(f => ({ ...f, service_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Package *</Label>
              <Select
                value={
                  packages.find(p => p.name === form.package_name && p.services.includes(form.service_type))?.id || "__custom__"
                }
                onValueChange={(id) => {
                  if (id === "__custom__") {
                    setForm(f => ({ ...f, package_name: "" }));
                    return;
                  }
                  const pkg = packages.find(p => p.id === id);
                  if (!pkg) return;
                  const price =
                    form.service_type === "AI" ? pkg.aiMonthlyFee :
                    form.service_type === "DT" ? pkg.digitalPricePerMinute :
                    pkg.price;
                  setForm(f => ({ ...f, package_name: pkg.name, package_price: String(price ?? 0) }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select package..." /></SelectTrigger>
                <SelectContent>
                  {packages
                    .filter(p => p.services.includes(form.service_type))
                    .map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {formatGBP((form.service_type === "AI" ? p.aiMonthlyFee : form.service_type === "DT" ? p.digitalPricePerMinute : p.price))}
                      </SelectItem>
                    ))}
                  <SelectItem value="__custom__">Custom / Other…</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="mt-2"
                placeholder="Package name"
                value={form.package_name}
                onChange={(e) => setForm(f => ({ ...f, package_name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Package Price (£)</Label>
              <Input type="number" step="0.01" value={form.package_price} onChange={(e) => setForm(f => ({ ...f, package_price: e.target.value }))} />
            </div>
            <div>
              <Label>VAT Rate</Label>
              <Input type="number" step="0.01" value={form.vat_rate} onChange={(e) => setForm(f => ({ ...f, vat_rate: e.target.value }))} />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.due_at} onChange={(e) => setForm(f => ({ ...f, due_at: e.target.value }))} />
            </div>
            <div>
              <Label>Company Name</Label>
              <Input value={form.company_name} onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))} />
            </div>
            <div>
              <Label>Client Name</Label>
              <Input value={form.client_name} onChange={(e) => setForm(f => ({ ...f, client_name: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Client Address</Label>
              <Textarea rows={2} value={form.client_address} onChange={(e) => setForm(f => ({ ...f, client_address: e.target.value }))} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="col-span-2 bg-muted/40 rounded-md p-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatGBP((Number(form.package_price) || 0))}</span></div>
              <div className="flex justify-between"><span>VAT</span><span>{formatGBP(((Number(form.package_price) || 0) * (Number(form.vat_rate) || 0)))}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span>{formatGBP(((Number(form.package_price) || 0) * (1 + (Number(form.vat_rate) || 0))))}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitForm} disabled={saving}>{saving ? "Saving..." : editingId ? "Save Changes" : "Create Invoice"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
