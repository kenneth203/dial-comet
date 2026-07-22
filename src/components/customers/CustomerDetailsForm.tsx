import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScriptPreview } from "@/components/customers/ScriptPreview";
import { ScriptImportDialog } from "@/components/customers/ScriptImportDialog";
import { ScriptImportHistory } from "@/components/customers/ScriptImportHistory";
import { CalendarIcon, Plus, Trash2, Edit, Phone, Mail, Send, FileText as FileTextIcon, Loader2, ExternalLink, Clock, Check, Copy, Link, RotateCcw, Wand2, AlertTriangle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Customer, CustomerContact, useCustomers } from "@/context/CustomersContext";
import { usePackages, type Package } from "@/context/PackagesContext";
import { supabase } from "@/integrations/supabase/client";
import { MultiLocationManager } from "./MultiLocationManager";
import { CustomerFormsTab } from "./CustomerFormsTab";
import { UnifiedBillingSection } from "./UnifiedBillingSection";
import { VAPackageProposalDialog } from "@/components/crm/VAPackageProposalDialog";
import { VRPackageProposalDialog } from "@/components/crm/VRPackageProposalDialog";
import { AIPackageProposalDialog } from "@/components/crm/AIPackageProposalDialog";
import { DTPackageProposalDialog } from "@/components/crm/DTPackageProposalDialog";
import { CLPackageProposalDialog } from "@/components/crm/CLPackageProposalDialog";
import { CBPackageProposalDialog } from "@/components/crm/CBPackageProposalDialog";
import { type ProposalInitialData, type ProposalRecord } from "@/components/crm/proposal/proposalTypes";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { normaliseUkPostcode, ukPostcodeError } from "@/lib/ukPostcode";
import {
  clearCustomerScriptDraft,
  formatCustomerScriptDraftTime,
  loadCustomerScriptDraft,
  saveCustomerScriptDraft,
  scriptDraftDiffers,
  type CustomerScriptDraft,
} from "@/lib/customerScriptDrafts";

type ProposalStatusEntry = {
  token: string;
  status: string;
  createdAt: string;
  selectedPackage?: { name?: string } | null;
};

type TabKey = 'details' | 'billing' | 'contacts' | 'location' | 'systems' | 'script' | 'forms';

interface CustomerDetailsFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (customer: Omit<Customer, 'id'>) => void | boolean | Promise<void | boolean | unknown> | unknown;
  initialData?: Customer;
  title: string;
  visibleTabs?: TabKey[];
  defaultStatus?: Customer['status'];
}

const billingStatuses = ["Active", "Pending", "Suspended", "Inactive"];

const services = [
  "Virtual Assistant Service",
  "Call Answering Service", 
  "Call Answering Service (Clinic)",
  "Call Answering Service (Bookings)",
  "AI Call Handling Service",
  "Digital Typing Service"
];

const virtualAssistantPlans = [
  { name: "Launch Pad 5 (VA)", hours: 5, price: 140, vatPrice: 168, additionalRate: 28 },
  { name: "Boost 10 (VA)", hours: 10, price: 270, vatPrice: 324, additionalRate: 27 },
  { name: "Expand 15 (VA)", hours: 15, price: 390, vatPrice: 468, additionalRate: 26 },
  { name: "Elevate 20 (VA)", hours: 20, price: 500, vatPrice: 600, additionalRate: 25 },
  { name: "Maximize 25 (VA)", hours: 25, price: 600, vatPrice: 720, additionalRate: 24 },
  { name: "Pioneer 30 (VA)", hours: 30, price: 690, vatPrice: 828, additionalRate: 23 },
  { name: "Summit 35 (VA)", hours: 35, price: 770, vatPrice: 924, additionalRate: 22 },
  { name: "Horizon 40 (VA)", hours: 40, price: 840, vatPrice: 1008, additionalRate: 21 },
  { name: "Odyssey 45 (VA)", hours: 45, price: 900, vatPrice: 1080, additionalRate: 20 },
  { name: "Galaxy 50 (VA)", hours: 50, price: 950, vatPrice: 1140, additionalRate: 19 },
  { name: "Infinity 55 (VA)", hours: 55, price: 990, vatPrice: 1188, additionalRate: 18 },
  { name: "Beyond 60 (VA)", hours: 60, price: 1020, vatPrice: 1224, additionalRate: 18 }
];

const callAnsweringPlans = [
  { name: "FlexCall PAYG (VR)", calls: 0, price: 30, vatPrice: 36, additionalRate: 0.46 },
  { name: "Starter 25 (VR)", calls: 25, price: 50, vatPrice: 60, additionalRate: 0.46 },
  { name: "Business 40 (VR)", calls: 40, price: 70, vatPrice: 84, additionalRate: 0.46 },
  { name: "Professional 60 (VR)", calls: 60, price: 90, vatPrice: 108, additionalRate: 0.46 },
  { name: "Enterprise 100 (VR)", calls: 100, price: 140, vatPrice: 168, additionalRate: 0.46 },
  { name: "Corporate 175 (VR)", calls: 175, price: 200, vatPrice: 240, additionalRate: 0.46 },
  { name: "Premium 200 (VR)", calls: 200, price: 375, vatPrice: 450, additionalRate: 0.46 },
  { name: "Elite 325 (VR)", calls: 325, price: 425, vatPrice: 510, additionalRate: 0.46 },
  { name: "Ultimate 400 (VR)", calls: 400, price: 495, vatPrice: 594, additionalRate: 0.46 },
  { name: "Platinum (VR)", calls: 500, price: 570, vatPrice: 684, additionalRate: 0.46 },
  { name: "Diamond 600 (VR)", calls: 600, price: 650, vatPrice: 780, additionalRate: 0.46 },
  { name: "Infinite 800 (VR)", calls: 800, price: 950, vatPrice: 1140, additionalRate: 0.46 }
];



const callHandlingTiers = [
  "Tier 1: Message Only",
  "Tier 2: Booking Only",
  "Tier 3: Bookings/Messages/Forms"
];

// Combined packages for dropdown selection
const allPackages = [
  ...virtualAssistantPlans.map(plan => ({ name: plan.name, type: 'Virtual Assistant' })),
  ...callAnsweringPlans.map(plan => ({ name: plan.name, type: 'Call Answering' }))
];

export function CustomerDetailsForm({ isOpen, onClose, onSubmit, initialData, title, visibleTabs, defaultStatus }: CustomerDetailsFormProps) {
  const allTabs: TabKey[] = ['details', 'billing', 'contacts', 'location', 'systems', 'script', 'forms'];
  const tabs = visibleTabs || allTabs;
  const scriptTabAvailable = tabs.includes('script');
  const statusDefault = defaultStatus || 'Active';
  const { customers, refreshCustomers, accounts, addAccount } = useCustomers();
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const { packages } = usePackages();
  const [activeTab, setActiveTab] = useState("details");
  const [showVAProposal, setShowVAProposal] = useState(false);
  const [showVRProposal, setShowVRProposal] = useState(false);
  const [showAIProposal, setShowAIProposal] = useState(false);
  const [showDTProposal, setShowDTProposal] = useState(false);
  const [showCLProposal, setShowCLProposal] = useState(false);
  const [showCBProposal, setShowCBProposal] = useState(false);
  const [showScriptImport, setShowScriptImport] = useState(false);
  const [scriptImportSubmissionId, setScriptImportSubmissionId] = useState<string | undefined>(undefined);
  const [sendingProposal, setSendingProposal] = useState<string | null>(null);
  const [proposalStatuses, setProposalStatuses] = useState<Record<string, { token: string; status: string; createdAt: string; selectedPackage?: any }>>({});
  const [proposalLinkDialog, setProposalLinkDialog] = useState<{ open: boolean; url: string; serviceType: string }>({ open: false, url: "", serviceType: "" });
  const [linkCopied, setLinkCopied] = useState(false);
  const [scriptDraft, setScriptDraft] = useState<CustomerScriptDraft | null>(null);
  const loadedFormKeyRef = useRef<string | null>(null);

  const getCompletedProposalByService = (serviceType: ProposalRecord["serviceType"]) => {
    const proposals = ((formData.leadMetadata as any)?.proposals || []) as ProposalRecord[];
    return proposals
      .filter((proposal) => proposal.serviceType === serviceType)
      .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())[0];
  };

  const getDisplayProposalStatus = (serviceType: ProposalRecord["serviceType"], proposalStatus?: ProposalStatusEntry) => {
    const completedProposal = getCompletedProposalByService(serviceType);

    if (completedProposal) {
      return {
        status: "completed",
        token: proposalStatus?.token || "",
        createdAt: completedProposal.signedAt,
        selectedPackage: { name: completedProposal.packageName },
      } satisfies ProposalStatusEntry;
    }

    return proposalStatus;
  };
  
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: "", businessType: "", addressLine1: "", addressLine2: "", city: "", postcode: "",
    tel: "", mobile: "", email: "", website: "", status: statusDefault, contact: "", phone: "",
    callsPerMonth: "", billingDay: null, billingOptions: "VAT", billingStatus: [], additionalServices: [], callHandlingTier: "",
    services: [], virtualAssistantPlan: "", callAnsweringPlan: "", packages: "",
    // Package-specific fields
    vaPackage: "", vaPackagedHours: 0, vaHourlyOverageRate: 0, vaPrice: 0,
    vrPackage: "", vrPrice: 0, vrIncludedMinutes: 0, vrOverageRate: 0,
    aiPackage: "", aiSetupFee: 0, aiMonthlyFee: 0, aiCallsAllocated: 0,
    dtPackage: "", dtPricePerMinute: 0,
    clPackage: "", clPrice: 0, clIncludedMinutes: 0, clOverageRate: 0,
    cbPackage: "", cbPrice: 0, cbIncludedMinutes: 0, cbOverageRate: 0,
    // Unified internal billing
    callPackageName: "", callBaseAllowance: 0, callIncludedMinutes: 0, callMonthlyCharge: 0,
    callRatePerCall: 0, callRatePerMinute: 0, callRateSms: 0,
    callRateTransferLandline: 0, callRateTransferMobile: 0,
    callBillingUnit: "per_call", directDialNumber: false, vatRate: 0.20,
    contacts: [], locations: [], address: "", outcomeHow: "", outcomeWhen: "", outcomeFormat: "",
    messageSelection: "", filters: "", systemLink: "", systemIcon: "", script: "", scriptTags: [],
    hasInboundCallScript: true,
    leadMetadata: statusDefault === 'Lead' ? { enquiryYear: new Date().getFullYear() } : null,
    accountId: null,
  });
  
  const [editingContactIndex, setEditingContactIndex] = useState<number | null>(null);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);

  // Refresh customer data when form opens to get latest from DB
  // Use customer from context (freshest) if available, otherwise fall back to prop
  const effectiveInitialData = initialData?.id 
    ? customers.find(c => c.id === initialData.id) || initialData 
    : initialData;

  useEffect(() => {
    if (isOpen && initialData) {
      refreshCustomers();
    }
  }, [isOpen, initialData?.id]);

  useEffect(() => {
    const formKey = isOpen ? (effectiveInitialData?.id || `new:${title}:${statusDefault}`) : null;

    if (!isOpen) {
      loadedFormKeyRef.current = null;
      setScriptDraft(null);
      return;
    }

    if (effectiveInitialData && loadedFormKeyRef.current !== formKey) {
      console.log('🔄 Loading initial customer data:', {
        name: effectiveInitialData.name,
        vrPackage: effectiveInitialData.vrPackage,
        vrPrice: effectiveInitialData.vrPrice,
      });
      
      const d = effectiveInitialData;
      setFormData({
        name: d.name || "",
        businessType: d.businessType || "",
        addressLine1: d.addressLine1 || "",
        addressLine2: d.addressLine2 || "",
        city: d.city || "",
        postcode: d.postcode || "",
        tel: d.tel || "",
        mobile: d.mobile || "",
        email: d.email || "",
        website: d.website || "",
        status: d.status || "Active",
        contact: d.contact || "",
        phone: d.phone || "",
        callsPerMonth: d.callsPerMonth || "",
        billingDay: d.billingDay || null,
        billingOptions: d.billingOptions || "VAT",
        billingStatus: d.billingStatus || [],
        additionalServices: d.additionalServices || [],
        callHandlingTier: d.callHandlingTier || "",
        services: d.services || [],
        virtualAssistantPlan: d.virtualAssistantPlan || "",
        callAnsweringPlan: d.callAnsweringPlan || "",
        packages: d.packages || "",
        vaPackage: d.vaPackage || "",
        vaPackagedHours: d.vaPackagedHours || 0,
        vaHourlyOverageRate: d.vaHourlyOverageRate || 0,
        vaPrice: d.vaPrice || 0,
        vrPackage: d.vrPackage || "",
        vrPrice: d.vrPrice || 0,
        vrIncludedMinutes: d.vrIncludedMinutes || 0,
        vrOverageRate: d.vrOverageRate || 0,
        aiPackage: d.aiPackage || "",
        aiSetupFee: d.aiSetupFee || 0,
        aiMonthlyFee: d.aiMonthlyFee || 0,
        aiCallsAllocated: d.aiCallsAllocated || 0,
        dtPackage: d.dtPackage || "",
        dtPricePerMinute: d.dtPricePerMinute || 0,
        clPackage: d.clPackage || "",
        clPrice: d.clPrice || 0,
        clIncludedMinutes: d.clIncludedMinutes || 0,
        clOverageRate: d.clOverageRate || 0,
        cbPackage: (d as any).cbPackage || "",
        cbPrice: (d as any).cbPrice || 0,
        cbIncludedMinutes: (d as any).cbIncludedMinutes || 0,
        cbOverageRate: (d as any).cbOverageRate || 0,
        callPackageName: d.callPackageName || "",
        callBaseAllowance: d.callBaseAllowance || 0,
        callIncludedMinutes: d.callIncludedMinutes || 0,
        callMonthlyCharge: d.callMonthlyCharge || 0,
        callRatePerCall: d.callRatePerCall || 0,
        callRatePerMinute: d.callRatePerMinute || 0,
        callRateSms: d.callRateSms || 0,
        callRateTransferLandline: d.callRateTransferLandline || 0,
        callRateTransferMobile: d.callRateTransferMobile || 0,
        callBillingUnit: d.callBillingUnit || "per_call",
        directDialNumber: (d as any).directDialNumber ?? false,
        vatRate: d.vatRate ?? 0.20,
        contacts: d.contacts || [],
        locations: d.locations || [],
        address: d.address || "",
        outcomeHow: d.outcomeHow || "",
        outcomeWhen: d.outcomeWhen || "",
        outcomeFormat: d.outcomeFormat || "",
        messageSelection: d.messageSelection || "",
        filters: d.filters || "",
        systemLink: d.systemLink || "",
        systemIcon: d.systemIcon || "",
        script: d.script || "",
        scriptTags: d.scriptTags || [],
        hasInboundCallScript: d.hasInboundCallScript ?? true,
        leadMetadata: d.leadMetadata || null,
        accountId: (d as any).accountId ?? null,
      });
      if (scriptTabAvailable) {
        const draft = loadCustomerScriptDraft(d.id);
        setScriptDraft(draft && scriptDraftDiffers(draft, d.script || "", d.scriptTags || []) ? draft : null);
      } else {
        setScriptDraft(null);
      }
      loadedFormKeyRef.current = formKey;
    } else if (!effectiveInitialData && loadedFormKeyRef.current !== formKey) {
      resetForm();
      setScriptDraft(null);
      loadedFormKeyRef.current = formKey;
    }
  }, [isOpen, effectiveInitialData, scriptTabAvailable]);

  useEffect(() => {
    if (!isOpen || !scriptTabAvailable || !effectiveInitialData?.id) return;
    const currentScript = formData.script || "";
    const currentTags = formData.scriptTags || [];
    const hasUnsavedScriptChanges = scriptDraftDiffers(
      { script: currentScript, scriptTags: currentTags },
      effectiveInitialData.script || "",
      effectiveInitialData.scriptTags || [],
    );
    if (!hasUnsavedScriptChanges) return;

    const timeout = window.setTimeout(() => {
      saveCustomerScriptDraft(effectiveInitialData.id, currentScript, currentTags, formData.name || effectiveInitialData.name);
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [
    isOpen,
    scriptTabAvailable,
    effectiveInitialData?.id,
    effectiveInitialData?.script,
    effectiveInitialData?.scriptTags,
    effectiveInitialData?.name,
    formData.script,
    formData.scriptTags,
    formData.name,
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [postcodeError, setPostcodeError] = useState<string | null>(null);

  const persistCurrentScriptDraft = () => {
    if (!scriptTabAvailable || !effectiveInitialData?.id) return;
    const currentScript = formData.script || "";
    const currentTags = formData.scriptTags || [];
    const hasUnsavedScriptChanges = scriptDraftDiffers(
      { script: currentScript, scriptTags: currentTags },
      effectiveInitialData.script || "",
      effectiveInitialData.scriptTags || [],
    );
    if (hasUnsavedScriptChanges) {
      saveCustomerScriptDraft(effectiveInitialData.id, currentScript, currentTags, formData.name || effectiveInitialData.name);
    }
  };

  const handleClose = () => {
    persistCurrentScriptDraft();
    onClose();
  };

  const handlePostcodeBlur = () => {
    const raw = (formData.postcode || "").trim();
    if (!raw) {
      setPostcodeError(null);
      if (formData.postcode !== "") setFormData(prev => ({ ...prev, postcode: "" }));
      return;
    }
    const err = ukPostcodeError(raw);
    setPostcodeError(err);
    if (!err) {
      const normalised = normaliseUkPostcode(raw);
      if (normalised !== formData.postcode) {
        setFormData(prev => ({ ...prev, postcode: normalised }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validate & normalise UK postcode before submit.
    // Only enforce validity when the user has actually changed the postcode from
    // its initial (DB) value — otherwise legacy/free-form values (e.g. "N/A",
    // "TBC", partial codes) would block saves of unrelated fields.
    const rawPostcode = (formData.postcode || "").trim();
    const initialPostcode = (effectiveInitialData?.postcode || "").trim();
    const postcodeChanged = rawPostcode !== initialPostcode;
    let normalisedPostcode = rawPostcode;
    if (postcodeChanged && rawPostcode) {
      const postcodeErr = ukPostcodeError(rawPostcode);
      if (postcodeErr) {
        setPostcodeError(postcodeErr);
        toast({
          title: "Invalid postcode",
          description: postcodeErr,
          variant: "destructive",
        });
        return;
      }
      normalisedPostcode = normaliseUkPostcode(rawPostcode);
      if (normalisedPostcode !== formData.postcode) {
        setFormData(prev => ({ ...prev, postcode: normalisedPostcode }));
      }
    }
    setPostcodeError(null);

    // Ensure legacy fields are populated for compatibility
    const submitData = {
      ...formData,
      postcode: normalisedPostcode,
      contact: formData.name || "",
      phone: formData.tel || formData.mobile || ""
    } as Omit<Customer, 'id'>;


    try {
      setIsSubmitting(true);
      persistCurrentScriptDraft();
      const result = await Promise.resolve(onSubmit(submitData));
      if (result === false) return;
      if (effectiveInitialData?.id) {
        clearCustomerScriptDraft(effectiveInitialData.id);
        setScriptDraft(null);
      }
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message || "Your changes were kept as a local draft. Please sign in and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "", businessType: "", addressLine1: "", addressLine2: "", city: "", postcode: "",
      tel: "", mobile: "", email: "", website: "", status: statusDefault, contact: "", phone: "",
      callsPerMonth: "", billingDay: null, billingOptions: "VAT", billingStatus: [], additionalServices: [], callHandlingTier: "",
      services: [], virtualAssistantPlan: "", callAnsweringPlan: "", packages: "",
      // Package-specific fields
      vaPackage: "", vaPackagedHours: 0, vaHourlyOverageRate: 0, vaPrice: 0,
      vrPackage: "", vrPrice: 0, vrIncludedMinutes: 0, vrOverageRate: 0,
      aiPackage: "", aiSetupFee: 0, aiMonthlyFee: 0, aiCallsAllocated: 0,
      dtPackage: "", dtPricePerMinute: 0,
      clPackage: "", clPrice: 0, clIncludedMinutes: 0, clOverageRate: 0,
      cbPackage: "", cbPrice: 0, cbIncludedMinutes: 0, cbOverageRate: 0,
      callPackageName: "", callBaseAllowance: 0, callIncludedMinutes: 0, callMonthlyCharge: 0,
      callRatePerCall: 0, callRatePerMinute: 0, callRateSms: 0,
      callRateTransferLandline: 0, callRateTransferMobile: 0,
      callBillingUnit: "per_call", directDialNumber: false, vatRate: 0.20,
      contacts: [], locations: [], address: "", outcomeHow: "", outcomeWhen: "", outcomeFormat: "",
      messageSelection: "", filters: "", systemLink: "", systemIcon: "", script: "", scriptTags: [],
      hasInboundCallScript: true,
      leadMetadata: statusDefault === 'Lead' ? { enquiryYear: new Date().getFullYear() } : null
    });
    setActiveTab("details");
    setEditingContact(null);
    setEditingContactIndex(null);
  };

  const handleChange = (field: keyof Customer, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const [isResettingBilling, setIsResettingBilling] = useState(false);

  const handleResetBilling = async () => {
    if (!initialData?.id) return;
    setIsResettingBilling(true);
    try {
      const customerId = initialData.id;

      // Void all proposal invoices for this customer
      const { error: invErr } = await supabase
        .from('proposal_invoices')
        .update({ status: 'void' })
        .eq('customer_id', customerId);
      if (invErr) throw invErr;

      // Cancel any non-completed proposal tokens for this customer
      const { error: tokErr } = await supabase
        .from('proposal_tokens')
        .update({ status: 'cancelled' })
        .eq('customer_id', customerId)
        .neq('status', 'completed');
      if (tokErr) throw tokErr;

      // Clear billing/service fields on the customer record and remove signed proposals
      const existingMeta = (initialData.leadMetadata as any) || {};
      const clearedMeta = { ...existingMeta, proposals: [] };

      const { error: custErr } = await supabase
        .from('customers')
        .update({
          services: [],
          packages: [],
          additional_services: [],
          billing_status: [],
          va_package: null, va_price: null, va_packaged_hours: 0, va_hourly_overage_rate: 0,
          vr_package: null, vr_price: null, vr_included_minutes: 0, vr_overage_rate: 0,
          ai_package: null, ai_price: null, ai_setup_fee: 0, ai_monthly_fee: 0, ai_calls_allocated: 0,
          dt_package: null, dt_price: null, dt_price_per_minute: 0,
          cl_package: null, cl_price: null, cl_included_minutes: null, cl_overage_rate: null,
          cb_package: null, cb_price: null, cb_included_minutes: null, cb_overage_rate: null,
          lead_metadata: clearedMeta,
        })
        .eq('id', customerId);
      if (custErr) throw custErr;

      // Sync local form state
      setFormData(prev => ({
        ...prev,
        services: [],
        packages: "",
        additionalServices: [],
        billingStatus: [],
        vaPackage: "", vaPackagedHours: 0, vaHourlyOverageRate: 0, vaPrice: 0,
        vrPackage: "", vrPrice: 0, vrIncludedMinutes: 0, vrOverageRate: 0,
        aiPackage: "", aiSetupFee: 0, aiMonthlyFee: 0, aiCallsAllocated: 0,
        dtPackage: "", dtPricePerMinute: 0,
        clPackage: "", clPrice: 0, clIncludedMinutes: 0, clOverageRate: 0,
        cbPackage: "", cbPrice: 0, cbIncludedMinutes: 0, cbOverageRate: 0,
        leadMetadata: clearedMeta,
      }));
      setProposalStatuses({});

      await refreshCustomers();

      toast({
        title: "Billing reset",
        description: "All proposals cancelled, invoices voided, and active services cleared for this customer.",
      });
    } catch (error: any) {
      toast({
        title: "Reset failed",
        description: error?.message || "Could not reset billing for this customer.",
        variant: "destructive",
      });
    } finally {
      setIsResettingBilling(false);
    }
  };

  // Build initial data for proposal dialogs from lead's existing info
  const nameParts = (formData.name || "").trim().split(/\s+/);
  const proposalInitialData: ProposalInitialData = {
    firstName: nameParts[0] || "",
    lastName: nameParts.slice(1).join(" ") || "",
    email: formData.email || "",
    telephone: formData.tel || formData.mobile || "",
    companyName: formData.name || "",
    heardAboutUs: (formData.leadMetadata as any)?.heardAboutUs || "",
  };

  // Append a proposal record to leadMetadata and auto-save
  const appendProposalAndSave = (proposal: ProposalRecord) => {
    const currentMetadata = (formData.leadMetadata || {}) as any;
    const existingProposals = currentMetadata.proposals || [];
    const updatedMetadata = {
      ...currentMetadata,
      proposals: [...existingProposals, proposal],
    };
    const updatedFormData = { ...formData, leadMetadata: updatedMetadata };
    setFormData(updatedFormData);
    // Save directly with the updated data to avoid stale state issues
    const submitData = {
      ...updatedFormData,
      contact: updatedFormData.name || "",
      phone: updatedFormData.tel || updatedFormData.mobile || "",
    } as Omit<Customer, 'id'>;
    onSubmit(submitData);
  };

  // Send proposal email for a specific service using current form field values
  const sendServiceProposalEmail = (serviceType: 'VA' | 'VR' | 'AI' | 'DT' | 'CL' | 'CB') => {
    const clientEmail = formData.email || "";
    const clientName = formData.name || "Client";
    const serviceLabels: Record<string, string> = {
      VA: "Virtual Assistant",
      VR: "Call Answering",
      CL: "Call Answering (Clinic)",
      CB: "Call Answering (Bookings)",
      AI: "AI Call Handling",
      DT: "Digital Typing",
    };
    const serviceLabel = serviceLabels[serviceType];
    let packageName = "";
    let priceInfo = "";

    switch (serviceType) {
      case 'VA':
        packageName = formData.vaPackage || "";
        priceInfo = `Package: ${packageName}\nHours: ${formData.vaPackagedHours || 0}\nOverage Rate: £${formData.vaHourlyOverageRate || 0}/hour`;
        break;
      case 'VR':
        packageName = formData.vrPackage || "";
        priceInfo = `Package: ${packageName}\nPrice: £${formData.vrPrice || 0}/month\nIncluded Calls: ${formData.vrIncludedMinutes || 0}\nOverage: £${formData.vrOverageRate || 0}/call`;
        break;
      case 'AI':
        packageName = formData.aiPackage || "";
        priceInfo = `Package: ${packageName}\nSetup Fee: £${formData.aiSetupFee || 0}\nMonthly Fee: £${formData.aiMonthlyFee || 0}\nCalls Allocated: ${formData.aiCallsAllocated || 0}`;
        break;
      case 'DT':
        packageName = formData.dtPackage || "";
        priceInfo = `Package: ${packageName}\nPrice: £${formData.dtPricePerMinute || 0}/digital min`;
        break;
      case 'CL':
        packageName = formData.clPackage || "";
        priceInfo = `Package: ${packageName}\nPrice: £${formData.clPrice || 0}/month\nIncluded Calls: ${formData.clIncludedMinutes || 0}\nOverage: £${formData.clOverageRate || 0}/call`;
        break;
      case 'CB':
        packageName = (formData as any).cbPackage || "";
        priceInfo = `Package: ${packageName}\nPrice: £${(formData as any).cbPrice || 0}/month\nIncluded Calls: ${(formData as any).cbIncludedMinutes || 0}\nOverage: £${(formData as any).cbOverageRate || 0}/call`;
        break;
    }

    const subject = encodeURIComponent(`Your ${serviceLabel} Service Proposal – ${packageName}`);
    const body = encodeURIComponent(
      `Dear ${clientName},\n\n` +
      `Thank you for your interest in our ${serviceLabel} Service.\n\n` +
      `Here are the details of your proposal:\n\n` +
      `${priceInfo}\n\n` +
      `If you have any questions, please don't hesitate to get in touch.\n\n` +
      `Kind regards,\nThe VA Team`
    );
    window.open(`mailto:${clientEmail}?subject=${subject}&body=${body}`, "_blank");
  };

  // Fetch existing proposal tokens for this customer
  useEffect(() => {
    if (!initialData?.id) return;
    const fetchProposalTokens = async () => {
      const { data } = await supabase
        .from("proposal_tokens" as any)
        .select("service_type, token, status, created_at, selected_package")
        .eq("customer_id", initialData.id)
        .order("created_at", { ascending: false });
      if (data) {
        const statuses: Record<string, any> = {};
        (data as any[]).forEach((row: any) => {
          if (!statuses[row.service_type]) {
            statuses[row.service_type] = {
              token: row.token,
              status: row.status,
              createdAt: row.created_at,
              selectedPackage: row.selected_package,
            };
          }
        });
        setProposalStatuses(statuses);
      }
    };
    fetchProposalTokens();
  }, [initialData?.id, isOpen]);

  // Send proposal - creates token and opens mailto with link
  const sendProposal = async (serviceType: "VA" | "VR" | "AI" | "DT" | "CL" | "CB") => {
    console.log("[sendProposal] clicked", { serviceType, customerId: initialData?.id });
    if (!initialData?.id) {
      toast({
        title: "Save customer first",
        description: "Please save this customer before generating a proposal link.",
        variant: "destructive",
      });
      return;
    }
    setSendingProposal(serviceType);
    try {
      // Get packages for this service type
      const serviceNameMap: Record<string, string> = {
        VA: "Virtual Assistant", VR: "Call Answering", CL: "Call Answering (Clinic)", CB: "Call Answering (Bookings)", AI: "AI Call Handling", DT: "Digital Typing",
      };

      // Build packages snapshot from PackagesContext, filtered by service type
      const packagesSnapshot = packages
        .filter(pkg => pkg.services.includes(serviceType))
        .map(pkg => ({
          name: pkg.name, price: pkg.price, minutes: pkg.minutes, overage: pkg.overage,
          features: pkg.features, packagedHours: pkg.packagedHours, hourlyOverageRate: pkg.hourlyOverageRate,
          aiSetupFee: pkg.aiSetupFee, aiMonthlyFee: pkg.aiMonthlyFee, aiCallsAllocated: pkg.aiCallsAllocated,
          digitalPricePerMinute: pkg.digitalPricePerMinute,
        }));

      if (packagesSnapshot.length === 0) {
        toast({
          title: "No packages found",
          description: `No packages with the "${serviceType}" service are configured in Packages & Pricing. Please add packages first.`,
          variant: "destructive",
        });
        setSendingProposal(null);
        return;
      }

      // Use the first visible contact's name for the greeting, fall back to company name
      const contacts = (formData.contacts || []) as CustomerContact[];
      const primaryContact = contacts.find(c => !(c as any).hidden);
      const contactName = primaryContact ? `${primaryContact.firstName} ${primaryContact.surname}`.trim() : "";

      const customerSnapshot = {
        name: formData.name || "",
        contactName,
        email: formData.email || "",
        companyName: formData.name || "",
        telephone: formData.tel || formData.mobile || "",
      };

      const { data, error } = await supabase.functions.invoke("create-proposal-token", {
        body: { customerId: initialData.id, serviceType, packagesSnapshot, customerSnapshot },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const proposalUrl = `https://portal.thevateam.co.uk/proposal/${data.token}`;

      // Update local status
      setProposalStatuses(prev => ({
        ...prev,
        [serviceType]: { token: data.token, status: "pending", createdAt: new Date().toISOString() },
      }));

      // Show link dialog instead of opening mailto
      setLinkCopied(false);
      setProposalLinkDialog({ open: true, url: proposalUrl, serviceType: serviceNameMap[serviceType] });
    } catch (err: any) {
      console.error("Error creating proposal:", err);
      toast({ title: "Error", description: err.message || "Failed to create proposal", variant: "destructive" });
    } finally {
      setSendingProposal(null);
    }
  };

  const handleServiceToggle = (service: string) => {
    const current = formData.services || [];
    const updated = current.includes(service)
      ? current.filter(s => s !== service)
      : [...current, service];
    handleChange('services', updated);
  };

  const handleBillingStatusToggle = (status: string) => {
    const current = formData.billingStatus || [];
    const updated = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    handleChange('billingStatus', updated);
  };


  const addContact = () => {
    const newContact: CustomerContact = {
      id: `contact-${Date.now()}`,
      firstName: "",
      surname: "",
      position: "",
      company: "",
      mobile: "",
      email: "",
      oooReason: undefined,
      oooFromDate: undefined,
      oooUntilDate: undefined
    };
    setEditingContact(newContact);
    setEditingContactIndex(-1); // -1 indicates new contact
  };

  const editContact = (index: number) => {
    const contact = (formData.contacts || [])[index];
    console.log('✏️ Editing contact at index', index, ':', contact);
    if (contact) {
      // Ensure all OOO fields are properly initialized
      setEditingContact({ 
        ...contact,
        oooReason: contact.oooReason || "",
        oooFromDate: contact.oooFromDate || undefined,
        oooUntilDate: contact.oooUntilDate || undefined
      });
      setEditingContactIndex(index);
    }
  };

  const saveContact = () => {
    if (!editingContact) return;
    
    console.log('💾 Saving contact with OOO data:', {
      name: `${editingContact.firstName} ${editingContact.surname}`,
      oooReason: editingContact.oooReason,
      oooFromDate: editingContact.oooFromDate,
      oooUntilDate: editingContact.oooUntilDate
    });
    
    const contacts = [...(formData.contacts || [])];
    if (editingContactIndex === -1) {
      // Adding new contact
      contacts.push(editingContact);
    } else if (editingContactIndex !== null) {
      // Updating existing contact
      contacts[editingContactIndex] = editingContact;
    }
    
    handleChange('contacts', contacts);
    console.log('💾 Updated contacts array:', contacts);
    setEditingContact(null);
    setEditingContactIndex(null);
  };

  const cancelContactEdit = () => {
    setEditingContact(null);
    setEditingContactIndex(null);
  };

  const updateContact = (index: number, field: keyof CustomerContact, value: string) => {
    const contacts = [...(formData.contacts || [])];
    contacts[index] = { ...contacts[index], [field]: value };
    handleChange('contacts', contacts);
  };

  const updateEditingContact = (field: keyof CustomerContact, value: string | Date | boolean | undefined) => {
    if (editingContact) {
      setEditingContact({ ...editingContact, [field]: value });
    }
  };

  const removeContact = (index: number) => {
    const contacts = (formData.contacts || []).filter((_, i) => i !== index);
    handleChange('contacts', contacts);
  };

  const addScriptTag = () => {
    const newTag = {
      name: "",
      searchText: ""
    };
    handleChange('scriptTags', [...(formData.scriptTags || []), newTag]);
  };

  const updateScriptTag = (index: number, field: 'name' | 'searchText', value: string) => {
    const tags = [...(formData.scriptTags || [])];
    tags[index] = { ...tags[index], [field]: value };
    handleChange('scriptTags', tags);
  };

  const removeScriptTag = (index: number) => {
    const tags = (formData.scriptTags || []).filter((_, i) => i !== index);
    handleChange('scriptTags', tags);
  };

  const restoreScriptDraft = () => {
    if (!scriptDraft) return;
    setFormData(prev => ({
      ...prev,
      script: scriptDraft.script,
      scriptTags: scriptDraft.scriptTags || [],
    }));
    setScriptDraft(null);
    setActiveTab('script');
  };

  const discardScriptDraft = () => {
    clearCustomerScriptDraft(effectiveInitialData?.id);
    setScriptDraft(null);
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="w-[95vw] sm:w-[92vw] max-w-[1400px] max-h-[92vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 text-[15px] leading-relaxed sm:text-sm sm:leading-normal [&_label]:text-[13px] [&_label]:leading-snug [&_label]:font-medium [&_label]:break-words [&_label]:whitespace-normal [&_input]:leading-tight [&_input]:min-w-0 [&_textarea]:leading-snug [&_textarea]:min-w-0 [&_.form-item]:space-y-1.5 [&_.grid]:min-w-0 [&_.flex]:min-w-0">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 min-w-0 w-full">
          {scriptDraft && scriptTabAvailable && (
            <Alert className="border-primary/30 bg-primary/5">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Unsaved script draft found</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  A script draft from {formatCustomerScriptDraftTime(scriptDraft.savedAt)} is available for this customer.
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={restoreScriptDraft}>
                    Restore Draft
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={discardScriptDraft}>
                    Discard
                  </Button>
                </span>
              </AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="overflow-x-auto -mx-1 pb-1">
              <TabsList className="flex w-max sm:w-full sm:grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
              {tabs.includes('details') && <TabsTrigger value="details">Details</TabsTrigger>}
              {tabs.includes('billing') && <TabsTrigger value="billing">Billing</TabsTrigger>}
              {tabs.includes('contacts') && <TabsTrigger value="contacts">Contact(s)</TabsTrigger>}
              {tabs.includes('location') && <TabsTrigger value="location">Location</TabsTrigger>}
              
              {tabs.includes('systems') && <TabsTrigger value="systems">Systems</TabsTrigger>}
              {tabs.includes('script') && <TabsTrigger value="script">Script</TabsTrigger>}
              {tabs.includes('forms') && <TabsTrigger value="forms">Forms</TabsTrigger>}
            </TabsList>
            </div>

            <TabsContent value="details" className="space-y-4">
              {/* Lead Information Block - always visible with Customer Type, expands for lead fields */}
              <div className="space-y-4 p-4 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
                <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">Lead Information</h3>
                
                {/* Customer Type Toggle */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Customer Type</Label>
                  <div className="flex items-center gap-1 border rounded-md p-1 w-fit bg-white dark:bg-background">
                    {(['Lead', 'Active', 'Paused', 'Lost'] as const).map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant={formData.status === s ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => handleChange('status', s)}
                        className={cn(
                          "h-8 px-4 text-sm font-medium transition-all",
                          formData.status === s && s === 'Active' && 'bg-green-600 hover:bg-green-700 text-white shadow-md border-2 border-green-700',
                          formData.status === s && s === 'Lead' && 'bg-blue-600 hover:bg-blue-700 text-white shadow-md border-2 border-blue-700',
                          formData.status === s && s === 'Paused' && 'bg-muted hover:bg-muted/80 text-muted-foreground shadow-md border-2 border-border',
                          formData.status === s && s === 'Lost' && 'bg-red-600 hover:bg-red-700 text-white shadow-md border-2 border-red-700',
                        )}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Inbound call script visibility toggle */}
                <div className="flex items-start gap-3 p-3 rounded-md border bg-white dark:bg-background">
                  <Checkbox
                    id="hasInboundCallScript"
                    checked={formData.hasInboundCallScript ?? true}
                    onCheckedChange={(checked) => handleChange('hasInboundCallScript', checked === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="hasInboundCallScript" className="text-sm font-medium cursor-pointer">
                      Has inbound call script
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Show this customer in the call-script dropdown on the main screen. Untick if this customer is not on the phones.
                    </p>
                  </div>
                </div>


                {/* Lead-specific fields - always visible, read-only for Active/Paused */}
                {(() => {
                  const isReadOnly = formData.status === 'Active' || formData.status === 'Paused';
                  return (
                  <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-blue-200 dark:border-blue-800", isReadOnly && "opacity-75")}>
                    <div className="space-y-2">
                      <Label>Pipeline Status</Label>
                      <Select
                        value={(formData.leadMetadata as any)?.pipelineStatus || "new"}
                        onValueChange={(value) => setFormData(prev => ({
                          ...prev,
                          leadMetadata: { ...prev.leadMetadata, pipelineStatus: value }
                        }))}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="bg-white dark:bg-background">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="qualified">Qualified</SelectItem>
                          <SelectItem value="proposal">Proposal</SelectItem>
                          <SelectItem value="negotiation">Negotiation</SelectItem>
                          <SelectItem value="won">Won</SelectItem>
                          <SelectItem value="lost">Lost</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="heardAboutUs">Where did you hear about us?</Label>
                      <Select
                        value={formData.leadMetadata?.heardAboutUs || ""}
                        onValueChange={(value) => setFormData(prev => ({
                          ...prev,
                          leadMetadata: { ...prev.leadMetadata, heardAboutUs: value }
                        }))}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="bg-white dark:bg-background">
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Google Search">Google Search</SelectItem>
                          <SelectItem value="Social Media (Facebook)">Social Media (Facebook)</SelectItem>
                          <SelectItem value="Social Media (Instagram)">Social Media (Instagram)</SelectItem>
                          <SelectItem value="Social Media (LinkedIn)">Social Media (LinkedIn)</SelectItem>
                          <SelectItem value="Referral">Referral</SelectItem>
                          <SelectItem value="BNI Networking">BNI Networking</SelectItem>
                          <SelectItem value="FSB Networking">FSB Networking</SelectItem>
                          <SelectItem value="Other Networking">Other Networking</SelectItem>
                          <SelectItem value="Website">Website</SelectItem>
                          <SelectItem value="Email Campaign">Email Campaign</SelectItem>
                          <SelectItem value="Cold Call">Cold Call</SelectItem>
                          <SelectItem value="Event/Exhibition">Event/Exhibition</SelectItem>
                          <SelectItem value="Word of Mouth">Word of Mouth</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="enquiryYear">Enquiry Year</Label>
                      <Select
                        value={formData.leadMetadata?.enquiryYear?.toString() || ""}
                        onValueChange={(value) => setFormData(prev => ({
                          ...prev,
                          leadMetadata: { ...prev.leadMetadata, enquiryYear: parseInt(value) }
                        }))}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="bg-white dark:bg-background">
                          <SelectValue placeholder="Select year" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 11 }, (_, i) => 2020 + i).map(year => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Lead Value (£)</Label>
                      <Input
                        type="number"
                        min={0}
                        className="bg-white dark:bg-background"
                        value={(formData.leadMetadata as any)?.value || 0}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          leadMetadata: { ...prev.leadMetadata, value: parseFloat(e.target.value) || 0 }
                        }))}
                        readOnly={isReadOnly}
                      />
                    </div>
                  </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    maxLength={50}
                    value={formData.name || ""}
                    onChange={(e) => handleChange("name", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessType">Business Type</Label>
                  <Select 
                    value={formData.businessType || ""} 
                    onValueChange={(value) => handleChange("businessType", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Accountant">Accountant</SelectItem>
                      <SelectItem value="Arbitration">Arbitration</SelectItem>
                      <SelectItem value="Architect">Architect</SelectItem>
                      <SelectItem value="Boiler/Heating Engineers">Boiler/Heating Engineers</SelectItem>
                      <SelectItem value="Business Support">Business Support</SelectItem>
                      <SelectItem value="Care Agency">Care Agency</SelectItem>
                      <SelectItem value="Chauffeur">Chauffeur</SelectItem>
                      <SelectItem value="eCommerce">eCommerce</SelectItem>
                      <SelectItem value="Educational">Educational</SelectItem>
                      <SelectItem value="Financial">Financial</SelectItem>
                      <SelectItem value="Gardening Services">Gardening Services</SelectItem>
                      <SelectItem value="General Business">General Business</SelectItem>
                      <SelectItem value="Hair & Barber Salon">Hair & Barber Salon</SelectItem>
                      <SelectItem value="Home Improvements">Home Improvements</SelectItem>
                      <SelectItem value="IT Support">IT Support</SelectItem>
                      <SelectItem value="Massage Therapy">Massage Therapy</SelectItem>
                      <SelectItem value="Neurodiversity Services">Neurodiversity Services</SelectItem>
                      <SelectItem value="Osteopathy">Osteopathy</SelectItem>
                      <SelectItem value="Physiotherapist">Physiotherapist</SelectItem>
                      <SelectItem value="Property Services">Property Services</SelectItem>
                      <SelectItem value="Trades">Trades</SelectItem>
                      <SelectItem value="Waste Removal">Waste Removal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountId">Account / Group</Label>
                  <Select
                    value={formData.accountId ? formData.accountId : "__none__"}
                    onValueChange={(value) => {
                      if (value === "__new__") {
                        setNewAccountName("");
                        setNewAccountOpen(true);
                        return;
                      }
                      handleChange("accountId" as any, value === "__none__" ? null : value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No account (standalone)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No account (standalone)</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                      <SelectItem value="__new__">+ Add new account…</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Customers sharing the same account will be combined onto one invoice.
                  </p>
                  {newAccountOpen && (
                    <div className="flex gap-2 pt-1">
                      <Input
                        autoFocus
                        placeholder="New account name (e.g. Physio-On Ltd)"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        maxLength={80}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                          const created = await addAccount(newAccountName);
                          if (created) {
                            handleChange("accountId" as any, created.id);
                            setNewAccountOpen(false);
                            setNewAccountName("");
                          }
                        }}
                      >
                        Add
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => { setNewAccountOpen(false); setNewAccountName(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressLine1">Address Line 1</Label>
                  <Input
                    id="addressLine1"
                    maxLength={50}
                    value={formData.addressLine1 || ""}
                    onChange={(e) => handleChange("addressLine1", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressLine2">Address Line 2</Label>
                  <Input
                    id="addressLine2"
                    maxLength={50}
                    value={formData.addressLine2 || ""}
                    onChange={(e) => handleChange("addressLine2", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    maxLength={50}
                    value={formData.city || ""}
                    onChange={(e) => handleChange("city", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postcode">Postcode</Label>
                  <Input
                    id="postcode"
                    maxLength={10}
                    value={formData.postcode || ""}
                    onChange={(e) => {
                      handleChange("postcode", e.target.value);
                      if (postcodeError) setPostcodeError(null);
                    }}
                    onBlur={handlePostcodeBlur}
                    aria-invalid={!!postcodeError}
                    aria-describedby={postcodeError ? "postcode-error" : undefined}
                    className={cn(postcodeError && "border-destructive focus-visible:ring-destructive")}
                    placeholder="e.g. SW1A 1AA"
                  />
                  {postcodeError ? (
                    <p id="postcode-error" className="text-xs text-destructive">
                      {postcodeError}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      UK format: 5–7 characters, uppercased on save. Examples:{" "}
                      <span className="font-mono">SW1A 1AA</span>,{" "}
                      <span className="font-mono">RG40 5PN</span>,{" "}
                      <span className="font-mono">M1 1AA</span>,{" "}
                      <span className="font-mono">B33 8TH</span>.
                    </p>
                  )}

                </div>
                <div className="space-y-2">
                  <Label htmlFor="tel">Tel</Label>
                  <Input
                    id="tel"
                    type="tel"
                    maxLength={25}
                    value={formData.tel || ""}
                    onChange={(e) => handleChange("tel", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mobile">Mobile</Label>
                  <Input
                    id="mobile"
                    type="tel"
                    maxLength={25}
                    value={formData.mobile || ""}
                    onChange={(e) => handleChange("mobile", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    maxLength={50}
                    value={formData.email || ""}
                    onChange={(e) => handleChange("email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    type="url"
                    maxLength={60}
                    value={formData.website || ""}
                    onChange={(e) => handleChange("website", e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="billing" className="space-y-4">
              <div className="space-y-4">
                {initialData?.id && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border border-destructive/30 bg-destructive/5 rounded-md">
                    <div className="text-sm min-w-0 flex-1">
                      <p className="font-medium text-destructive">Reset billing for this customer</p>
                      <p className="text-muted-foreground text-xs break-words">
                        Cancels all proposals and agreements, voids invoices, and clears active services so you can reselect a different option. Only affects this customer.
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" size="sm" disabled={isResettingBilling} className="shrink-0 self-start sm:self-auto">
                          {isResettingBilling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                          Reset Billing
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset billing for this customer?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will cancel all previous proposals and agreements, void all invoices, and remove active services for <strong>{initialData.name}</strong>. This action cannot be undone, but no other customer is affected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleResetBilling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Yes, reset billing
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {billingStatuses.map((status) => {
                      const getStatusColor = (status: string) => {
                        switch(status) {
                          case 'Active': return 'text-green-600 border-green-200 bg-green-50';
                          case 'Pending': return 'text-orange-600 border-orange-200 bg-orange-50';
                          case 'Suspended': return 'text-yellow-600 border-yellow-200 bg-yellow-50';
                          case 'Inactive': return 'text-red-600 border-red-200 bg-red-50';
                          default: return '';
                        }
                      };

                      return (
                        <div key={status} className={`flex items-center gap-2 p-2 rounded-md border min-w-0 ${getStatusColor(status)}`}>
                          <Checkbox
                            id={status}
                            checked={(formData.billingStatus || []).includes(status)}
                            onCheckedChange={() => handleBillingStatusToggle(status)}
                            className="shrink-0"
                          />
                          <Label htmlFor={status} className="text-sm font-medium break-words min-w-0 flex-1">{status}</Label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Services Selection */}
                <div className="space-y-2">
                  <Label>Active Services</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {services.map((service) => (
                      <div key={service} className="flex items-center gap-2 p-2 rounded-md border min-w-0">
                        <Checkbox
                          id={`service-${service}`}
                          checked={(formData.services || []).includes(service)}
                          onCheckedChange={() => handleServiceToggle(service)}
                          className="shrink-0"
                        />
                        <Label htmlFor={`service-${service}`} className="text-sm font-medium leading-tight break-words flex-1 min-w-0">
                          {service}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <UnifiedBillingSection formData={formData} onChange={handleChange} />


                {/* Billing meta — responsive row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2 min-w-0">
                    <Label>Day of Month Billed</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal truncate",
                            !formData.billingDay && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {formData.billingDay ? format(formData.billingDay, "dd/MM/yyyy") : "Pick a date"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={formData.billingDay || undefined}
                          onSelect={(date) => handleChange('billingDay', date)}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2 min-w-0">
                    <Label htmlFor="billingOptions">Billing Options</Label>
                    <Select
                      value={formData.billingOptions || "VAT"}
                      onValueChange={(value) => handleChange("billingOptions", value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VAT">Charge VAT @ 20%</SelectItem>
                        <SelectItem value="Tax Exempt">Tax Exempt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(formData.services || []).includes("Call Answering Service") && (
                    <div className="space-y-2 min-w-0">
                      <Label htmlFor="callHandlingTier">Call Handling Tier</Label>
                      <Select
                        value={formData.callHandlingTier || ""}
                        onValueChange={(value) => handleChange("callHandlingTier", value)}
                      >
                        <SelectTrigger className="w-full bg-background border border-input z-50">
                          <SelectValue placeholder="Select call handling tier" />
                        </SelectTrigger>
                        <SelectContent>
                          {callHandlingTiers.map((tier) => (
                            <SelectItem key={tier} value={tier}>
                              {tier}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Send Proposal Buttons */}
                <div className="pt-4 border-t space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Send className="h-4 w-4" /> Send Proposal to Client
                  </h4>
                  {[
                    { service: "Virtual Assistant Service", type: "VA" as const, label: "Virtual Assistant" },
                    { service: "Call Answering Service", type: "VR" as const, label: "Call Answering" },
                    { service: "Call Answering Service (Clinic)", type: "CL" as const, label: "Call Answering (Clinic)" },
                    { service: "Call Answering Service (Bookings)", type: "CB" as const, label: "Call Answering (Bookings)" },
                    { service: "AI Call Handling Service", type: "AI" as const, label: "AI Call Handling" },
                    { service: "Digital Typing Service", type: "DT" as const, label: "Digital Typing" },
                  ].filter(s => (formData.services || []).includes(s.service)).map(({ type, label }) => {
                    const ps = getDisplayProposalStatus(type, proposalStatuses[type]);
                    return (
                      <div key={type} className="space-y-1.5">
                        <div className="flex gap-2 items-center">
                          <Button
                            type="button"
                            variant="default"
                            className="flex-1"
                            disabled={sendingProposal === type}
                            onClick={() => sendProposal(type)}
                          >
                            {sendingProposal === type ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                            ) : (
                              <><Link className="h-4 w-4 mr-2" /> Generate {label} Link</>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (type === "VA") setShowVAProposal(true);
                              else if (type === "VR") setShowVRProposal(true);
                              else if (type === "CL") setShowCLProposal(true);
                              else if (type === "CB") setShowCBProposal(true);
                              else if (type === "AI") setShowAIProposal(true);
                              else if (type === "DT") setShowDTProposal(true);
                            }}
                          >
                            <FileTextIcon className="h-4 w-4" />
                          </Button>
                        </div>
                        {ps && (
                          <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md ${
                            ps.status === "completed" ? "bg-green-50 text-green-700 border border-green-200" :
                            "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {ps.status === "completed" ? (
                              <><Check className="h-3 w-3" /> Completed — Client selected {ps.selectedPackage?.name || "a package"}</>
                            ) : (
                              <><Clock className="h-3 w-3" /> Sent {format(new Date(ps.createdAt), "dd MMM yyyy")} — Awaiting response</>
                            )}
                            {ps.token && (
                              <a href={`/proposal/${ps.token}`} target="_blank" rel="noopener noreferrer" className="ml-auto hover:underline flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" /> View
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>
              {/* Proposals & Agreements History */}
              {((formData.leadMetadata as any)?.proposals || []).length > 0 && (
                <div className="pt-4 border-t space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <FileTextIcon className="h-4 w-4" /> Proposals & Agreements
                  </h4>
                  <div className="space-y-2">
                    {((formData.leadMetadata as any)?.proposals || []).map((p: ProposalRecord) => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">{p.packageName}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.serviceType} · {p.invoiceNumber} · Signed {format(new Date(p.signedAt), "dd MMM yyyy HH:mm")}
                          </div>
                          {p.clientAddress && (
                            <div className="text-xs text-muted-foreground">Address: {p.clientAddress}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => {
                              const clientEmail = formData.email || "";
                              const clientName = formData.name || "Client";
                              const serviceLabels: Record<string, string> = {
                                VA: "Virtual Assistant",
                                VR: "Call Answering",
                                CL: "Call Answering (Clinic)",
                                CB: "Call Answering (Bookings)",
                                AI: "AI Call Handling",
                                DT: "Digital Typing",
                              };
                              const serviceLabel = serviceLabels[p.serviceType] || p.serviceType;
                              const subject = encodeURIComponent(`Your ${serviceLabel} Service Proposal – ${p.packageName}`);
                              const body = encodeURIComponent(
                                `Dear ${clientName},\n\n` +
                                `Thank you for choosing our ${serviceLabel} Service.\n\n` +
                                `Here is a summary of your proposal:\n\n` +
                                `Package: ${p.packageName}\n` +
                                `Service: ${serviceLabel}\n` +
                                `Invoice: ${p.invoiceNumber}\n` +
                                `Price: £${p.packagePrice.toFixed(2)}\n` +
                                `Signed: ${format(new Date(p.signedAt), "dd MMM yyyy 'at' HH:mm")}\n` +
                                (p.clientAddress ? `Address: ${p.clientAddress}\n` : "") +
                                `\nIf you have any questions, please don't hesitate to get in touch.\n\n` +
                                `Kind regards,\nThe VA Team`
                              );
                              window.open(`mailto:${clientEmail}?subject=${subject}&body=${body}`, "_blank");
                            }}
                          >
                            <Send className="h-3.5 w-3.5" /> Send to Client
                          </Button>
                          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
                            {p.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <VAPackageProposalDialog 
                open={showVAProposal} 
                onOpenChange={setShowVAProposal}
                initialData={proposalInitialData}
                onPackageSelected={(pkg, proposal) => {
                  handleChange("vaPackage", pkg.name);
                  handleChange("vaPackagedHours", pkg.packagedHours);
                  handleChange("vaHourlyOverageRate", pkg.hourlyOverageRate);
                  if (!(formData.services || []).includes("Virtual Assistant Service")) {
                    handleChange("services", [...(formData.services || []), "Virtual Assistant Service"]);
                  }
                  appendProposalAndSave(proposal);
                }}
              />
              <VRPackageProposalDialog
                open={showVRProposal}
                onOpenChange={setShowVRProposal}
                initialData={proposalInitialData}
                onPackageSelected={(pkg, proposal) => {
                  handleChange("vrPackage", pkg.name);
                  handleChange("vrPrice", pkg.price);
                  handleChange("vrIncludedMinutes", pkg.minutes);
                  handleChange("vrOverageRate", pkg.overage);
                  if (!(formData.services || []).includes("Call Answering Service")) {
                    handleChange("services", [...(formData.services || []), "Call Answering Service"]);
                  }
                  appendProposalAndSave(proposal);
                }}
              />
              <AIPackageProposalDialog
                open={showAIProposal}
                onOpenChange={setShowAIProposal}
                initialData={proposalInitialData}
                onPackageSelected={(pkg, proposal) => {
                  handleChange("aiPackage", pkg.name);
                  handleChange("aiSetupFee", pkg.aiSetupFee);
                  handleChange("aiMonthlyFee", pkg.aiMonthlyFee);
                  handleChange("aiCallsAllocated", pkg.aiCallsAllocated);
                  if (!(formData.services || []).includes("AI Call Handling Service")) {
                    handleChange("services", [...(formData.services || []), "AI Call Handling Service"]);
                  }
                  appendProposalAndSave(proposal);
                }}
              />
              <DTPackageProposalDialog
                open={showDTProposal}
                onOpenChange={setShowDTProposal}
                initialData={proposalInitialData}
                onPackageSelected={(pkg, proposal) => {
                  handleChange("dtPackage", pkg.name);
                  handleChange("dtPricePerMinute", pkg.digitalPricePerMinute);
                  if (!(formData.services || []).includes("Digital Typing Service")) {
                    handleChange("services", [...(formData.services || []), "Digital Typing Service"]);
                  }
                  appendProposalAndSave(proposal);
                }}
              />
              <CLPackageProposalDialog
                open={showCLProposal}
                onOpenChange={setShowCLProposal}
                initialData={proposalInitialData}
                onPackageSelected={(pkg, proposal) => {
                  handleChange("clPackage", pkg.name);
                  handleChange("clPrice", pkg.price);
                  handleChange("clIncludedMinutes", pkg.minutes);
                  handleChange("clOverageRate", pkg.overage);
                  if (!(formData.services || []).includes("Call Answering Service (Clinic)")) {
                    handleChange("services", [...(formData.services || []), "Call Answering Service (Clinic)"]);
                  }
                  appendProposalAndSave(proposal);
                }}
              />
              <CBPackageProposalDialog
                open={showCBProposal}
                onOpenChange={setShowCBProposal}
                initialData={proposalInitialData}
                onPackageSelected={(pkg, proposal) => {
                  handleChange("cbPackage" as any, pkg.name);
                  handleChange("cbPrice" as any, pkg.price);
                  handleChange("cbIncludedMinutes" as any, pkg.minutes);
                  handleChange("cbOverageRate" as any, pkg.overage);
                  if (!(formData.services || []).includes("Call Answering Service (Bookings)")) {
                    handleChange("services", [...(formData.services || []), "Call Answering Service (Bookings)"]);
                  }
                  appendProposalAndSave(proposal);
                }}
              />
            </TabsContent>

            <TabsContent value="contacts" className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <Label>Contacts</Label>
                  <p className="text-xs text-muted-foreground">Manage customer contact information</p>
                </div>
                <Button type="button" onClick={addContact} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </div>
              
              {/* Contact List View */}
              <div className="space-y-3">
                {(formData.contacts || []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No contacts added yet</p>
                    <p className="text-sm">Click "Add Contact" to get started</p>
                  </div>
                ) : (
                  (formData.contacts || [])
                    .filter(contact => {
                      // Hide contacts marked as hidden
                      if (contact.hidden) return false;
                      // Only hide contacts if they have a valid until date that is past today
                      if (contact.oooUntilDate && 
                          contact.oooUntilDate instanceof Date && 
                          !isNaN(contact.oooUntilDate.getTime()) && 
                          contact.oooUntilDate < new Date()) {
                        return false;
                      }
                      return true;
                    })
                    .map((contact, index) => (
                    <Card key={contact.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div>
                              <h4 className="font-medium text-sm">
                                {contact.firstName} {contact.surname}
                              </h4>
                              {contact.position && (
                                <p className="text-sm text-muted-foreground">{contact.position}</p>
                              )}
                              {contact.company && (
                                <p className="text-xs text-muted-foreground">{contact.company}</p>
                              )}
                            </div>
                          </div>
                           <div className="flex items-center gap-4 mt-2">
                             {contact.mobile && (
                               <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                 <Phone className="h-3 w-3" />
                                 {contact.mobile}
                               </div>
                             )}
                             {contact.email && (
                               <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                 <Mail className="h-3 w-3" />
                                 {contact.email}
                               </div>
                             )}
                           </div>
                           {/* OOO Information Display - Debug and show OOO data if it exists */}
                           {(() => {
                             console.log('🔍 Contact OOO check:', {
                               name: `${contact.firstName} ${contact.surname}`,
                               oooReason: contact.oooReason,
                               oooFromDate: contact.oooFromDate,
                               oooUntilDate: contact.oooUntilDate,
                               hasAnyOOO: !!(contact.oooReason || contact.oooFromDate || contact.oooUntilDate)
                             });
                             return (contact.oooReason || contact.oooFromDate || contact.oooUntilDate) ? (
                               <div className="mt-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                                 <div className="flex items-start justify-between">
                                   <div className="flex-1">
                                     <div className="text-sm font-medium text-red-700 dark:text-red-300">
                                       Out of Office: {contact.oooReason || 'Not specified'}
                                     </div>
                                     <div className="text-xs text-red-600 dark:text-red-400">
                                        {contact.oooFromDate && contact.oooUntilDate ? (
                                          <>
                                            {format(new Date(contact.oooFromDate), "dd/MM/yyyy")} - {format(new Date(contact.oooUntilDate), "dd/MM/yyyy")}
                                          </>
                                        ) : (
                                          'Dates not specified'
                                        )}
                                     </div>
                                   </div>
                                   <div className="flex gap-1 ml-2">
                                     <Button
                                       type="button"
                                       variant="ghost"
                                       size="sm"
                                       onClick={() => editContact(index)}
                                       className="h-7 w-7 p-0 text-red-600 hover:text-red-800 hover:bg-red-100 dark:text-red-400 dark:hover:text-red-200 dark:hover:bg-red-900/30"
                                       title="Edit OOO Information"
                                     >
                                       <Edit className="h-3 w-3" />
                                     </Button>
                                     <Button
                                       type="button"
                                       variant="ghost"
                                       size="sm"
                                       onClick={() => {
                                         // Clear OOO information only
                                         const contacts = [...(formData.contacts || [])];
                                         if (contacts[index]) {
                                           contacts[index] = {
                                             ...contacts[index],
                                             oooReason: "",
                                             oooFromDate: undefined,
                                             oooUntilDate: undefined
                                           };
                                           handleChange('contacts', contacts);
                                         }
                                       }}
                                       className="h-7 w-7 p-0 text-red-600 hover:text-red-800 hover:bg-red-100 dark:text-red-400 dark:hover:text-red-200 dark:hover:bg-red-900/30"
                                       title="Delete OOO Information"
                                     >
                                       <Trash2 className="h-3 w-3" />
                                     </Button>
                                   </div>
                                 </div>
                               </div>
                             ) : null;
                           })()}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => editContact(index)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeContact(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>

              {/* Contact Edit Form */}
              {editingContact && (
                <Card className="p-4 border-primary/50 bg-primary/5">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">
                        {editingContactIndex === -1 ? 'Add New Contact' : 'Edit Contact'}
                      </h4>
                      <div className="flex gap-2">
                        <Button type="button" onClick={saveContact} size="sm">
                          Save
                        </Button>
                        <Button type="button" onClick={cancelContactEdit} size="sm" variant="outline">
                          Cancel
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>First Name</Label>
                        <Input
                          maxLength={50}
                          value={editingContact.firstName}
                          onChange={(e) => updateEditingContact('firstName', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Surname</Label>
                        <Input
                          maxLength={50}
                          value={editingContact.surname}
                          onChange={(e) => updateEditingContact('surname', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Position</Label>
                        <Input
                          maxLength={50}
                          value={editingContact.position}
                          onChange={(e) => updateEditingContact('position', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Company</Label>
                        <Select 
                          value={editingContact.company} 
                          onValueChange={(value) => updateEditingContact('company', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select company" />
                          </SelectTrigger>
                          <SelectContent>
                            {customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.name}>
                                {customer.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Mobile</Label>
                        <Input
                          type="tel"
                          maxLength={25}
                          value={editingContact.mobile}
                          onChange={(e) => updateEditingContact('mobile', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          maxLength={50}
                          value={editingContact.email}
                          onChange={(e) => updateEditingContact('email', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* OOO Reason Section */}
                    <div className="space-y-4 pt-4 border-t">
                      <h5 className="font-medium text-sm">Out of Office (OOO) Information</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>OOO Reason</Label>
                          <Select
                            value={editingContact.oooReason || ""}
                            onValueChange={(value) => updateEditingContact('oooReason', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select reason" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Holiday">Holiday</SelectItem>
                              <SelectItem value="Maternity Leave">Maternity Leave</SelectItem>
                              <SelectItem value="Paternity Leave">Paternity Leave</SelectItem>
                              <SelectItem value="Compassionate Leave">Compassionate Leave</SelectItem>
                              <SelectItem value="Leaving the Business">Leaving the Business</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>From Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !editingContact.oooFromDate && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {editingContact.oooFromDate ? format(editingContact.oooFromDate, "dd/MM/yyyy") : "Pick date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={editingContact.oooFromDate}
                                onSelect={(date) => updateEditingContact('oooFromDate', date)}
                                initialFocus
                                className="pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-2">
                          <Label>Until Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !editingContact.oooUntilDate && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {editingContact.oooUntilDate ? format(editingContact.oooUntilDate, "dd/MM/yyyy") : "Pick date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={editingContact.oooUntilDate}
                                onSelect={(date) => updateEditingContact('oooUntilDate', date)}
                                initialFocus
                                className="pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      {/* Hide Contact Option */}
                      <div className="flex items-center space-x-2 pt-4 border-t">
                        <Checkbox
                          id="hide-contact"
                          checked={editingContact.hidden || false}
                          onCheckedChange={(checked) => updateEditingContact('hidden', !!checked)}
                        />
                        <Label htmlFor="hide-contact" className="text-sm font-normal cursor-pointer">
                          Hide this contact (remove from view without deleting)
                        </Label>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="location" className="space-y-4">
              <MultiLocationManager
                locations={formData.locations || []}
                customerName={formData.name || "Customer"}
                onLocationsChange={(locations) => handleChange("locations", locations)}
              />
            </TabsContent>

            <TabsContent value="systems" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="systemLink">System Link</Label>
                <Input
                  id="systemLink"
                  type="url"
                  value={formData.systemLink || ""}
                  onChange={(e) => handleChange("systemLink", e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="systemIcon">System Icon</Label>
                <Input
                  id="systemIcon"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        handleChange("systemIcon", event.target?.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                {formData.systemIcon && (
                  <div className="mt-2">
                    <img 
                      src={formData.systemIcon} 
                      alt="System icon preview" 
                      className="w-12 h-12 object-contain border rounded"
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="script" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="script">Customer Script</Label>
                    <div className="flex items-center gap-2">
                      {initialData?.id && (
                        <ScriptImportHistory
                          customerId={initialData.id}
                          customerName={formData.name}
                        />
                      )}
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowScriptImport(true)}>
                        <Wand2 className="h-4 w-4 mr-2" />
                        Import / Generate
                      </Button>
                    </div>
                  </div>
                  <RichTextEditor
                    value={formData.script || ""}
                    onChange={(value) => handleChange("script", value)}
                    placeholder="Enter notes, scripts, or instructions specific to this customer..."
                    minHeight="400px"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use this area to store formatted notes, scripts, or instructions specific to this customer. 
                    You can add headings, bold text, lists, and other formatting.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Live Preview (operator view)</Label>
                    <span className="text-xs text-muted-foreground">
                      Updates as you type — matches the Quick Script modal exactly.
                    </span>
                  </div>
                  <ScriptPreview html={formData.script || ""} maxHeight="50vh" />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <Label>Script Tags</Label>
                      <p className="text-xs text-muted-foreground">Create quick navigation tags for important sections in the script</p>
                    </div>
                    <Button type="button" onClick={addScriptTag} size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Tag
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {(formData.scriptTags || []).map((tag, index) => (
                      <Card key={index} className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <Label className="text-sm">Tag Name</Label>
                            <Input
                              placeholder="e.g. Cancellation, Pricing, Insurance"
                              value={tag.name}
                              onChange={(e) => updateScriptTag(index, 'name', e.target.value)}
                            />
                          </div>
                          <div className="flex-1">
                            <Label className="text-sm">Search Text</Label>
                            <Input
                              placeholder="Text to search for in script"
                              value={tag.searchText}
                              onChange={(e) => updateScriptTag(index, 'searchText', e.target.value)}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeScriptTag(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {tabs.includes('forms') && (
              <TabsContent value="forms" className="space-y-4">
                <CustomerFormsTab
                  customerId={initialData?.id}
                  customerName={formData.name}
                  onGenerateScript={(submissionId) => {
                    setScriptImportSubmissionId(submissionId);
                    setShowScriptImport(true);
                    setActiveTab("script");
                  }}
                />
              </TabsContent>
            )}
          </Tabs>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Close
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : `${initialData ? "Update" : "Add"} Customer`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

      {/* Proposal Link Dialog */}
      <Dialog open={proposalLinkDialog.open} onOpenChange={(open) => setProposalLinkDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="h-5 w-5 text-primary" />
              {proposalLinkDialog.serviceType} Proposal Link
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your proposal link has been generated. Copy it below and paste it into your email to send to the client.
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={proposalLinkDialog.url}
                className="font-mono text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                size="sm"
                variant={linkCopied ? "default" : "outline"}
                className="shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(proposalLinkDialog.url);
                  setLinkCopied(true);
                  toast({ title: "Copied!", description: "Proposal link copied to clipboard." });
                  setTimeout(() => setLinkCopied(false), 3000);
                }}
              >
                {linkCopied ? <><Check className="h-4 w-4 mr-1" /> Copied</> : <><Copy className="h-4 w-4 mr-1" /> Copy</>}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This link is valid for 30 days. When the client selects a package it will automatically sync back to the system.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <ScriptImportDialog
        open={showScriptImport}
        onOpenChange={(open) => {
          setShowScriptImport(open);
          if (!open) setScriptImportSubmissionId(undefined);
        }}
        customer={{ ...(initialData as any), ...formData } as any}
        existingScript={formData.script || ""}
        initialSubmissionId={scriptImportSubmissionId}
        onApply={(html, customerUpdates) => {
          handleChange("script", html);
          if (customerUpdates) {
            for (const [k, v] of Object.entries(customerUpdates)) {
              if (v && v.toString().trim()) handleChange(k as any, v);
            }
          }
        }}
      />
    </>
  );
}