import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { usePackages, type Package } from "@/context/PackagesContext";
import { AdditionalChargesSection } from "@/components/billing/AdditionalChargesSection";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { Button } from "@/components/ui/button";
import { formatGBP } from "@/lib/currency";

interface Pkg {
  id: string;
  name: string;
  services: string[]; // VA, VR, DT, AI
  features: string[];
  // VR - Per Call Based Pricing
  price: number; // monthly price
  minutes: number; // included minutes
  overage: number; // price per extra minute
  // VA - Hours-based pricing
  packagedHours: number;
  hourlyOverageRate: number;
  // AI - Per AI-Based Pricing
  aiSetupFee: number;
  aiMonthlyFee: number;
  aiCallsAllocated: number;
  // DT - Digital Minute-Based Pricing
  digitalPricePerMinute: number;
}

const serviceOptions = ["VA", "VR", "CL", "CB", "DT", "AI"];

const seedPackages: Pkg[] = [
  { 
    id: "pkg-1", 
    name: "Starter", 
    services: ["VR", "VA"],
    price: 49, 
    minutes: 200, 
    overage: 0.35, 
    features: ["200 included minutes", "Email message delivery", "Business hours coverage"],
    packagedHours: 10,
    hourlyOverageRate: 25,
    aiSetupFee: 50,
    aiMonthlyFee: 29,
    aiCallsAllocated: 100,
    digitalPricePerMinute: 0.15
  },
  { 
    id: "pkg-2", 
    name: "Growth", 
    services: ["VR", "VA", "AI"],
    price: 129, 
    minutes: 600, 
    overage: 0.30, 
    features: ["600 included minutes", "Email & SMS delivery", "Extended hours coverage"],
    packagedHours: 25,
    hourlyOverageRate: 22,
    aiSetupFee: 25,
    aiMonthlyFee: 49,
    aiCallsAllocated: 250,
    digitalPricePerMinute: 0.12
  },
  { 
    id: "pkg-3", 
    name: "Pro", 
    services: ["VR", "VA", "AI", "DT"],
    price: 249, 
    minutes: 1400, 
    overage: 0.25, 
    features: ["1400 included minutes", "Priority routing", "24/7 coverage"],
    packagedHours: 50,
    hourlyOverageRate: 20,
    aiSetupFee: 0,
    aiMonthlyFee: 99,
    aiCallsAllocated: 500,
    digitalPricePerMinute: 0.10
  },
];

export default function Packages() {
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
    featuresText: "",
    packagedHours: "",
    hourlyOverageRate: "",
    aiSetupFee: "",
    aiMonthlyFee: "",
    aiCallsAllocated: "",
    digitalPricePerMinute: "",
  });

  const jsonLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((p, i) => ({
      "@type": "Offer",
      position: i + 1,
      name: `${p.name} Call Package`,
      price: p.price,
      priceCurrency: "GBP",
      description: `${p.minutes} included minutes, ${formatGBP(p.overage)}/min overage`,
    })),
  }), [items]);

  const resetForm = () => setForm({ 
    name: "", 
    services: [],
    price: "", 
    minutes: "", 
    overage: "", 
    featuresText: "",
    packagedHours: "",
    hourlyOverageRate: "",
    aiSetupFee: "",
    aiMonthlyFee: "",
    aiCallsAllocated: "",
    digitalPricePerMinute: "",
  });

  const handleAddClick = () => {
    setMode("add");
    setEditingId(null);
    resetForm();
    setOpen(true);
  };

  const handleEditClick = (p: Pkg) => {
    setMode("edit");
    setEditingId(p.id);
    setForm({
      name: p.name,
      services: p.services,
      price: String(p.price),
      minutes: String(p.minutes),
      overage: String(p.overage),
      featuresText: p.features.join(", "),
      packagedHours: String(p.packagedHours),
      hourlyOverageRate: String(p.hourlyOverageRate),
      aiSetupFee: String(p.aiSetupFee),
      aiMonthlyFee: String(p.aiMonthlyFee),
      aiCallsAllocated: String(p.aiCallsAllocated),
      digitalPricePerMinute: String(p.digitalPricePerMinute),
    });
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    const target = items.find((p) => p.id === id);
    if (!target) return;
    if (!window.confirm(`Delete package "${target.name}"? This cannot be undone.`)) return;
    deletePackage(id);
    toast({ title: "Package deleted", description: `${target.name} has been removed.` });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    const price = Number(form.price) || 0;
    const minutes = Number(form.minutes) || 0;
    const overage = Number(form.overage) || 0;
    const packagedHours = Number(form.packagedHours) || 0;
    const hourlyOverageRate = Number(form.hourlyOverageRate) || 0;
    const aiSetupFee = Number(form.aiSetupFee) || 0;
    const aiMonthlyFee = Number(form.aiMonthlyFee) || 0;
    const aiCallsAllocated = Number(form.aiCallsAllocated) || 0;
    const digitalPricePerMinute = Number(form.digitalPricePerMinute) || 0;
    
    if (!form.name.trim()) {
      toast({ title: "Name is required", description: "Please enter a package name.", variant: "destructive" });
      return;
    }
    
    if (form.services.length === 0) {
      toast({ title: "Service is required", description: "Please select at least one service.", variant: "destructive" });
      return;
    }

    const features = form.featuresText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (mode === "add") {
      const newPackageData = {
        name: form.name.trim(),
        services: form.services,
        price,
        minutes,
        overage,
        features,
        packagedHours,
        hourlyOverageRate,
        aiSetupFee,
        aiMonthlyFee,
        aiCallsAllocated,
        digitalPricePerMinute,
      };
      addPackage(newPackageData);
      toast({ title: "Package added", description: `${newPackageData.name} was created successfully.` });
    } else if (mode === "edit" && editingId) {
      const updatedPackageData = {
        name: form.name.trim(),
        services: form.services,
        price,
        minutes,
        overage,
        features,
        packagedHours,
        hourlyOverageRate,
        aiSetupFee,
        aiMonthlyFee,
        aiCallsAllocated,
        digitalPricePerMinute,
      };
      updatePackage(editingId, updatedPackageData);
      toast({ title: "Package updated", description: `${form.name} was updated.` });
    }

    setOpen(false);
    resetForm();
  };

  const handleServiceToggle = (service: string) => {
    setForm(prev => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter(s => s !== service)
        : [...prev.services, service]
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Manage call packages and pricing options for the answering service." />
        <link rel="canonical" href={window.location.origin + "/config/packages"} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <GradientBackdrop />

      <StandardNavigation currentPage="packages" />

      <main className="container max-w-[2000px] py-3 sm:py-6 px-3 sm:px-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gradient">Packages & Pricing</h1>
            <p className="text-muted-foreground">Manage call packages and pricing options for the answering service</p>
          </div>
        </div>
        <section>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Packages</CardTitle>
                <CardDescription>List of call packages and their pricing</CardDescription>
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleAddClick}>
                    <Plus className="h-4 w-4 mr-2" /> Add Package
                  </Button>
                </DialogTrigger>
                <DialogContent>
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
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.slice(0, 50) }))} 
                          placeholder="Pro, Growth, Starter" 
                          maxLength={50}
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label>Service</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {serviceOptions.map((service) => (
                            <div key={service} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={service}
                                checked={form.services.includes(service)}
                                onChange={() => handleServiceToggle(service)}
                                className="rounded border-gray-300"
                              />
                              <Label htmlFor={service}>{service}</Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Conditional pricing sections based on selected services */}
                      {form.services.includes("VA") && (
                        <div className="grid gap-2">
                          <Label className="text-base font-semibold">Hours-based Pricing</Label>
                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="grid gap-2">
                              <Label htmlFor="packagedHours">Packaged Hours</Label>
                              <Input 
                                id="packagedHours" 
                                type="number" 
                                min={0} 
                                step={1} 
                                value={form.packagedHours} 
                                onChange={(e) => setForm((f) => ({ ...f, packagedHours: e.target.value.slice(0, 2) }))} 
                                maxLength={2}
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="hourlyOverageRate">Hourly Overage Rate (£/hour)</Label>
                              <Input 
                                id="hourlyOverageRate" 
                                type="number" 
                                min={0} 
                                step={0.01} 
                                value={form.hourlyOverageRate} 
                                onChange={(e) => setForm((f) => ({ ...f, hourlyOverageRate: e.target.value }))} 
                                placeholder="X,XXX.XX"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {(form.services.includes("VR") || form.services.includes("CL") || form.services.includes("CB")) && (
                        <div className="grid gap-2">
                          <Label className="text-base font-semibold">Per Call Based Pricing</Label>
                          <div className="grid gap-2 md:grid-cols-3">
                            <div className="grid gap-2">
                              <Label htmlFor="price">Price (GBP £/mth)</Label>
                              <Input 
                                id="price" 
                                type="number" 
                                min={0} 
                                step={0.01} 
                                value={form.price} 
                                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} 
                                placeholder="X,XXX.XX"
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="minutes">Included calls</Label>
                              <Input 
                                id="minutes" 
                                type="number" 
                                min={0} 
                                step={1} 
                                value={form.minutes} 
                                onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value.slice(0, 5) }))} 
                                maxLength={5}
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="overage">Overage (£/call)</Label>
                              <Input 
                                id="overage" 
                                type="number" 
                                min={0} 
                                step={0.01} 
                                value={form.overage} 
                                onChange={(e) => setForm((f) => ({ ...f, overage: e.target.value }))} 
                                placeholder="X,XXX.XX"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {form.services.includes("AI") && (
                        <div className="grid gap-2">
                          <Label className="text-base font-semibold">Per AI-Based Pricing</Label>
                          <div className="grid gap-2 md:grid-cols-3">
                            <div className="grid gap-2">
                              <Label htmlFor="aiSetupFee">Setup Fee (£)</Label>
                              <Input 
                                id="aiSetupFee" 
                                type="number" 
                                min={0} 
                                step={0.01} 
                                value={form.aiSetupFee} 
                                onChange={(e) => setForm((f) => ({ ...f, aiSetupFee: e.target.value }))} 
                                placeholder="X,XXX.XX"
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="aiMonthlyFee">Monthly Fee (£)</Label>
                              <Input 
                                id="aiMonthlyFee" 
                                type="number" 
                                min={0} 
                                step={0.01} 
                                value={form.aiMonthlyFee} 
                                onChange={(e) => setForm((f) => ({ ...f, aiMonthlyFee: e.target.value }))} 
                                placeholder="X,XXX.XX"
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="aiCallsAllocated">Calls Allocated</Label>
                              <Input 
                                id="aiCallsAllocated" 
                                type="number" 
                                min={0} 
                                step={1} 
                                value={form.aiCallsAllocated} 
                                onChange={(e) => setForm((f) => ({ ...f, aiCallsAllocated: e.target.value.slice(0, 8) }))} 
                                maxLength={8}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {form.services.includes("DT") && (
                        <div className="grid gap-2">
                          <Label className="text-base font-semibold">Digital Minute-Based Pricing</Label>
                          <div className="grid gap-2">
                            <Label htmlFor="digitalPricePerMinute">Price (GBP £/digital min)</Label>
                            <Input 
                              id="digitalPricePerMinute" 
                              type="number" 
                              min={0} 
                              step={0.01} 
                              value={form.digitalPricePerMinute} 
                              onChange={(e) => setForm((f) => ({ ...f, digitalPricePerMinute: e.target.value }))} 
                              placeholder="X,XXX.XX"
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid gap-2">
                        <Label htmlFor="features">Features (comma-separated)</Label>
                        <Textarea id="features" value={form.featuresText} onChange={(e) => setForm((f) => ({ ...f, featuresText: e.target.value }))} placeholder="24/7 coverage, Priority routing" />
                      </div>
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
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
                        <TableHead>Services</TableHead>
                        <TableHead>Pricing Details</TableHead>
                        <TableHead>Features</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {items.map((p) => (
                      <TableRow key={p.id} className="border-b last:border-0">
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {p.services.map((service) => (
                              <span key={service} className="inline-block bg-primary/10 text-primary px-2 py-1 rounded text-xs">
                                {service}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm space-y-1">
                            {p.services.includes("VR") && (
                              <div>
                                <div className="font-medium">VR: {formatGBP(p.price)}/mo</div>
                                <div className="text-muted-foreground">{p.minutes} calls, {formatGBP(p.overage)}/call overage</div>
                              </div>
                            )}
                            {p.services.includes("CL") && (
                              <div>
                                <div className="font-medium">CL: {formatGBP(p.price)}/mo</div>
                                <div className="text-muted-foreground">{p.minutes} calls, {formatGBP(p.overage)}/call overage</div>
                              </div>
                            )}
                            {p.services.includes("CB") && (
                              <div>
                                <div className="font-medium">CB: {formatGBP(p.price)}/mo</div>
                                <div className="text-muted-foreground">{p.minutes} calls, {formatGBP(p.overage)}/call overage</div>
                              </div>
                            )}
                            {p.services.includes("VA") && (
                              <div>
                                <div className="font-medium">VA: {p.packagedHours} hours</div>
                                <div className="text-muted-foreground">{formatGBP(p.hourlyOverageRate)}/hr overage</div>
                              </div>
                            )}
                            {p.services.includes("AI") && (
                              <div>
                                <div className="font-medium">AI: Setup {formatGBP(p.aiSetupFee)}, Monthly {formatGBP(p.aiMonthlyFee)}</div>
                                <div className="text-muted-foreground">{p.aiCallsAllocated} calls</div>
                              </div>
                            )}
                            {p.services.includes("DT") && (
                              <div>
                                <div className="font-medium">DT: {formatGBP(p.digitalPricePerMinute)}/digital min</div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <div className="text-muted-foreground text-sm">
                            {p.features.join(", ")}
                          </div>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditClick(p)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(p.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-6">
          <AdditionalChargesSection />
        </section>
      </main>
    </div>
  );
}

