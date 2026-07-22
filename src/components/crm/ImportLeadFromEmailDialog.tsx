import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCustomers } from "@/context/CustomersContext";

interface ParsedFields {
  name?: string;
  companyName?: string;
  email?: string;
  telephone?: string;
  service?: string;
  heardAboutUs?: string;
  message?: string;
  enquiryYear?: string;
  bookingType?: string;
  bookingDate?: string;
  bookingTime?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportLeadFromEmailDialog({ isOpen, onClose }: Props) {
  const { addCustomer } = useCustomers();
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [rawEmail, setRawEmail] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<ParsedFields>({});

  const reset = () => {
    setStep("paste");
    setRawEmail("");
    setFields({});
    setParsing(false);
    setSaving(false);
  };

  const handleClose = () => {
    if (parsing || saving) return;
    reset();
    onClose();
  };

  const handleParse = async () => {
    if (rawEmail.trim().length < 10) {
      toast({ title: "Paste the email first", variant: "destructive" });
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-lead-email", {
        body: { rawEmail },
      });
      if (error) throw error;
      setFields((data?.fields as ParsedFields) || {});
      setStep("review");
    } catch (e: any) {
      toast({
        title: "Could not parse email",
        description: e?.message || "Try again or fill in the fields manually.",
        variant: "destructive",
      });
      setFields({});
      setStep("review");
    } finally {
      setParsing(false);
    }
  };

  const updateField = (key: keyof ParsedFields, value: string) =>
    setFields((f) => ({ ...f, [key]: value }));

  const handleCreate = async () => {
    const name = (fields.companyName?.trim() || fields.name?.trim() || "").slice(0, 200);
    if (!name) {
      toast({ title: "Name or company is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const today = new Date().toLocaleDateString("en-GB");
      const leadPayload: any = {
        name,
        businessType: "",
        addressLine1: "", addressLine2: "", city: "", postcode: "",
        tel: fields.telephone || "", mobile: "", email: fields.email || "", website: "",
        status: "Lead",
        contact: fields.name || "",
        phone: fields.telephone || "",
        callsPerMonth: "",
        billingDay: null,
        billingOptions: "VAT",
        billingStatus: [],
        additionalServices: [],
        callHandlingTier: "",
        services: [],
        virtualAssistantPlan: "",
        callAnsweringPlan: "",
        packages: "",
        vaPackage: "", vaPackagedHours: 0, vaHourlyOverageRate: 0,
        vrPackage: "", vrPrice: 0, vrIncludedMinutes: 0, vrOverageRate: 0,
        aiPackage: "", aiSetupFee: 0, aiMonthlyFee: 0, aiCallsAllocated: 0,
        dtPackage: "", dtPricePerMinute: 0,
        clPackage: "", clPrice: 0, clIncludedMinutes: 0, clOverageRate: 0,
        contacts: [],
        locations: [],
        address: "",
        outcomeHow: "", outcomeWhen: "", outcomeFormat: "",
        messageSelection: "", filters: "",
        systemLink: "", systemIcon: "",
        script: "", scriptTags: [],
        leadMetadata: {
          source: fields.bookingType ? "booking" : "website",
          pipelineStatus: "new",
          value: 0,
          notes: [
            `Imported from forwarded email on ${today}`,
            fields.bookingType ? `\nBooking: ${fields.bookingType}` : "",
            fields.bookingDate ? `Date: ${fields.bookingDate}` : "",
            fields.bookingTime ? `Time: ${fields.bookingTime}` : "",
            `\n--- Original email ---\n${rawEmail}`,
          ].filter(Boolean).join("\n"),
          lastContact: null,
          heardAboutUs: fields.heardAboutUs || "",
          service: fields.service || "",
          message: fields.message || "",
          enquiryYear: fields.enquiryYear || new Date().getFullYear(),
          bookingType: fields.bookingType || "",
          bookingDate: fields.bookingDate || "",
          bookingTime: fields.bookingTime || "",
        },
      };

      await addCustomer(leadPayload);

      toast({ title: "Lead Imported", description: `${name} added to leads.` });
      reset();
      onClose();
    } catch (e: any) {
      toast({
        title: "Could not save lead",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Lead from Email</DialogTitle>
          <DialogDescription>
            {step === "paste"
              ? "Paste the forwarded website enquiry below. AI will extract the lead details."
              : "Review the extracted details, edit anything that's wrong, then save."}
          </DialogDescription>
        </DialogHeader>

        {step === "paste" ? (
          <div className="space-y-3">
            <Textarea
              value={rawEmail}
              onChange={(e) => setRawEmail(e.target.value)}
              placeholder="Paste the full email body here (including 'Contact Us submitted via website' content)..."
              className="min-h-[280px] font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {rawEmail.length.toLocaleString()} / 50,000 characters
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Contact Name</Label>
              <Input value={fields.name || ""} onChange={(e) => updateField("name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Company</Label>
              <Input value={fields.companyName || ""} onChange={(e) => updateField("companyName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={fields.email || ""} onChange={(e) => updateField("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Telephone</Label>
              <Input value={fields.telephone || ""} onChange={(e) => updateField("telephone", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Service</Label>
              <Input value={fields.service || ""} onChange={(e) => updateField("service", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Heard About Us</Label>
              <Input value={fields.heardAboutUs || ""} onChange={(e) => updateField("heardAboutUs", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Enquiry Year</Label>
              <Input value={fields.enquiryYear || ""} onChange={(e) => updateField("enquiryYear", e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">

              <Label>Booking</Label>
              <Input value={fields.bookingType || ""} onChange={(e) => updateField("bookingType", e.target.value)} placeholder="e.g. Online Discovery Call (30 min)" />
            </div>
            <div className="space-y-1">
              <Label>Booking Date</Label>
              <Input value={fields.bookingDate || ""} onChange={(e) => updateField("bookingDate", e.target.value)} placeholder="DD/MM/YYYY" />
            </div>
            <div className="space-y-1">
              <Label>Booking Time</Label>
              <Input value={fields.bookingTime || ""} onChange={(e) => updateField("bookingTime", e.target.value)} placeholder="15:00 – 15:30" />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>Message</Label>
              <Textarea
                value={fields.message || ""}
                onChange={(e) => updateField("message", e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "review" && (
            <Button variant="ghost" onClick={() => setStep("paste")} disabled={saving}>
              Back
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} disabled={parsing || saving}>
            Cancel
          </Button>
          {step === "paste" ? (
            <Button onClick={handleParse} disabled={parsing || rawEmail.trim().length < 10}>
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Parse & Preview
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Lead
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
