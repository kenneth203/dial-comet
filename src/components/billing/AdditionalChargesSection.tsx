import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatGBP } from "@/lib/currency";
import {
  useAdditionalCharges,
  type AdditionalCharge,
  type ChargeFrequency,
} from "@/context/AdditionalChargesContext";

interface FormState {
  name: string;
  description: string;
  amount: string;
  frequency: ChargeFrequency;
  secondaryLabel: string;
  secondaryAmount: string;
}

const emptyForm: FormState = {
  name: "",
  description: "",
  amount: "",
  frequency: "monthly",
  secondaryLabel: "",
  secondaryAmount: "",
};

export function AdditionalChargesSection() {
  const { charges, addCharge, updateCharge, deleteCharge } = useAdditionalCharges();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const openAdd = () => {
    setMode("add");
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (c: AdditionalCharge) => {
    setMode("edit");
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description,
      amount: String(c.amount),
      frequency: c.frequency,
      secondaryLabel: c.secondaryLabel ?? "",
      secondaryAmount: c.secondaryAmount != null ? String(c.secondaryAmount) : "",
    });
    setOpen(true);
  };

  const handleDelete = (c: AdditionalCharge) => {
    if (!window.confirm(`Delete charge "${c.name}"?`)) return;
    deleteCharge(c.id);
    toast({ title: "Charge deleted", description: `${c.name} has been removed.` });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      amount: Number(form.amount) || 0,
      frequency: form.frequency,
      secondaryLabel: form.secondaryLabel.trim() || undefined,
      secondaryAmount: form.secondaryAmount ? Number(form.secondaryAmount) : undefined,
    };
    if (mode === "add") {
      addCharge(payload);
      toast({ title: "Charge added", description: `${payload.name} was created.` });
    } else if (editingId) {
      updateCharge(editingId, payload);
      toast({ title: "Charge updated", description: `${payload.name} was updated.` });
    }
    setOpen(false);
    setForm(emptyForm);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <CardTitle>Additional Charges</CardTitle>
          <CardDescription>
            Ad-hoc charges that can be added to a customer invoice.
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" /> Add Charge
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{mode === "add" ? "Add Charge" : "Edit Charge"}</DialogTitle>
                <DialogDescription>
                  Configure an ad-hoc charge that can be applied on invoices.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="ac-name">Name</Label>
                  <Input
                    id="ac-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.slice(0, 80) }))}
                    placeholder="Weekend Services"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ac-desc">Description</Label>
                  <Textarea
                    id="ac-desc"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="What this charge covers"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="ac-amount">Amount (£)</Label>
                    <Input
                      id="ac-amount"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ac-freq">Frequency</Label>
                    <select
                      id="ac-freq"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.frequency}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, frequency: e.target.value as ChargeFrequency }))
                      }
                    >
                      <option value="monthly">Per Month</option>
                      <option value="one-off">One-off</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="ac-sec-label">Secondary Fee Label (optional)</Label>
                    <Input
                      id="ac-sec-label"
                      value={form.secondaryLabel}
                      onChange={(e) => setForm((f) => ({ ...f, secondaryLabel: e.target.value }))}
                      placeholder="Activation Fee"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ac-sec-amount">Secondary Fee Amount (£)</Label>
                    <Input
                      id="ac-sec-amount"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.secondaryAmount}
                      onChange={(e) => setForm((f) => ({ ...f, secondaryAmount: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">{mode === "add" ? "Create" : "Save changes"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="max-w-[420px] text-sm text-muted-foreground">
                    {c.description}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {c.amount > 0 ? (
                        <div className="font-medium">{formatGBP(c.amount)}</div>
                      ) : (
                        <div className="text-muted-foreground italic">Variable</div>
                      )}
                      {c.secondaryLabel && c.secondaryAmount != null && (
                        <div className="text-xs text-muted-foreground">
                          + {c.secondaryLabel}: {formatGBP(c.secondaryAmount)}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {c.frequency === "monthly" ? "Per Month" : "One-off"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" /><span className="hidden sm:inline ml-2">Edit</span>
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(c)}>
                      <Trash2 className="h-4 w-4" /><span className="hidden sm:inline ml-2">Delete</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {charges.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No additional charges configured.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
