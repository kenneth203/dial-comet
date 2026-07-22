import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePackages } from "@/context/PackagesContext";
import { toast } from "@/hooks/use-toast";
import { Eye, Package, FileText, Receipt } from "lucide-react";
import { ProposalPackagesTab } from "./proposal/ProposalPackagesTab";
import { ProposalAgreementTab } from "./proposal/ProposalAgreementTab";
import { ProposalInvoiceTab } from "./proposal/ProposalInvoiceTab";
import { type ProposalInitialData, type ProposalRecord } from "./proposal/proposalTypes";

const heardAboutUsOptions = [
  "Google Search", "Social Media (Facebook)", "Social Media (Instagram)",
  "Social Media (LinkedIn)", "Referral", "BNI Networking", "FSB Networking",
  "Other Networking", "Website", "Email Campaign", "Cold Call",
  "Event/Exhibition", "Word of Mouth", "Other"
];

type ProposalStep = "packages" | "agreement" | "invoice";

interface VAPackageProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: ProposalInitialData;
  onPackageSelected?: (pkg: { name: string; packagedHours: number; hourlyOverageRate: number }, proposal: ProposalRecord) => void;
}

export function VAPackageProposalDialog({ open, onOpenChange, initialData, onPackageSelected }: VAPackageProposalDialogProps) {
  const { packages } = usePackages();
  const vaPackages = packages.filter(pkg => pkg.services.includes("VA"));

  const [currentStep, setCurrentStep] = useState<ProposalStep>("packages");
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [clientAddress, setClientAddress] = useState("");
  const [agreementInitials, setAgreementInitials] = useState("");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    telephone: "",
    companyName: "",
    heardAboutUs: "",
    agreedToTerms: false,
  });

  // Pre-fill from initialData when dialog opens
  useEffect(() => {
    if (open && initialData) {
      setFormData(prev => ({
        ...prev,
        firstName: initialData.firstName || prev.firstName,
        lastName: initialData.lastName || prev.lastName,
        email: initialData.email || prev.email,
        telephone: initialData.telephone || prev.telephone,
        companyName: initialData.companyName || prev.companyName,
        heardAboutUs: initialData.heardAboutUs || prev.heardAboutUs,
      }));
    }
  }, [open, initialData]);

  const selectedPackage = vaPackages.find(p => p.id === selectedPackageId);
  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

  const resetForm = () => {
    setSelectedPackageId(null);
    setShowPreview(false);
    setCurrentStep("packages");
    setClientAddress("");
    setAgreementInitials("");
    setFormData({
      firstName: "", lastName: "", email: "", telephone: "",
      companyName: "", heardAboutUs: "", agreedToTerms: false,
    });
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handlePackageContinue = () => {
    if (!selectedPackageId) return;
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.telephone || !formData.heardAboutUs) {
      toast({ title: "Required Fields", description: "Please complete all required personal information fields before continuing.", variant: "destructive" });
      return;
    }
    if (!formData.agreedToTerms) {
      toast({ title: "Terms Required", description: "Please agree to the Direct Debit terms before continuing.", variant: "destructive" });
      return;
    }
    setCurrentStep("agreement");
  };

  const handleAgreementSigned = (data: { clientAddress: string; firstName: string; lastName: string; initials?: string }) => {
    setClientAddress(data.clientAddress);
    setAgreementInitials(data.initials || "");
    setCurrentStep("invoice");
  };

  const handleFinalSubmit = () => {
    if (selectedPackage && onPackageSelected) {
      const proposalRecord: ProposalRecord = {
        id: crypto.randomUUID(),
        serviceType: "VA",
        packageName: selectedPackage.name,
        packagePrice: selectedPackage.price,
        invoiceNumber,
        clientName: `${formData.firstName} ${formData.lastName}`,
        companyName: formData.companyName,
        clientAddress,
        signedAt: new Date().toISOString(),
        agreementInitials,
        status: "signed",
      };
      onPackageSelected({
        name: selectedPackage.name,
        packagedHours: selectedPackage.packagedHours,
        hourlyOverageRate: selectedPackage.hourlyOverageRate,
      }, proposalRecord);
    }
    toast({
      title: "Proposal Submitted",
      description: `${formData.firstName} ${formData.lastName} selected the "${selectedPackage?.name}" package. Proposal, agreement and invoice have been sent.`,
    });
    onOpenChange(false);
    resetForm();
  };

  const stepIndex = currentStep === "packages" ? 0 : currentStep === "agreement" ? 1 : 2;

  const renderStepIndicator = () => (
    <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2 pb-4 border-b mb-4">
      {[
        { key: "packages" as ProposalStep, label: "Select Package", icon: Package },
        { key: "agreement" as ProposalStep, label: "Agreement", icon: FileText },
        { key: "invoice" as ProposalStep, label: "Invoice", icon: Receipt },
      ].map((step, idx) => {
        const isActive = currentStep === step.key;
        const isCompleted = idx < stepIndex;
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex items-center gap-2">
            {idx > 0 && <div className={`w-8 h-0.5 ${isCompleted || isActive ? "bg-primary" : "bg-muted"}`} />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              isActive ? "bg-primary text-primary-foreground" :
              isCompleted ? "bg-primary/10 text-primary" :
              "bg-muted text-muted-foreground"
            }`}>
              <Icon className="h-3.5 w-3.5" />
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderPackagesWithForm = () => (
    <div className="space-y-6">
      <ProposalPackagesTab
        vaPackages={vaPackages}
        selectedPackageId={selectedPackageId}
        onSelectPackage={setSelectedPackageId}
        onContinue={() => {}}
      />

      <div className="border-t pt-6 space-y-5">
        <div className="text-center">
          <h3 className="text-lg font-bold text-foreground">Service Agreement</h3>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-center text-sm text-muted-foreground">
          Payment will be taken by Direct Debit after the initial payment has been made.
          Why not setup your <span className="font-semibold text-destructive">Direct Debit Mandate</span> now,
          to save time later which could lead to delay in starting of the service(s).
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Authorization</h4>
          <div className="bg-muted/30 rounded-lg p-4 space-y-3 text-sm text-muted-foreground">
            <p>I hereby authorize The VA Team Limited to debit my account for further payments based on the agreement I have signed.*</p>
            <div className="flex items-start space-x-2">
              <Checkbox
                id="terms"
                checked={formData.agreedToTerms}
                onCheckedChange={(checked) => {
                  setFormData(f => ({ ...f, agreedToTerms: checked === true }));
                  if (checked === true) {
                    window.open("https://pay.gocardless.com/BRT0002C5R4WMAG", "_blank", "noopener,noreferrer");
                  }
                }}
              />
              <Label htmlFor="terms" className="text-sm leading-tight cursor-pointer">
                I hereby confirm and agree to the statement that payment will be taken by Direct debit in advance monthly.
              </Label>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Personal Information</h4>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First Name *</Label>
                <Input id="firstName" value={formData.firstName} onChange={(e) => setFormData(f => ({ ...f, firstName: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input id="lastName" value={formData.lastName} onChange={(e) => setFormData(f => ({ ...f, lastName: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="proposalEmail">Email Address *</Label>
                <Input id="proposalEmail" type="email" value={formData.email} onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telephone">Telephone *</Label>
                <Input id="telephone" value={formData.telephone} onChange={(e) => setFormData(f => ({ ...f, telephone: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company Name</Label>
                <Input id="companyName" value={formData.companyName} onChange={(e) => setFormData(f => ({ ...f, companyName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="heardAboutUs">How did you hear about us? *</Label>
                <Select value={formData.heardAboutUs} onValueChange={(v) => setFormData(f => ({ ...f, heardAboutUs: v }))} required>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {heardAboutUsOptions.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedPackageId && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-center">
                Selected package: <span className="font-semibold text-primary">{selectedPackage?.name}</span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handlePackageContinue} disabled={!selectedPackageId}>
                Continue to Agreement →
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case "packages":
        return renderPackagesWithForm();
      case "agreement":
        if (!selectedPackage) return null;
        return (
          <ProposalAgreementTab
            selectedPackage={selectedPackage}
            clientName={`${formData.firstName} ${formData.lastName}`}
            companyName={formData.companyName}
            onBack={() => setCurrentStep("packages")}
            onSign={(data) => handleAgreementSigned(data)}
          />
        );
      case "invoice":
        if (!selectedPackage) return null;
        return (
          <ProposalInvoiceTab
            selectedPackage={selectedPackage}
            clientName={`${formData.firstName} ${formData.lastName}`}
            companyName={formData.companyName}
            clientAddress={clientAddress}
            invoiceNumber={invoiceNumber}
            onBack={() => setCurrentStep("agreement")}
            onSubmit={handleFinalSubmit}
          />
        );
    }
  };

  return (
    <>
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" /> Proposal Preview — Customer View
            </DialogTitle>
          </DialogHeader>
          {renderStepIndicator()}
          {renderCurrentStep()}
        </DialogContent>
      </Dialog>

      <Dialog open={open && !showPreview} onOpenChange={handleClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
              <DialogTitle>VA Services Proposal Builder</DialogTitle>
              <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
                <Eye className="h-4 w-4 mr-2" /> Preview as Customer
              </Button>
            </div>
          </DialogHeader>
          {renderStepIndicator()}
          {renderCurrentStep()}
        </DialogContent>
      </Dialog>
    </>
  );
}
