import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Check, Star, ArrowRight, Shield, Clock, Phone, Users, Zap, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { formatGBP } from "@/lib/currency";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const SERVICE_CONFIG: Record<string, { label: string; icon: typeof Phone; description: string; unitLabel: string }> = {
  VA: { label: "Virtual Assistant", icon: Users, description: "Professional virtual assistant services tailored to your business needs. Delegate admin, scheduling, and operational tasks to our expert team.", unitLabel: "hours" },
  VR: { label: "Call Answering", icon: Phone, description: "Never miss a call again. Our UK-based team answers your calls professionally, takes messages, and manages your diary.", unitLabel: "calls" },
  CL: { label: "Call Answering (Clinic)", icon: Phone, description: "Specialist call answering for clinics and healthcare practices. Appointment booking, patient enquiries, and professional message handling.", unitLabel: "calls" },
  CB: { label: "Call Answering (Bookings)", icon: Phone, description: "Specialist call answering with diary and bookings management. Live booking taking, appointment scheduling, and professional message handling.", unitLabel: "calls" },
  AI: { label: "AI Call Handling", icon: Zap, description: "Intelligent AI-powered call handling that works 24/7. Perfect for after-hours support and overflow management.", unitLabel: "calls" },
  DT: { label: "Digital Typing", icon: FileText, description: "Fast, accurate digital transcription and typing services. From audio files to polished documents.", unitLabel: "per minute" },
};

interface PackageData {
  name: string;
  price: number;
  hours?: number;
  calls?: number;
  minutes?: number;
  vatPrice?: number;
  additionalRate?: number;
  packagedHours?: number;
  hourlyOverageRate?: number;
  aiSetupFee?: number;
  aiMonthlyFee?: number;
  aiCallsAllocated?: number;
  digitalPricePerMinute?: number;
  overage?: number;
  features?: string[];
}

interface ProposalData {
  id: string;
  service_type: string;
  packages_snapshot: PackageData[];
  customer_snapshot: { name?: string; contactName?: string; email?: string; companyName?: string; telephone?: string };
  status: string;
  selected_package?: PackageData;
  completed_at?: string;
}

type Step = "packages" | "details" | "agreement" | "invoice" | "submitted";

export default function Proposal() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PackageData | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>("packages");
  const [submitting, setSubmitting] = useState(false);
  const [invoiceSent, setInvoiceSent] = useState<{ emailed: boolean; recipientEmail?: string }>({ emailed: false });
  const [weekendCoverByPkg, setWeekendCoverByPkg] = useState<Record<string, boolean>>({});
  const [additionalLinesByPkg, setAdditionalLinesByPkg] = useState<Record<string, boolean>>({});
  const WEEKEND_COVER_FEE = 99;
  const ADDITIONAL_LINES_FEE = 20;
  const detailsRef = useRef<HTMLDivElement>(null);
  const agreementRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", telephone: "", companyName: "",
    address: "", heardAbout: "",
  });

  const HEARD_ABOUT_OPTIONS = [
    "Business and Industry Today",
    "Business Magnet",
    "Business Partner Programs",
    "Easthampstead Works",
    "Facebook/Twitter/Instagram/LinkedIn",
    "FSB Networking",
    "GittGo Networking",
    "Google/Bing/Yahoo",
    "LinkedIn Advert",
    "Networking Lead",
    "BNI Networking Lead",
    "OMNI Networking",
    "Other Networking",
    "People Per Hour",
    "Referrals by Client",
    "Referred by Supplier",
    "UKAVA",
  ];
  const [agreementData, setAgreementData] = useState({
    clientAddress: "", initials: "", detailsConfirmed: false, agreedToTerms: false, agreedToDD: false,
  });

  useEffect(() => {
    if (!token) return;
    fetchProposal();
  }, [token]);

  const fetchProposal = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-proposal?token=${token}`, {
        headers: { "apikey": SUPABASE_ANON_KEY },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load proposal");
      }
      const data = await res.json();
      setProposal(data);
      // Pre-fill form from customer snapshot
      const cs = data.customer_snapshot || {};
      // Prefer the primary contact's name over the company name for first/last name
      const contactFullName = (cs.contactName || "").trim();
      const fallbackName = (cs.name || "").trim();
      const nameSource = contactFullName || fallbackName;
      const nameParts = nameSource.split(/\s+/);
      setFormData({
        firstName: nameParts[0] || "", lastName: nameParts.slice(1).join(" ") || "",
        email: cs.email || "", telephone: cs.telephone || "", companyName: cs.companyName || cs.name || "",
        address: cs.address || "", heardAbout: "",
      });
      if (data.status === "completed") {
        setSelectedPackage(data.selected_package);
        setCurrentStep("submitted");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPackage = (pkg: PackageData) => {
    setSelectedPackage(pkg);
    setCurrentStep("details");
    setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const isWeekendOn = (pkg: PackageData) => !!weekendCoverByPkg[pkg.name];
  const toggleWeekend = (pkg: PackageData, val: boolean) => {
    setWeekendCoverByPkg(prev => ({ ...prev, [pkg.name]: val }));
  };
  const isAdditionalLinesOn = (pkg: PackageData) => !!additionalLinesByPkg[pkg.name];
  const toggleAdditionalLines = (pkg: PackageData, val: boolean) => {
    setAdditionalLinesByPkg(prev => ({ ...prev, [pkg.name]: val }));
  };
  const addonsTotal = (pkg: PackageData | null) => {
    if (!pkg) return 0;
    return (isWeekendOn(pkg) ? WEEKEND_COVER_FEE : 0) + (isAdditionalLinesOn(pkg) ? ADDITIONAL_LINES_FEE : 0);
  };

  const handleContinueToAgreement = () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({ title: "Required Fields", description: "Please fill in your name and email.", variant: "destructive" });
      return;
    }
    if (!formData.address.trim()) {
      toast({ title: "Address Required", description: "Please enter your full address.", variant: "destructive" });
      return;
    }
    if (!formData.heardAbout) {
      toast({ title: "Required", description: "Please let us know how you heard about us.", variant: "destructive" });
      return;
    }
    // Pre-fill agreement address from the details step
    setAgreementData(p => ({ ...p, clientAddress: p.clientAddress || formData.address }));
    setCurrentStep("agreement");
    setTimeout(() => agreementRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleSubmit = async () => {
    if (!agreementData.detailsConfirmed || !agreementData.agreedToTerms) {
      toast({ title: "Agreement Required", description: "Please confirm the details and agree to terms.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({
          token,
          selectedPackage,
          formData,
          agreementData,
          addons: (proposal?.service_type === "VR" || proposal?.service_type === "CL" || proposal?.service_type === "CB") ? {
            weekendCover: selectedPackage ? isWeekendOn(selectedPackage) : false,
            weekendCoverFee: WEEKEND_COVER_FEE,
            additionalLines: selectedPackage ? isAdditionalLinesOn(selectedPackage) : false,
            additionalLinesFee: ADDITIONAL_LINES_FEE,
          } : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit");
      }
      const result = await res.json().catch(() => ({}));
      setInvoiceSent({ emailed: !!result.invoiceEmailed, recipientEmail: result.recipientEmail || formData.email });
      setCurrentStep("submitted");
      toast({ title: "Proposal Submitted!", description: "Thank you. We'll be in touch shortly." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
          <p className="text-slate-600">Loading your proposal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <Shield className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Unable to Load Proposal</h2>
            <p className="text-slate-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!proposal) return null;

  const config = SERVICE_CONFIG[proposal.service_type] || SERVICE_CONFIG.VR;
  const addonsAllowed = proposal.service_type === "VR" || proposal.service_type === "CL" || proposal.service_type === "CB";
  const ServiceIcon = config.icon;
  const packages = proposal.packages_snapshot || [];
  const today = format(new Date(), "dd/MM/yyyy");
  const customerName = proposal.customer_snapshot?.contactName || proposal.customer_snapshot?.name || `${formData.firstName} ${formData.lastName}`.trim() || "there";

  const getPackageUnit = (pkg: PackageData) => {
    switch (proposal.service_type) {
      case "VA": return `${pkg.hours || pkg.packagedHours || 0} hours`;
      case "VR": return `${pkg.calls || pkg.minutes || 0} calls`;
      case "AI": return `${pkg.aiCallsAllocated || pkg.calls || 0} calls`;
      case "DT": return `${formatGBP(pkg.digitalPricePerMinute || pkg.price || 0)}/min`;
      default: return "";
    }
  };

  const getPackagePrice = (pkg: PackageData) => {
    switch (proposal.service_type) {
      case "AI": return pkg.aiMonthlyFee || pkg.price || 0;
      default: return pkg.price || 0;
    }
  };

  const getOverageText = (pkg: PackageData) => {
    switch (proposal.service_type) {
      case "VA": return `${formatGBP(pkg.additionalRate || pkg.hourlyOverageRate || 0)}/hr overage`;
      case "VR": return `${formatGBP(pkg.additionalRate || pkg.overage || 0)}/extra call`;
      case "AI": return pkg.aiSetupFee ? `${formatGBP(pkg.aiSetupFee)} setup fee` : "No setup fee";
      case "DT": return "Per-minute billing";
      default: return "";
    }
  };

  if (currentStep === "submitted") {
    return (
      <div className="min-h-screen bg-white">
        <Toaster />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-6">
          <img src="/va-team-logo.png" alt="The VA Team" className="h-20 mx-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: "#dcfce7" }}>
            <Check className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold" style={{ color: "#1c477a" }}>Thank You!</h1>
          <p className="text-lg text-slate-600">
            Your proposal has been submitted successfully. Our team will be in touch shortly to get you started.
          </p>
          {selectedPackage && (
            <Card className="text-left border-slate-200">
              <CardContent className="pt-6 space-y-2">
                <p className="font-semibold" style={{ color: "#1c477a" }}>Selected Package: {selectedPackage.name}</p>
                <p className="text-slate-600">Service: {config.label}</p>
                <p className="text-slate-600">Price: {formatGBP(getPackagePrice(selectedPackage))}/month</p>
              </CardContent>
            </Card>
          )}

          {/* Invoice sent — highlighted callout */}
          <div
            className="text-left rounded-lg border-2 p-5 space-y-2"
            style={{ borderColor: "#b73235", backgroundColor: "#fff5f5" }}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "#b73235" }}
              >
                <Check className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-lg font-bold" style={{ color: "#b73235" }}>
                Your invoice has been sent
              </h2>
            </div>
            <p className="text-slate-700">
              We've emailed your invoice
              {invoiceSent.recipientEmail ? <> to <strong>{invoiceSent.recipientEmail}</strong></> : null}
              {" "}for payment. Please check your inbox (and spam folder, just in case).
            </p>
            <p className="text-slate-700 font-medium">
              Once payment is received, your onboarding process will begin.
            </p>
          </div>
          <p className="text-xs text-slate-300 mt-12">Making the Virtually Impossible, Possible... Virtually!</p>
        </div>
      </div>
    );
  }

  const brandNavy = "#1c477a";
  const brandRed = "#b73235";

  return (
    <div className="min-h-screen bg-white">
      <Toaster />

      {/* Progress Tabs */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src="/va-team-logo.png" alt="The VA Team" className="h-8" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <div className="flex items-center gap-1 text-sm font-medium">
            {[
              { key: "packages", label: "Proposal" },
              { key: "details", label: "Contract" },
              { key: "agreement", label: "Invoice" },
            ].map((step, i) => {
              const steps = ["packages", "details", "agreement"];
              const currentIdx = steps.indexOf(currentStep);
              const isActive = currentStep === step.key;
              const isDone = currentIdx > i;
              return (
                <div key={step.key} className="flex items-center">
                  <div className={`px-3 sm:px-6 py-2 border-b-2 transition-all text-xs sm:text-sm ${
                    isActive ? "border-[#b73235] text-[#b73235] font-semibold" :
                    isDone ? "border-green-500 text-green-600" :
                    "border-transparent text-slate-400"
                  }`}>
                    {step.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pt-16">
        {/* Branded Hero */}
        <section className="bg-white py-6 sm:py-12 px-4 border-b">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <img src="/va-team-logo.png" alt="The VA Team" className="h-24 mx-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div className="space-y-1">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400 font-medium">UK-Based Virtual Assistant and Call Answering Services</p>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-bold" style={{ color: brandNavy }}>
                Our {config.label}{" "}
                <span style={{ color: brandRed }}>Services</span>
              </h1>
            </div>
            <div className="space-y-1">
              <h2 className="text-xl md:text-2xl font-light text-slate-600">
                Hello <span className="font-semibold" style={{ color: brandNavy }}>{customerName.split(" ")[0]}</span>
              </h2>
              <p className="text-base text-slate-500">
                Please find below as discussed your {config.label} proposal
              </p>
            </div>
          </div>
        </section>

        {/* Our Packages heading */}
        <section className="max-w-6xl mx-auto px-4 pt-10 pb-4">
          <h2 className="text-2xl font-bold text-center" style={{ color: brandNavy }}>
            Our <span style={{ color: brandRed }}>Packages</span>
          </h2>
        </section>

        {/* Packages Grid */}
        <section className="max-w-6xl mx-auto px-4 pb-16">
          <div className={`grid gap-6 ${packages.length <= 3 ? `grid-cols-1 md:grid-cols-${packages.length}` : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
            {packages.map((pkg, idx) => {
              const isPopular = idx === Math.floor(packages.length / 2);
              const isSelected = selectedPackage?.name === pkg.name;
              return (
                <Card key={pkg.name} className={`relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border ${
                  isSelected ? "ring-2 shadow-xl" : ""
                } ${isPopular ? "border-2" : "border-slate-200"}`}
                style={{
                  ...(isSelected ? { borderColor: brandRed, boxShadow: `0 0 0 2px ${brandRed}` } : {}),
                  ...(isPopular && !isSelected ? { borderColor: brandRed } : {}),
                }}>
                  {isPopular && (
                    <div className="absolute top-0 left-0 right-0 text-white text-center py-1.5 text-xs font-semibold tracking-wide uppercase" style={{ backgroundColor: brandRed }}>
                      <Star className="h-3 w-3 inline mr-1" /> Most Popular
                    </div>
                  )}
                  <CardContent className={`pt-${isPopular ? "12" : "8"} pb-6 space-y-5 text-center`}>
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: brandRed }}>{pkg.name}</h3>
                      {getPackageUnit(pkg) && <p className="text-sm text-slate-500 mt-1">{getPackageUnit(pkg)} included</p>}
                    </div>

                    {/* Features */}
                    <div className="space-y-2 text-sm text-slate-600 text-left mx-auto max-w-xs">
                      {getPackageUnit(pkg) && (
                        <div className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0" style={{ color: brandRed }} /> {getPackageUnit(pkg)}</div>
                      )}
                      {getOverageText(pkg) && (
                        <div className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0" style={{ color: brandRed }} /> {getOverageText(pkg)}</div>
                      )}
                      <div className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0" style={{ color: brandRed }} /> UK-based professional team</div>
                      <div className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0" style={{ color: brandRed }} /> Mon–Fri 08:00–18:00</div>
                      {(pkg.features || []).map((f, i) => (
                        <div key={i} className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0" style={{ color: brandRed }} /> {f}</div>
                      ))}
                    </div>

                    {/* Optional add-ons (Call Answering services only) */}
                    {addonsAllowed && (
                    <div className="mx-auto max-w-xs text-left space-y-2">
                      <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer rounded-md border border-slate-200 p-2 hover:bg-slate-50">
                        <Checkbox
                          checked={isWeekendOn(pkg)}
                          onCheckedChange={(v) => toggleWeekend(pkg, v === true)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">Add Weekend Cover</span>
                          <span className="block text-xs text-slate-500">Sat &amp; Sun 09:00–13:00 — +{formatGBP(WEEKEND_COVER_FEE)}/month</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer rounded-md border border-slate-200 p-2 hover:bg-slate-50">
                        <Checkbox
                          checked={isAdditionalLinesOn(pkg)}
                          onCheckedChange={(v) => toggleAdditionalLines(pkg, v === true)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">Additional Lines</span>
                          <span className="block text-xs text-slate-500">Additional lines for existing customer — +{formatGBP(ADDITIONAL_LINES_FEE)}/month</span>
                        </span>
                      </label>
                    </div>
                    )}

                    {/* Price */}
                    <div className="pt-2">
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl font-extrabold" style={{ color: brandNavy }}>{formatGBP((getPackagePrice(pkg) + addonsTotal(pkg)))}</span>
                      </div>
                      {(isWeekendOn(pkg) || isAdditionalLinesOn(pkg)) ? (
                        <p className="text-xs text-slate-500 mt-1">
                          Includes
                          {isWeekendOn(pkg) ? ` +${formatGBP(WEEKEND_COVER_FEE)} weekend cover` : ""}
                          {isWeekendOn(pkg) && isAdditionalLinesOn(pkg) ? " and" : ""}
                          {isAdditionalLinesOn(pkg) ? ` +${formatGBP(ADDITIONAL_LINES_FEE)} additional lines` : ""}
                        </p>
                      ) : pkg.vatPrice ? (
                        <p className="text-xs text-slate-400 mt-1">{formatGBP(pkg.vatPrice)} inc. VAT</p>
                      ) : null}
                    </div>

                    <Button
                      variant="outline"
                      className={`w-full border-2 font-semibold ${isSelected ? "text-white" : ""}`}
                      style={{
                        borderColor: brandRed,
                        ...(isSelected ? { backgroundColor: brandRed, color: "white" } : { color: brandRed }),
                      }}
                      onClick={() => handleSelectPackage(pkg)}
                    >
                      {isSelected ? <><Check className="h-4 w-4 mr-2" /> Selected</> : "Select"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Details Form */}
        {(currentStep === "details" || currentStep === "agreement") && selectedPackage && (
          <section ref={detailsRef} className="max-w-2xl mx-auto px-4 mb-12">
            <Card className="border-slate-200">
              <CardContent className="pt-8 space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold" style={{ color: brandNavy }}>Your Details</h2>
                  <p className="text-slate-500">Please confirm your information below</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>First Name *</Label>
                    <Input value={formData.firstName} onChange={(e) => setFormData(p => ({ ...p, firstName: e.target.value }))} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last Name *</Label>
                    <Input value={formData.lastName} onChange={(e) => setFormData(p => ({ ...p, lastName: e.target.value }))} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email *</Label>
                    <Input type="email" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={formData.telephone} onChange={(e) => setFormData(p => ({ ...p, telephone: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Company Name</Label>
                    <Input value={formData.companyName} onChange={(e) => setFormData(p => ({ ...p, companyName: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Address *</Label>
                    <Textarea
                      value={formData.address}
                      onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))}
                      placeholder="Please enter your full address"
                      rows={3}
                      required
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>How did you hear about us? *</Label>
                    <select
                      value={formData.heardAbout}
                      onChange={(e) => setFormData(p => ({ ...p, heardAbout: e.target.value }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      required
                    >
                      <option value="">Select an option…</option>
                      {HEARD_ABOUT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Direct Debit */}
                <div className="p-4 rounded-lg border space-y-3" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
                  <h3 className="font-semibold flex items-center gap-2" style={{ color: brandNavy }}>
                    <Shield className="h-5 w-5" /> Direct Debit Authorisation
                  </h3>
                  <p className="text-sm text-slate-700">
                    To set up your service, please authorise a Direct Debit via GoCardless. This ensures seamless monthly billing.
                  </p>
                  <div className="flex items-center gap-3">
                    <Checkbox id="dd-auth" checked={agreementData.agreedToDD} onCheckedChange={(c) => {
                      setAgreementData(p => ({ ...p, agreedToDD: c === true }));
                      if (c === true) window.open("https://pay.gocardless.com/BRT0002C5R4WMAG", "_blank");
                    }} />
                    <Label htmlFor="dd-auth" className="text-sm cursor-pointer text-slate-700">
                      I authorise Direct Debit payments via GoCardless
                    </Label>
                  </div>
                </div>

                <Button
                  className="w-full text-white font-semibold"
                  style={{ backgroundColor: brandRed }}
                  onClick={handleContinueToAgreement}
                >
                  Continue to Agreement <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Agreement */}
        {currentStep === "agreement" && selectedPackage && (
          <section ref={agreementRef} className="max-w-3xl mx-auto px-4 mb-12">
            <Card className="border-slate-200">
              <CardContent className="pt-8 space-y-6">
                <div className="text-center space-y-2">
                  <img src="/va-team-logo.png" alt="The VA Team" className="h-12 mx-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <h2 className="text-2xl font-bold" style={{ color: brandNavy }}>Service Agreement</h2>
                </div>

                {/* Contract summary */}
                <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Date:</span><span className="font-medium">{today}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Client:</span><span className="font-medium">{formData.firstName} {formData.lastName}</span></div>
                  {formData.companyName && <div className="flex justify-between"><span className="text-slate-500">Company:</span><span className="font-medium">{formData.companyName}</span></div>}
                  <div className="flex justify-between"><span className="text-slate-500">Service:</span><span className="font-medium">{selectedPackage.name} ({config.label})</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Package:</span><span className="font-medium">{formatGBP(getPackagePrice(selectedPackage))}</span></div>
                  {isWeekendOn(selectedPackage) && (
                    <div className="flex justify-between"><span className="text-slate-500">Weekend Cover:</span><span className="font-medium">{formatGBP(WEEKEND_COVER_FEE)}</span></div>
                  )}
                  {isAdditionalLinesOn(selectedPackage) && (
                    <div className="flex justify-between"><span className="text-slate-500">Additional Lines:</span><span className="font-medium">{formatGBP(ADDITIONAL_LINES_FEE)}</span></div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-slate-200"><span className="text-slate-500">Monthly Total:</span><span className="font-bold text-lg">{formatGBP((getPackagePrice(selectedPackage) + addonsTotal(selectedPackage)))}</span></div>
                </div>

                <Separator />

                <p className="text-sm leading-relaxed text-slate-700">
                  By signing this Agreement, {formData.companyName || `${formData.firstName} ${formData.lastName}`} ("Client") has retained The VA Team Limited ("Service Provider") to proceed with the requested services within the agreed proposal, and agrees to the terms and conditions as set forth within this agreement.
                </p>

                {/* Address & initials */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Client's Full Address *</Label>
                    <Textarea value={agreementData.clientAddress} onChange={(e) => setAgreementData(p => ({ ...p, clientAddress: e.target.value }))} placeholder="Please enter your FULL address" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Initials</Label>
                    <Input value={agreementData.initials} onChange={(e) => setAgreementData(p => ({ ...p, initials: e.target.value }))} className="w-32" />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox id="confirm-details" checked={agreementData.detailsConfirmed} onCheckedChange={(c) => setAgreementData(p => ({ ...p, detailsConfirmed: c === true }))} />
                  <Label htmlFor="confirm-details" className="text-sm cursor-pointer">I confirm the above details are correct.</Label>
                </div>

                <Separator />

                {/* T&Cs */}
                <details className="text-sm text-slate-600">
                  <summary className="cursor-pointer font-semibold mb-2" style={{ color: brandNavy }}>Terms &amp; Conditions of the Service (click to expand)</summary>
                  <div className="space-y-4 pl-3 border-l-2 border-slate-200 mt-2">
                    <p className="italic">Important notice: We do not require a signed agreement. Your use of any services or resources provided by us, including this website, denotes your complete agreement with and acceptance of these terms and conditions.</p>

                    <div>
                      <p className="font-semibold" style={{ color: brandNavy }}>INTRODUCTION TO THESE TERMS OF SERVICES</p>
                      <p className="mt-1">The VA Team Limited is a service that helps businesses delegate administration, typing, call answering, and other services. By registering for The VA Team Limited service, you confirm that the services you will request from The VA Team Limited will be integral to your business and that you are acting for purposes of your trade, business or profession.</p>
                      <p className="mt-2">Please read these terms and conditions (the "Terms") and The VA Team Limited's Privacy Policy carefully before you agree to receive services from The VA Team Limited. You are referred to as the "Client" in these Terms.</p>
                      <p className="mt-2">These Terms are applicable from the date on which the agreement is made between the parties, as set out in the completed proposal. We will start work when you accept our Proposal and Contract Agreement. You can accept these terms by signature, or by asking us to start work in writing.</p>
                    </div>

                    <div>
                      <p className="font-semibold" style={{ color: brandNavy }}>1. SERVICES</p>
                      <ul className="list-disc pl-5 space-y-1 mt-1">
                        <li>The services to be provided are set out in the proposal. They can be amended by mutual agreement by email or by issuing a revised proposal.</li>
                        <li>The fee is set out in the proposal. Unless otherwise specified, office out-of-pocket expenses (including stationery, telephone charges for phone-based work, postage, USBs, DVDs, CDs, paper, and consumables) will be charged as an additional charge.</li>
                        <li>Quality Standards that are unique to the project are set out in the proposal.</li>
                        <li>Unless otherwise specified in the proposal, the work is entirely undertaken at our premises. When asked to travel to other premises, travel time and travel expenses will also be separately chargeable.</li>
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold" style={{ color: brandNavy }}>2. BASIS OF AGREEMENT</p>
                      <ul className="list-disc pl-5 space-y-1 mt-1">
                        <li>Our Services are provided on a 'business-to-business' basis. If you are using us for something personal (that is, as a consumer rather than related to your business), please let us know by email without delay. Any special cancellation rights you may have as a consumer will not override your obligation to pay for work that we have done in accordance with a proposal.</li>
                        <li>Authority: The person named in the proposal will be our main contact and has the authority to agree to payments and direct what work to do.</li>
                        <li>The Primary provider of Services will be identified in the proposal.</li>
                        <li>Associates: To provide continuity of cover or the appropriate skills mix for your support, we may suggest using associates. We contract with our associates to provide appropriate levels of security and confidentiality in line with our service to you. You will have the right to accept or reject associates before they are used. Where our associates need access to your system, we will ask you to provide individual access codes so you can track and secure their use.</li>
                        <li>Time-based proposals only: If you want us to share time records with you, this must be specified in the proposal so that we can make sure we keep them and send them as required. Time-based proposals are charged in 3-minute slots, so a two-minute call may incur a 3-minute charge if this is a unique call during the day.</li>
                        <li>Insurance: The level of liability insurance we carry is set out in the proposal. If you wish us to take out additional insurance, we are happy to do so if you agree to pay the additional cost. Normally, this is an annual cost, and it may not be possible to refund the charge if you do not use us for the exact year that our insurance runs. Upon request, we will show you our current certificates of cover and policy terms so you can take a copy.</li>
                        <li>We will not order any goods or services on your behalf unless that is authorised by the person identified as having the authority to do so.</li>
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold" style={{ color: brandNavy }}>3. TIMING AND STANDARD OF PROVISION OF SERVICES</p>
                      <ul className="list-disc pl-5 space-y-1 mt-1">
                        <li>We will use our reasonable endeavours to deliver the Services in accordance with the timetable set out in the proposal. We will notify you in advance if we expect that deadlines may not be met.</li>
                        <li>Proofreading and sign off: While we do everything we can to ensure the accuracy of the work we do for you, the final sign-off rests with you, and it is your responsibility to check the work before it goes out.</li>
                        <li>Timetables: Our ability to meet timetables depends on your giving us timely access to all the information or resources we need from you.</li>
                        <li>Availability: Our normal working hours are Monday through Friday, 08h00am to 19h00pm, and Saturday, 09h00 – 17h00, and/or set out in the proposal. Availability outside these hours cannot be guaranteed without prior agreement, and work outside those hours will be subject to additional work surcharges. Unless otherwise specified in the proposal, this additional work surcharge will be 150% of the hourly rate for time-based proposals, or the equivalent for fixed-fee work. We are not available on Bank and Public Holidays unless expressly agreed. Our office(s) close between Christmas (25th Dec) and the New Year (2nd Jan) period each year.</li>
                        <li>We have some software and equipment that we use at no additional charge to you. But where we need license fees, or usage fees in order to provide support for you, we will charge you the cost of any licenses you have authorised us to purchase. We will normally provide all software and equipment needed to perform the Services. We will set out in the proposal (or proposal amendments) what they are and whether they are chargeable to you.</li>
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold" style={{ color: brandNavy }}>4. PAYMENTS, DEDUCTIONS AND HOLIDAYS</p>
                      <ul className="list-disc pl-5 space-y-1 mt-1">
                        <li>Fees are chargeable in accordance with the proposal. Additional expenses are charged as described in the proposal.</li>
                        <li>Normal working hours and availability are set out in the proposal. For work outside these hours, an additional rate may be applied as set out in the proposal or under clause 3 – Availability above.</li>
                        <li>For urgent work given at less than 24 hours' notice, an urgent work rate may be charged at the rate set out in the new request for this urgent work.</li>
                        <li>Out-of-hours and urgent work rates may both be charged for the same work if it is both urgent and out of normal hours.</li>
                        <li>For proposals for a fixed fee retainer or project, additional work outside the scope of the original proposal will be charged at our normal hourly rate unless stated otherwise in the proposal.</li>
                        <li>Unless otherwise specified in the Proposal, no time remaining of retainer or project hours can be carried forward to the following month. Those hours must be used within the 4-week period from the date of purchase.</li>
                        <li>Deposits are due for payment before work commences. Non-payment of the deposit may delay the start of the work, even if you have accepted the terms and asked us to start. Payments mean when cleared funds appear in our bank account. (if applicable)</li>
                        <li>Payment is due as set out in the proposal, or, if not specified there, within 7 calendar days of the invoice date. If you do not pay by the due date, we may reschedule further work until payment is made. Additional charges may be levied for PayPal or credit card payments – see proposal.</li>
                        <li>We reserve the right to charge interest on overdue amounts at the rate set out in the proposal, or where the proposal does not specify, at the rate of 2.22% per month (equivalent to the unauthorised overdraft rate from the bank). Subsequent payments will be applied first to interest and finance charges, then to outstanding fees/costs.</li>
                        <li>Upon payment of our fees and charges, we will assign to you any agreed intellectual property rights as set out in the proposal.</li>
                        <li>This is a business-to-business arrangement where no worker's rights to statutory holiday apply between you and us. Our workers' holiday is our responsibility.</li>
                        <li>We shall keep records of our workers' leave for inspection by HMRC or any other enforcing body.</li>
                        <li>We shall deduct and pay over to HMRC any tax and national insurance that may be required under any tax obligation imposed on us. If you are involved in a dispute with HMRC over who should pay such tax, we will provide the relevant receipts and paperwork to help you reduce or resist the demand.</li>
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold" style={{ color: brandNavy }}>5. OWNERSHIP OF WORK / COPYRIGHT ASSIGNMENT</p>
                      <ul className="list-disc pl-5 space-y-1 mt-1">
                        <li>The Rights in work done under this Agreement will be ours. Upon payment of our fees and charges, we will assign to you the Rights in any work created under the proposal. We agree to sign any further documents needed to complete the transfer of Rights to you.</li>
                        <li>Information and documents which we provide to you always remain our absolute property unless and until assigned to you.</li>
                        <li>You promise not to breach any third-party copyright rights in sending us material to work on. You promise not to use any confidential or restricted information belonging to someone else when sending us work.</li>
                        <li>We will keep full records of the work we have done for you and the contacts we have made on your behalf. We will send you copies of these records regularly or log them into our systems.</li>
                        <li>We will not access, use, copy, distribute, publish or adapt any part of any information, data or documents that you have paid for, for our own or any other person's benefit or purposes.</li>
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold" style={{ color: brandNavy }}>6. POLICIES AND PROCEDURES</p>
                      <ul className="list-disc pl-5 space-y-1 mt-1">
                        <li>Resolving problems: If anything about your project is not going as you want, or if you have any questions or complaints, speak to us straight away.</li>
                        <li>Health and Safety: When working at our own premises, we are responsible for our own health and safety.</li>
                        <li>Working at your premises: We may, from time to time, work at your premises and be covered by your Health and Safety policy.</li>
                        <li>We will work to the standard of your social media Rules and Data Protection Policy, or to ours – whichever is the highest standard. Any specific requirements must be specified in the proposal.</li>
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold" style={{ color: brandNavy }}>7. INFORMATION AND DATA (with GDPR compliance)</p>
                      <ul className="list-disc pl-5 space-y-1 mt-1">
                        <li><strong>7.1 Confidentiality and Purpose Limitation</strong> — We shall only process personal data provided by you to the extent necessary to perform the services outlined in the Proposal. All data received will be used strictly and solely to carry out the services requested by you.</li>
                        <li><strong>7.2 No Unauthorised Use or Downloading</strong> — We confirm that we will not download, store, copy, transmit, or use client or customer data for any purpose other than the delivery of the agreed services. We will not use such data for any commercial, analytical, or marketing purpose, nor share it with third parties unless required by law or agreed in writing.</li>
                        <li><strong>7.3 Secure Processing and Transmission</strong> — All data will be accessed and processed in secure environments. Where remote access is required, we will follow appropriate encryption and password protection protocols. Temporary backups may be made only to ensure continuity of service and will be deleted once no longer required.</li>
                        <li><strong>7.4 Sub-processors and Associates</strong> — Equivalent confidentiality and protection obligations shall contractually bind any associate or team member accessing your data. Access will be provided only where essential and shall, where applicable, be traceable using individual login credentials.</li>
                        <li><strong>7.5 Your Responsibilities</strong> — You must ensure that any data you provide to us has been collected and shared lawfully, and that appropriate consent or legal basis exists. You are responsible for advising us in writing of any specific data handling requirements, security protocols, or retention policies.</li>
                        <li><strong>7.6 Data Subject Rights and Compliance</strong> — We will assist, where possible and upon request, with fulfilling your obligations to respond to data subject requests (including access, correction, or deletion requests) as required by applicable data protection law.</li>
                        <li><strong>7.7 Data Retention</strong> — We will retain personal data only for as long as is necessary to fulfil the services and in accordance with our contractual obligations. Upon completion or termination of services, data will be securely deleted unless otherwise agreed.</li>
                        <li><strong>7.8 International Transfers</strong> — Where applicable, we will ensure that any processing or transfer of data outside the UK or EEA is carried out in compliance with the relevant safeguards under the UK GDPR (e.g., Standard Contractual Clauses or adequacy decisions).</li>
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold" style={{ color: brandNavy }}>8. RESTRICTION AND LIMITATION</p>
                      <ul className="list-disc pl-5 space-y-1 mt-1">
                        <li>Whilst working with us, you may work alongside our associates and employees who support us. They are all subject to contractual terms that prohibit them from working directly for our clients for a period after they work for you. If you genuinely want one of our team members to work directly for you, we will consider releasing them from their contractual obligations for a suitable fee that covers the all-in cost of locating, recruiting, and training a substitute, as well as our loss of profit during this period.</li>
                        <li>Force majeure: We will not be liable for failure to provide services where it is not reasonably practicable to do so due to circumstances beyond our control.</li>
                        <li>Limitation of liability: Our fee rates are determined based on the limits of liability set out in these Terms. Before contracting for work to be done, you may request that we agree to a higher limit of liability (provided insurance cover can be obtained therefor), in which case our fee rates may be adjusted, or an additional charge may be made.</li>
                        <li>There shall be no personal liability of any of our principals, directors, partners, employees, agents or sub-contractors arising in any way out of the performance or non-performance of services or relating to the supply of products.</li>
                        <li>We shall have no liability for any indirect or consequential losses or expenses suffered by you, however caused, including but not limited to loss of anticipated profits, goodwill, reputation, business receipts or contracts, or losses or expenses or if the incorrect information has been provided to us to complete a task.</li>
                        <li>Our aggregate financial liability to you shall in no circumstances exceed the fees paid for the services that give rise to such liability.</li>
                        <li>Nothing in these Terms shall be interpreted as excluding or restricting any legal liability on us or others where liability cannot legally be excluded or restricted.</li>
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold" style={{ color: brandNavy }}>9. TERMINATION</p>
                      <ul className="list-disc pl-5 space-y-1 mt-1">
                        <li>Either party may terminate an Agreement by giving 30 days' written notice. Notice shall be given by email to the address used on the most recent proposal unless a new email address has been notified by either party.</li>
                        <li>Termination of this agreement shall not affect rights and obligations already accrued prior to termination.</li>
                        <li>If either party is involved in illegal or unethical practice, the contract will be terminated without notice.</li>
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold" style={{ color: brandNavy }}>10. DEFINITIONS AND LAW</p>
                      <p className="mt-1">In these Terms, the following words or phrases have the meaning set out in this clause.</p>
                      <ul className="list-disc pl-5 space-y-1 mt-1">
                        <li><strong>"Proposal"</strong> — an agreement that we will supply Services on specified occasions and/or with a specified outcome as set out in a proposal or in a formal proposal.</li>
                        <li><strong>"Clause"</strong> — a stated clause of this Agreement.</li>
                        <li><strong>"Confidential Information"</strong> — includes all information: that we discover because of or through our connection with you; and which is about or relating to you or your business (including financial information, products, services, service levels, customer satisfaction, proposed services and products, pricing, and margins) or your people (including your directors or partners, investors, staff, suppliers, customers, clients, prospects and contractors). However, "Confidential Information" does not include information that is openly published by you, or information that is publicly available without breach of our confidentiality obligation.</li>
                        <li><strong>"Including"</strong> — the word "including" shall not imply any limitation on the generality of the concept or thing of which examples are being given.</li>
                        <li><strong>"Project Agreement"</strong> — the agreement comprised in a proposal and these Terms.</li>
                        <li><strong>"Rights"</strong> — includes intellectual property rights including (but not limited to) copyrights, patents, registered designs, design rights, trademarks, service marks, and the right to apply for or register any such protection, and all rights relating to trade secrets and other unpublished information.</li>
                        <li><strong>"Services"</strong> — the work to be supplied or the outcomes to be achieved by us, as set out in a proposal.</li>
                        <li><strong>"You"</strong> — refers to the person, firm or organisation for whom Services will be performed by us.</li>
                        <li><strong>"We" and "us"</strong> — refers to the person, firm or organisation agreeing to provide Services.</li>
                      </ul>
                      <p className="mt-2">No waiver: If we or you delay or fail to enforce any term of a proposal or these Terms on any occasion, that will not affect or limit our or your ability to enforce that term on any other occasion or at any time.</p>
                      <p className="mt-1">Severability: If any provision of a proposal or these Terms is unenforceable, it shall be struck from the Project Agreement to the minimum extent necessary to make the Project Agreement enforceable and this shall not affect the enforceability of the other provisions of the Project Agreement.</p>
                      <p className="mt-1">Law and jurisdiction: All Project Agreements are governed by English law and subject to the exclusive jurisdiction of the English courts.</p>
                    </div>
                  </div>
                </details>

                <div className="flex items-center gap-2">
                  <Checkbox id="agree-terms" checked={agreementData.agreedToTerms} onCheckedChange={(c) => setAgreementData(p => ({ ...p, agreedToTerms: c === true }))} />
                  <Label htmlFor="agree-terms" className="text-sm cursor-pointer">I agree to the terms and conditions of this contract.</Label>
                </div>

                {/* Invoice Preview */}
                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold flex items-center gap-2" style={{ color: brandNavy }}>
                    <FileText className="h-4 w-4" /> Invoice Preview
                  </h3>
                  {(() => {
                    const base = getPackagePrice(selectedPackage);
                    const wkOn = addonsAllowed && isWeekendOn(selectedPackage);
                    const alOn = addonsAllowed && isAdditionalLinesOn(selectedPackage);
                    const subtotal = base + (wkOn ? WEEKEND_COVER_FEE : 0) + (alOn ? ADDITIONAL_LINES_FEE : 0);
                    return (
                      <div className="border rounded overflow-hidden text-sm">
                        <div className="grid grid-cols-3 p-2 font-medium text-white" style={{ backgroundColor: brandNavy }}><span>Description</span><span>Amount</span><span>Total</span></div>
                        <div className="grid grid-cols-3 p-2 border-t">
                          <span>{selectedPackage.name} ({config.label})</span>
                          <span>{formatGBP(base)}</span>
                          <span>{formatGBP(base)}</span>
                        </div>
                        {wkOn && (
                          <div className="grid grid-cols-3 p-2 border-t">
                            <span>Weekend Cover</span>
                            <span>{formatGBP(WEEKEND_COVER_FEE)}</span>
                            <span>{formatGBP(WEEKEND_COVER_FEE)}</span>
                          </div>
                        )}
                        {alOn && (
                          <div className="grid grid-cols-3 p-2 border-t">
                            <span>Additional Lines</span>
                            <span>{formatGBP(ADDITIONAL_LINES_FEE)}</span>
                            <span>{formatGBP(ADDITIONAL_LINES_FEE)}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-3 p-2 border-t bg-slate-50">
                          <span>VAT @ 20%</span><span></span><span>{formatGBP((subtotal * 0.2))}</span>
                        </div>
                        <div className="grid grid-cols-3 p-2 border-t font-bold bg-slate-100">
                          <span>Total</span><span></span><span>{formatGBP((subtotal * 1.2))}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <Button
                  className="w-full text-white text-lg py-6 font-semibold"
                  style={{ backgroundColor: brandRed }}
                  onClick={handleSubmit}
                  disabled={submitting || !agreementData.detailsConfirmed || !agreementData.agreedToTerms}
                >
                  {submitting ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Submitting...</> : <>Submit Proposal & Sign Agreement <Check className="h-5 w-5 ml-2" /></>}
                </Button>

                <p className="text-xs text-center text-slate-400">
                  By submitting, you agree to the terms above. Dated {today}.
                </p>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Footer */}
        <footer className="py-8 text-center border-t bg-slate-50">
          <img src="/va-team-logo.png" alt="The VA Team" className="h-8 mx-auto mb-3 opacity-40" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <p className="text-sm text-slate-400">© {new Date().getFullYear()} The VA Team Limited. All rights reserved.</p>
          <p className="text-xs text-slate-300 mt-1">Making the Virtually Impossible, Possible... Virtually!</p>
        </footer>
      </div>
    </div>
  );
}
