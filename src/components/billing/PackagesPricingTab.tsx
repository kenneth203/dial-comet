import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { usePackages, type Package } from "@/context/PackagesContext";
import { formatGBP } from "@/lib/currency";

interface Pkg {
  id: string;
  name: string;
  services: string[]; // VA, VR, DT, AI
  features: string[];
  price: number;
  minutes: number;
  overage: number;
  // VA - Virtual Assistant Hours
  packagedHours: number;
  hourlyOverageRate: number;
  // AI - Per AI-Based Pricing
  aiSetupFee: number;
  aiMonthlyFee: number;
  aiCallsAllocated: number;
  // DT - Digital Minute-Based Pricing
  digitalPricePerMinute: number;
}

const serviceOptions = ["VA", "VR", "DT", "AI"];

export function PackagesPricingTab() {
  const { packages: items, addPackage, updatePackage, deletePackage } = usePackages();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    services: [] as string[],
    price: "",
    minutes: "",
    overage: "",
    features: "",
    packagedHours: "",
    hourlyOverageRate: "",
    aiSetupFee: "",
    aiMonthlyFee: "",
    aiCallsAllocated: "",
    digitalPricePerMinute: ""
  });

  const resetForm = () => {
    setForm({
      name: "",
      services: [],
      price: "",
      minutes: "",
      overage: "",
      features: "",
      packagedHours: "",
      hourlyOverageRate: "",
      aiSetupFee: "",
      aiMonthlyFee: "",
      aiCallsAllocated: "",
      digitalPricePerMinute: ""
    });
  };

  const handleAddClick = () => {
    setMode("add");
    setEditingId(null);
    resetForm();
    setOpen(true);
  };

  const handleEditClick = (item: Package) => {
    setMode("edit");
    setEditingId(item.id);
    setForm({
      name: item.name,
      services: item.services,
      price: item.price.toString(),
      minutes: item.minutes.toString(),
      overage: item.overage.toString(),
      features: item.features.join(", "),
      packagedHours: item.packagedHours.toString(),
      hourlyOverageRate: item.hourlyOverageRate.toString(),
      aiSetupFee: item.aiSetupFee.toString(),
      aiMonthlyFee: item.aiMonthlyFee.toString(),
      aiCallsAllocated: item.aiCallsAllocated.toString(),
      digitalPricePerMinute: item.digitalPricePerMinute.toString()
    });
    setOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    if (window.confirm("Are you sure you want to delete this package?")) {
      deletePackage(id);
      toast({
        title: "Package deleted",
        description: "Package has been successfully deleted.",
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Package name is required.",
        variant: "destructive",
      });
      return;
    }

    const packageData = {
      name: form.name.trim(),
      services: form.services,
      price: parseFloat(form.price) || 0,
      minutes: parseInt(form.minutes) || 0,
      overage: parseFloat(form.overage) || 0,
      features: form.features.split(',').map(f => f.trim()).filter(Boolean),
      packagedHours: parseFloat(form.packagedHours) || 0,
      hourlyOverageRate: parseFloat(form.hourlyOverageRate) || 0,
      aiSetupFee: parseFloat(form.aiSetupFee) || 0,
      aiMonthlyFee: parseFloat(form.aiMonthlyFee) || 0,
      aiCallsAllocated: parseInt(form.aiCallsAllocated) || 0,
      digitalPricePerMinute: parseFloat(form.digitalPricePerMinute) || 0
    };

    if (mode === "add") {
      addPackage(packageData);
      toast({
        title: "Package added",
        description: "New package has been successfully added.",
      });
    } else {
      updatePackage(editingId!, packageData);
      toast({
        title: "Package updated",
        description: "Package has been successfully updated.",
      });
    }

    setOpen(false);
    resetForm();
  };

  const toggleService = (service: string) => {
    setForm(prev => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter(s => s !== service)
        : [...prev.services, service]
    }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle>Packages & Pricing</CardTitle>
            <CardDescription>Manage call packages and pricing options for billing</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleAddClick}>
                <Plus className="h-4 w-4 mr-2" /> Add Package
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{mode === "add" ? "Add Package" : "Edit Package"}</DialogTitle>
                  <DialogDescription>
                    {mode === "add" ? "Create a new call package." : "Update package details."}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Package Name</Label>
                    <Input 
                      id="name" 
                      value={form.name} 
                      onChange={(e) => setForm(f => ({ ...f, name: e.target.value.slice(0, 50) }))} 
                      placeholder="Pro, Growth, Starter" 
                      maxLength={50}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Services Included</Label>
                    <div className="flex flex-wrap gap-3">
                      {serviceOptions.map(service => (
                        <div key={service} className="flex items-center space-x-2">
                          <Checkbox 
                            id={service}
                            checked={form.services.includes(service)}
                            onCheckedChange={() => toggleService(service)}
                          />
                          <Label htmlFor={service}>{service}</Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="price">Monthly Price (£)</Label>
                      <Input 
                        id="price" 
                        type="number" 
                        step="0.01"
                        value={form.price} 
                        onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} 
                        placeholder="49.99" 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="minutes">Included Minutes</Label>
                      <Input 
                        id="minutes" 
                        type="number" 
                        value={form.minutes} 
                        onChange={(e) => setForm(f => ({ ...f, minutes: e.target.value }))} 
                        placeholder="200" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="overage">Overage Rate (£/min)</Label>
                      <Input 
                        id="overage" 
                        type="number" 
                        step="0.01"
                        value={form.overage} 
                        onChange={(e) => setForm(f => ({ ...f, overage: e.target.value }))} 
                        placeholder="0.35" 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="digitalPricePerMinute">Digital Price/Min (£)</Label>
                      <Input 
                        id="digitalPricePerMinute" 
                        type="number" 
                        step="0.01"
                        value={form.digitalPricePerMinute} 
                        onChange={(e) => setForm(f => ({ ...f, digitalPricePerMinute: e.target.value }))} 
                        placeholder="0.10" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="packagedHours">VA Packaged Hours</Label>
                      <Input 
                        id="packagedHours" 
                        type="number" 
                        step="0.5"
                        value={form.packagedHours} 
                        onChange={(e) => setForm(f => ({ ...f, packagedHours: e.target.value }))} 
                        placeholder="10" 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="hourlyOverageRate">VA Overage Rate (£/hr)</Label>
                      <Input 
                        id="hourlyOverageRate" 
                        type="number" 
                        step="0.01"
                        value={form.hourlyOverageRate} 
                        onChange={(e) => setForm(f => ({ ...f, hourlyOverageRate: e.target.value }))} 
                        placeholder="25" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="aiSetupFee">AI Setup Fee (£)</Label>
                      <Input 
                        id="aiSetupFee" 
                        type="number" 
                        step="0.01"
                        value={form.aiSetupFee} 
                        onChange={(e) => setForm(f => ({ ...f, aiSetupFee: e.target.value }))} 
                        placeholder="0" 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="aiMonthlyFee">AI Monthly Fee (£)</Label>
                      <Input 
                        id="aiMonthlyFee" 
                        type="number" 
                        step="0.01"
                        value={form.aiMonthlyFee} 
                        onChange={(e) => setForm(f => ({ ...f, aiMonthlyFee: e.target.value }))} 
                        placeholder="0" 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="aiCallsAllocated">AI Calls Allocated</Label>
                      <Input 
                        id="aiCallsAllocated" 
                        type="number" 
                        value={form.aiCallsAllocated} 
                        onChange={(e) => setForm(f => ({ ...f, aiCallsAllocated: e.target.value }))} 
                        placeholder="0" 
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="features">Features (comma-separated)</Label>
                    <Textarea 
                      id="features" 
                      value={form.features} 
                      onChange={(e) => setForm(f => ({ ...f, features: e.target.value }))} 
                      placeholder="Feature 1, Feature 2, Feature 3" 
                      rows={3}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {mode === "add" ? "Add Package" : "Update Package"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto -mx-6 sm:mx-0"><div className="min-w-[560px] px-6 sm:px-0 sm:min-w-0"><div className="rounded-lg border"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Minutes</TableHead>
                  <TableHead>Overage</TableHead>
                  <TableHead>VA Hours</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {item.services.map(service => (
                          <Badge key={service} variant="secondary" className="text-xs">
                            {service}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{formatGBP(item.price)}/mo</TableCell>
                    <TableCell>{item.minutes} mins</TableCell>
                    <TableCell>{formatGBP(item.overage)}/min</TableCell>
                    <TableCell>{item.packagedHours}h</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditClick(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteClick(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div></div></div>
            
            {items.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No packages found. Add your first package above.
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
