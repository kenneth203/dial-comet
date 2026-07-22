import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Phone, UserCog, FileText } from "lucide-react";
import type { Customer } from "@/context/CustomersContext";
import { usePackages } from "@/context/PackagesContext";
import { formatGBP } from "@/lib/currency";

type Props = {
  formData: Partial<Customer>;
  onChange: (field: keyof Customer, value: any) => void;
};

/**
 * Unified Billing — Customer Profile section.
 *
 * Holds the rules that drive monthly internal-invoice generation:
 *   - Call Answering Package (new call_* fields)
 *   - Virtual Assistant Package (existing va_* fields)
 *
 * These values feed `generate_internal_invoice_for_period()` to build
 * one combined internal invoice per customer per period.
 */
export function UnifiedBillingSection({ formData, onChange }: Props) {
  const numberOrZero = (v: string) => (v === "" ? 0 : parseFloat(v) || 0);
  const { packages } = usePackages();
  const callPackages = packages.filter((p) => p.services.includes("VR") || p.services.includes("CL") || p.services.includes("CB"));
  const vaPackages = packages.filter((p) => p.services.includes("VA"));

  // Customer may have the Clinic or Bookings service flag enabled; prefer the matching package on disambiguation
  const services = (formData as any).services as string[] | undefined;
  const prefersClinic = Array.isArray(services) && services.includes("Call Answering Service (Clinic)");
  const prefersBookings = Array.isArray(services) && services.includes("Call Answering Service (Bookings)");

  // Resolve the currently-stored package name to a specific package id, preferring CB → CL → VR
  // when the customer has the corresponding service active (VR/CL/CB share names like "Starter 25").
  const currentCallPackageId = (() => {
    const name = formData.callPackageName;
    if (!name) return "";
    const matches = callPackages.filter((p) => p.name === name);
    if (matches.length === 0) return "";
    if (matches.length === 1) return matches[0].id;
    const preferredCode = prefersBookings ? "CB" : prefersClinic ? "CL" : "VR";
    const preferred = matches.find((p) => p.services.includes(preferredCode));
    return (preferred || matches[0]).id;
  })();

  const applyCallPackage = (id: string) => {
    const pkg = callPackages.find((p) => p.id === id);
    if (!pkg) return;
    onChange("callPackageName", pkg.name);
    onChange("callMonthlyCharge", pkg.price || 0);
    onChange("callBaseAllowance", pkg.minutes || 0);
    onChange("callRatePerCall", pkg.overage || 0);
    // Keep legacy VR fields in sync for proposals/reports
    onChange("vrPackage", pkg.name);
    onChange("vrPrice", pkg.price || 0);
    onChange("vrIncludedMinutes", pkg.minutes || 0);
    onChange("vrOverageRate", pkg.overage || 0);
  };

  const applyVaPackage = (name: string) => {
    const pkg = vaPackages.find((p) => p.name === name);
    onChange("vaPackage", name);
    if (!pkg) return;
    onChange("vaPrice", pkg.price || 0);
    onChange("vaPackagedHours", pkg.packagedHours || 0);
    onChange("vaHourlyOverageRate", pkg.hourlyOverageRate || 0);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
        <p className="text-sm font-medium text-primary">Internal Billing Rules</p>
        <p className="text-xs text-muted-foreground">
          These settings drive the monthly internal invoice the portal generates from uploaded calls and logged VA tasks.
          Xero remains the official accounting system — the portal invoice is for internal revenue tracking only.
        </p>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {/* Call Answering Package */}
        <AccordionItem value="call" className="rounded-md border border-l-4 border-l-primary bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <span className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Phone className="h-4 w-4" /> Call Answering Package
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Package Name</Label>
                  <Select
                    value={currentCallPackageId}
                    onValueChange={applyCallPackage}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a Call Answering package" />
                    </SelectTrigger>
                    <SelectContent>
                      {callPackages.length === 0 ? (
                        <SelectItem value="__none__" disabled>No packages configured</SelectItem>
                      ) : (
                        callPackages.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}{p.services.includes("CL") && !/clinic/i.test(p.name) ? " (Clinic)" : p.services.includes("CB") && !/booking/i.test(p.name) ? " (Bookings)" : ""} — {formatGBP((p.price || 0))}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Selecting a package auto-fills charge, included calls and overage rate.</p>
                </div>
                <div className="space-y-2">
                  <Label>Billing Unit</Label>
                  <Select
                    value={formData.callBillingUnit || "per_call"}
                    onValueChange={(v) => onChange("callBillingUnit", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_call">Per Call</SelectItem>
                      <SelectItem value="per_minute">Per Minute</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Monthly Charge (£)</Label>
                  <Input type="number" min="0" step="0.01"
                    value={formData.callMonthlyCharge || ""}
                    onChange={(e) => onChange("callMonthlyCharge", numberOrZero(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Included Calls</Label>
                  <Input type="number" min="0" step="1"
                    value={formData.callBaseAllowance || ""}
                    onChange={(e) => onChange("callBaseAllowance", numberOrZero(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Included Minutes</Label>
                  <Input type="number" min="0" step="1"
                    value={formData.callIncludedMinutes || ""}
                    onChange={(e) => onChange("callIncludedMinutes", numberOrZero(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Overage Rate Per Call (£)</Label>
                  <Input type="number" min="0" step="0.0001"
                    value={formData.callRatePerCall || ""}
                    onChange={(e) => onChange("callRatePerCall", numberOrZero(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Overage Rate Per Minute (£)</Label>
                  <Input type="number" min="0" step="0.0001"
                    value={formData.callRatePerMinute || ""}
                    onChange={(e) => onChange("callRatePerMinute", numberOrZero(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>SMS Rate (£)</Label>
                  <Input type="number" min="0" step="0.0001"
                    value={formData.callRateSms || ""}
                    onChange={(e) => onChange("callRateSms", numberOrZero(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Transfer Landline (£)</Label>
                  <Input type="number" min="0" step="0.0001"
                    value={formData.callRateTransferLandline || ""}
                    onChange={(e) => onChange("callRateTransferLandline", numberOrZero(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Transfer Mobile (£)</Label>
                  <Input type="number" min="0" step="0.0001"
                    value={formData.callRateTransferMobile || ""}
                    onChange={(e) => onChange("callRateTransferMobile", numberOrZero(e.target.value))} />
                </div>
              </div>

              {/* Direct Dial Number add-on */}
              <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
                <Checkbox
                  id="directDialNumber"
                  checked={!!(formData as any).directDialNumber}
                  onCheckedChange={(checked) => onChange("directDialNumber" as any, checked === true)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="directDialNumber" className="cursor-pointer">
                    Direct Dial Number (+£12.00/month)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When ticked, adds a "Direct Dial Number - Purchasing/Hosting" line at £12.00 to each monthly internal invoice.
                  </p>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Virtual Assistant Package */}
        <AccordionItem value="va" className="rounded-md border border-l-4 border-l-primary bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <span className="flex items-center gap-2 text-base font-semibold text-foreground">
              <UserCog className="h-4 w-4" /> Virtual Assistant Package
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Package Name / Retainer</Label>
                  <Select
                    value={formData.vaPackage || ""}
                    onValueChange={applyVaPackage}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a VA retainer package" />
                    </SelectTrigger>
                    <SelectContent>
                      {vaPackages.length === 0 ? (
                        <SelectItem value="__none__" disabled>No packages configured</SelectItem>
                      ) : (
                        vaPackages.map((p) => (
                          <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Selecting a retainer auto-fills price, included hours and overage rate.</p>
                </div>
                <div className="space-y-2">
                  <Label>Retainer Price (£/mth)</Label>
                  <Input type="number" min="0" step="0.01"
                    value={formData.vaPrice || ""}
                    onChange={(e) => onChange("vaPrice", numberOrZero(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Included Hours</Label>
                  <Input type="number" min="0" step="0.5"
                    value={formData.vaPackagedHours || ""}
                    onChange={(e) => onChange("vaPackagedHours", numberOrZero(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Overage Rate (£/hr)</Label>
                  <Input type="number" min="0" step="0.01"
                    value={formData.vaHourlyOverageRate || ""}
                    onChange={(e) => onChange("vaHourlyOverageRate", numberOrZero(e.target.value))} />
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Digital Typing Service */}
        <AccordionItem value="dt" className="rounded-md border border-l-4 border-l-primary bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <span className="flex items-center gap-2 text-base font-semibold text-foreground">
              <FileText className="h-4 w-4" /> Digital Typing Service
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price per Digital Minute (£)</Label>
                <Input
                  type="number" min="0" step="0.0001"
                  value={formData.dtPricePerMinute || ""}
                  onChange={(e) => onChange("dtPricePerMinute", numberOrZero(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Used to calculate Digital Typing charges on the monthly internal invoice (minutes × rate).
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>



      {/* VAT */}
      <Accordion type="single" collapsible className="space-y-2">
        <AccordionItem value="vat" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-4 hover:no-underline">
            <CardTitle>VAT</CardTitle>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>VAT Rate</Label>
                <Input
                  type="number" min="0" max="1" step="0.01"
                  value={formData.vatRate ?? 0.20}
                  onChange={(e) => onChange("vatRate", numberOrZero(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Applied only when Billing Options above is set to “VAT”. 0.20 = 20%.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

    </div>
  );
}
