// Updated CustomersContext with Supabase database persistence
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { secureLog } from '@/lib/secureLogger';
import { useAuth } from '@/context/AuthContext';
import { asPromise } from '@/lib/supabaseRpc';

export type CustomerContact = {
  id: string;
  firstName: string;
  surname: string;
  position: string;
  company: string;
  mobile: string;
  email: string;
  oooReason?: string;
  oooFromDate?: Date;
  oooUntilDate?: Date;
  hidden?: boolean;
};

export type Customer = {
  id: string;
  // Details tab
  name: string;
  businessType: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  tel: string;
  mobile: string;
  email: string;
  website: string;
  status: 'Active' | 'Paused' | 'Lead' | 'Lost';
  
  // CRM Lead metadata (only for status='Lead')
  leadMetadata?: {
    source?: string;
    pipelineStatus?: string;
    value?: number;
    lastContact?: string;
    notes?: string;
    heardAboutUs?: string;
    enquiryYear?: number;
  } | null;
  
  // Legacy fields for compatibility
  contact: string;
  phone: string;
  
  // Billing tab
  callsPerMonth: string;
  billingDay: Date | null;
  billingOptions: 'VAT' | 'Tax Exempt';
  billingStatus: string[];
  additionalServices: string[];
  callHandlingTier: string;
  
  // New billing fields
  services: string[];
  virtualAssistantPlan: string;
  callAnsweringPlan: string;
  packages: string;
  
  // Package-specific fields
  vaPackage: string;
  vaPackagedHours: number;
  vaHourlyOverageRate: number;
  vaPrice: number;
  vrPackage: string;
  vrPrice: number;
  vrIncludedMinutes: number;
  vrOverageRate: number;
  aiPackage: string;
  aiSetupFee: number;
  aiMonthlyFee: number;
  aiCallsAllocated: number;
  dtPackage: string;
  dtPricePerMinute: number;
  clPackage: string;
  clPrice: number;
  clIncludedMinutes: number;
  clOverageRate: number;
  cbPackage: string;
  cbPrice: number;
  cbIncludedMinutes: number;
  cbOverageRate: number;

  // Unified internal billing — Call Answering Package (drives internal invoices)
  callPackageName: string;
  callBaseAllowance: number;
  callIncludedMinutes: number;
  callMonthlyCharge: number;
  callRatePerCall: number;
  callRatePerMinute: number;
  callRateSms: number;
  callRateTransferLandline: number;
  callRateTransferMobile: number;
  callBillingUnit: 'per_call' | 'per_minute';
  directDialNumber: boolean;
  vatRate: number;
  
  // Contacts tab
  contacts: CustomerContact[];
  
  // Location tab
  address: string;
  locations: Array<{
    id: string;
    name: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    postcode: string;
    notes?: string;
    coordinates?: { lat: number; lng: number };
    google_maps_url?: string;
  }>;
  
  // Outcomes tab
  outcomeHow: string;
  outcomeWhen: string;
  outcomeFormat: string;
  messageSelection: string;
  filters: string;
  
  // Systems tab
  systemLink: string;
  systemIcon?: string;
  
  // Script tab
  script: string;
  scriptTags: { name: string; searchText: string; }[];
  hasInboundCallScript: boolean;

  // Account grouping (multiple customers can share one billing account)
  accountId?: string | null;
};

export type CustomerAccount = {
  id: string;
  name: string;
  notes?: string | null;
  createdAt?: string;
};

type ProposalSnapshot = {
  id?: string;
  serviceType?: "VA" | "VR" | "AI" | "DT" | "CL" | "CB";
  packageName?: string;
  signedAt?: string;
  status?: string;
};

interface CustomersContextType {
  customers: Customer[];
  activeCustomers: Customer[];
  leads: Customer[];
  loading: boolean;
  addCustomer: (customer: Omit<Customer, 'id'>, options?: { skipDuplicateCheck?: boolean }) => Promise<{ duplicates?: Array<{ name: string; reasons: string[] | null; score: number }> } | void>;
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<boolean>;
  deleteCustomer: (id: string) => Promise<void>;
  mergeCustomers: (targetId: string, sourceId: string) => void;
  refreshCustomers: () => Promise<void>;
  accounts: CustomerAccount[];
  addAccount: (name: string) => Promise<CustomerAccount | null>;
  refreshAccounts: () => Promise<void>;
}

const CustomersContext = createContext<CustomersContextType | undefined>(undefined);

const LS_KEY = "app.customers";
const LS_BACKUP_KEY = "app.customers.backup";

export function CustomersProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);

  const loadAccounts = useCallback(async () => {
    const { data, error } = await supabase
      .from('customer_accounts')
      .select('id, name, notes, created_at')
      .order('name', { ascending: true });
    if (error) {
      secureLog.debug('Failed to load customer accounts', { error: error.message });
      return;
    }
    setAccounts(
      (data || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        notes: a.notes,
        createdAt: a.created_at,
      }))
    );
  }, []);

  const refreshAccounts = useCallback(async () => {
    await loadAccounts();
  }, [loadAccounts]);

  const addAccount = useCallback(async (name: string): Promise<CustomerAccount | null> => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    // Case-insensitive de-dupe against existing accounts
    const existing = accounts.find(a => a.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const { data, error } = await supabase
      .from('customer_accounts')
      .insert({ name: trimmed })
      .select('id, name, notes, created_at')
      .single();
    if (error) {
      toast({ title: 'Could not create account', description: error.message, variant: 'destructive' });
      return null;
    }
    const created: CustomerAccount = {
      id: data.id, name: data.name, notes: data.notes, createdAt: data.created_at,
    };
    setAccounts(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }, [accounts, toast]);


  const clearCustomerLocalStorage = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_BACKUP_KEY);
  }, []);

  // Extracted load function for reuse
  const loadCustomers = useCallback(async () => {
    secureLog.info('Loading customers from database...');
    
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) {
        secureLog.warn('No authenticated user, loading from localStorage fallback');
        await loadFromLocalStorageFallback();
        return;
      }

      // Use secure function instead of direct table access
      const { data, error }: any = await asPromise(supabase.rpc('get_all_customers_secure'));

      if (error) {
        secureLog.error('Database error', { error: error.message });
        toast({
          title: "Database Error",
          description: "Failed to load customers from database.",
          variant: "destructive",
        });
        setCustomers([]);
        return;
      }

      if (data && data.length > 0) {
        secureLog.info('Processing customers from database', { count: data.length });
        const formattedCustomers = data.map((customer: any) => convertDatabaseToCustomer(customer));
        setCustomers(formattedCustomers);
        saveToLocalStorage(formattedCustomers);
        secureLog.info('Successfully loaded customers from database', { count: formattedCustomers.length });
      } else {
        secureLog.info('No customers found in database, clearing local customer cache');
        clearCustomerLocalStorage();
        setCustomers([]);
      }
    } catch (error) {
      secureLog.error('Error loading customers', { error: error.message });
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [clearCustomerLocalStorage, toast]);

  // Reload customers whenever the authenticated user changes (login/logout)
  useEffect(() => {
    if (user) {
      loadCustomers();
      loadAccounts();
    } else {
      setCustomers([]);
      setAccounts([]);
      setLoading(false);
    }
  }, [user, loadCustomers, loadAccounts]);

  const refreshCustomers = useCallback(async () => {
    await loadCustomers();
  }, [loadCustomers]);

  const loadFromLocalStorageFallback = async () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw && raw !== 'undefined' && raw !== 'null') {
        const parsed = JSON.parse(raw) as Customer[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const customers = parsed.map(customer => ({
            ...customer,
            billingDay: customer.billingDay ? new Date(customer.billingDay) : null,
            contacts: customer.contacts?.map(contact => ({
              ...contact,
              oooFromDate: contact.oooFromDate ? new Date(contact.oooFromDate) : undefined,
              oooUntilDate: contact.oooUntilDate ? new Date(contact.oooUntilDate) : undefined
            })) || []
          }));
          setCustomers(customers);
          
          // Migrate to database if user is authenticated
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            secureLog.debug('Migrating localStorage customers to database');
            await migrateCustomersToDatabase(customers);
          }
          
          secureLog.debug('Loaded customers from localStorage', { count: customers.length });
          return;
        }
      }
      
      // Try backup
      const backup = localStorage.getItem(LS_BACKUP_KEY);
      if (backup && backup !== 'undefined' && backup !== 'null') {
        const parsedBackup = JSON.parse(backup) as Customer[];
        if (Array.isArray(parsedBackup) && parsedBackup.length > 0) {
          const customers = parsedBackup.map(customer => ({
            ...customer,
            billingDay: customer.billingDay ? new Date(customer.billingDay) : null,
            contacts: customer.contacts?.map(contact => ({
              ...contact,
              oooFromDate: contact.oooFromDate ? new Date(contact.oooFromDate) : undefined,
              oooUntilDate: contact.oooUntilDate ? new Date(contact.oooUntilDate) : undefined
            })) || []
          }));
          setCustomers(customers);
          localStorage.setItem(LS_KEY, JSON.stringify(parsedBackup));
          secureLog.debug('Recovered customers from backup', { count: customers.length });
          return;
        }
      }
    } catch (error) {
      console.error('❌ Error loading localStorage data:', error);
    }
  };

  const convertDatabaseToCustomer = (dbCustomer: any): Customer => {
    secureLog.debug('Converting DB customer to app format', { name: dbCustomer.name });
    
    const convertedCustomer = {
      id: dbCustomer.id,
      name: dbCustomer.name || '',
      businessType: dbCustomer.business_type || '',
      addressLine1: dbCustomer.address_line1 || '',
      addressLine2: dbCustomer.address_line2 || '',
      city: dbCustomer.city || '',
      postcode: dbCustomer.postcode || '',
      tel: dbCustomer.tel || '',
      mobile: dbCustomer.mobile || '',
      email: dbCustomer.email || '',
      website: dbCustomer.website || '',
      status: (dbCustomer.status as 'Active' | 'Paused' | 'Lead' | 'Lost') || 'Active',
      leadMetadata: dbCustomer.lead_metadata || null,
      contact: dbCustomer.contact || '',
      phone: dbCustomer.phone || '',
      callsPerMonth: dbCustomer.calls_per_month || '',
      billingDay: dbCustomer.billing_day ? new Date(dbCustomer.billing_day) : null,
      billingOptions: (dbCustomer.billing_options as 'VAT' | 'Tax Exempt') || 'VAT',
      billingStatus: Array.isArray(dbCustomer.billing_status) ? dbCustomer.billing_status : [],
      additionalServices: Array.isArray(dbCustomer.additional_services) ? dbCustomer.additional_services : [],
      callHandlingTier: dbCustomer.call_handling_tier || '',
      contacts: Array.isArray(dbCustomer.contacts) ? dbCustomer.contacts.map((contact: any) => ({
        ...contact,
        oooFromDate: contact.oooFromDate ? new Date(contact.oooFromDate) : undefined,
        oooUntilDate: contact.oooUntilDate ? new Date(contact.oooUntilDate) : undefined
      })) : [],
      address: dbCustomer.address || '',
      locations: Array.isArray(dbCustomer.locations) ? dbCustomer.locations : [],
      outcomeHow: dbCustomer.outcome_how || '',
      outcomeWhen: dbCustomer.outcome_when || '',
      outcomeFormat: dbCustomer.outcome_format || '',
      messageSelection: dbCustomer.message_selection || '',
      filters: dbCustomer.filters || '',
      systemLink: dbCustomer.system_link || '',
      systemIcon: dbCustomer.system_icon || '',
      script: dbCustomer.script || '',
      scriptTags: Array.isArray(dbCustomer.script_tags) ? dbCustomer.script_tags : [],
      hasInboundCallScript: dbCustomer.has_inbound_call_script ?? true,
      
      // New billing fields
      services: Array.isArray(dbCustomer.services) ? dbCustomer.services : [],
      virtualAssistantPlan: dbCustomer.virtual_assistant_plan || '',
      callAnsweringPlan: dbCustomer.call_answering_plan || '',
      packages: dbCustomer.packages || '',
      
      // Package-specific fields
      vaPackage: dbCustomer.va_package || '',
      vaPackagedHours: dbCustomer.va_packaged_hours || 0,
      vaHourlyOverageRate: dbCustomer.va_hourly_overage_rate || 0,
      vaPrice: dbCustomer.va_price || 0,
      vrPackage: dbCustomer.vr_package || '',
      vrPrice: dbCustomer.vr_price || 0,
      vrIncludedMinutes: dbCustomer.vr_included_minutes || 0,
      vrOverageRate: dbCustomer.vr_overage_rate || 0,
      aiPackage: dbCustomer.ai_package || '',
      aiSetupFee: dbCustomer.ai_setup_fee || 0,
      aiMonthlyFee: dbCustomer.ai_monthly_fee || 0,
      aiCallsAllocated: dbCustomer.ai_calls_allocated || 0,
      dtPackage: dbCustomer.dt_package || '',
      dtPricePerMinute: dbCustomer.dt_price_per_minute || 0,
      clPackage: dbCustomer.cl_package || '',
      clPrice: dbCustomer.cl_price || 0,
      clIncludedMinutes: dbCustomer.cl_included_minutes || 0,
      clOverageRate: dbCustomer.cl_overage_rate || 0,
      cbPackage: (dbCustomer as any).cb_package || '',
      cbPrice: (dbCustomer as any).cb_price || 0,
      cbIncludedMinutes: (dbCustomer as any).cb_included_minutes || 0,
      cbOverageRate: (dbCustomer as any).cb_overage_rate || 0,

      // Unified internal billing — Call Answering Package
      callPackageName: dbCustomer.call_package_name || '',
      callBaseAllowance: dbCustomer.call_base_allowance || 0,
      callIncludedMinutes: dbCustomer.call_included_minutes || 0,
      callMonthlyCharge: dbCustomer.call_monthly_charge || 0,
      callRatePerCall: dbCustomer.call_rate_per_call || 0,
      callRatePerMinute: dbCustomer.call_rate_per_minute || 0,
      callRateSms: dbCustomer.call_rate_sms || 0,
      callRateTransferLandline: dbCustomer.call_rate_transfer_landline || 0,
      callRateTransferMobile: dbCustomer.call_rate_transfer_mobile || 0,
      callBillingUnit: (dbCustomer.call_billing_unit as 'per_call' | 'per_minute') || 'per_call',
      directDialNumber: (dbCustomer as any).direct_dial_number ?? false,
      vatRate: dbCustomer.vat_rate ?? 0.20,
      accountId: dbCustomer.account_id ?? null,
    };
    
    secureLog.debug('Converted customer from database', { name: convertedCustomer.name });
    
    return convertedCustomer;
  };

  const isValidUUID = (id: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  const ensureValidUUID = (customer: Customer): Customer => {
    if (!isValidUUID(customer.id)) {
      secureLog.debug('Converting customer ID to UUID');
      return {
        ...customer,
        id: crypto.randomUUID()
      };
    }
    return customer;
  };

  const convertCustomerToDatabase = (customer: Customer) => {
    secureLog.debug('Converting customer to database format', { hasContacts: !!customer.contacts?.length });
    const dbCustomer = {
      id: customer.id,
      name: customer.name,
      business_type: customer.businessType,
      address_line1: customer.addressLine1,
      address_line2: customer.addressLine2,
      city: customer.city,
      postcode: customer.postcode,
      tel: customer.tel,
      mobile: customer.mobile,
      email: customer.email,
      website: customer.website,
      status: customer.status,
      contact: customer.contact,
      phone: customer.phone,
      calls_per_month: customer.callsPerMonth,
      billing_day: customer.billingDay ? customer.billingDay.toISOString().split('T')[0] : null,
      billing_options: customer.billingOptions,
      billing_status: customer.billingStatus,
      additional_services: customer.additionalServices,
      call_handling_tier: customer.callHandlingTier,
      contacts: customer.contacts.map(contact => {
        const dbContact = {
          ...contact,
          oooFromDate: contact.oooFromDate && contact.oooFromDate instanceof Date 
            ? contact.oooFromDate.toISOString() 
            : undefined,
          oooUntilDate: contact.oooUntilDate && contact.oooUntilDate instanceof Date 
            ? contact.oooUntilDate.toISOString() 
            : undefined
        };
        secureLog.debug('Converting contact to DB format');
        return dbContact;
      }),
      address: customer.address,
      locations: customer.locations,
      outcome_how: customer.outcomeHow,
      outcome_when: customer.outcomeWhen,
      outcome_format: customer.outcomeFormat,
      message_selection: customer.messageSelection,
      filters: customer.filters,
      system_link: customer.systemLink,
      system_icon: customer.systemIcon,
      script: customer.script,
      script_tags: customer.scriptTags,
      has_inbound_call_script: customer.hasInboundCallScript ?? true,
      
      // New billing fields
      services: customer.services,
      virtual_assistant_plan: customer.virtualAssistantPlan,
      call_answering_plan: customer.callAnsweringPlan,
      packages: customer.packages,
      
      // Package-specific fields
      va_package: customer.vaPackage,
      va_packaged_hours: customer.vaPackagedHours,
      va_hourly_overage_rate: customer.vaHourlyOverageRate,
      va_price: customer.vaPrice,
      vr_package: customer.vrPackage,
      vr_price: customer.vrPrice,
      vr_included_minutes: customer.vrIncludedMinutes,
      vr_overage_rate: customer.vrOverageRate,
      ai_package: customer.aiPackage,
      ai_setup_fee: customer.aiSetupFee,
      ai_monthly_fee: customer.aiMonthlyFee,
      ai_calls_allocated: customer.aiCallsAllocated,
      dt_package: customer.dtPackage,
      dt_price_per_minute: customer.dtPricePerMinute,
      cl_package: customer.clPackage,
      cl_price: customer.clPrice,
      cl_included_minutes: customer.clIncludedMinutes,
      cl_overage_rate: customer.clOverageRate,
      cb_package: customer.cbPackage,
      cb_price: customer.cbPrice,
      cb_included_minutes: customer.cbIncludedMinutes,
      cb_overage_rate: customer.cbOverageRate,
      // Unified internal billing — Call Answering Package
      call_package_name: customer.callPackageName || null,
      call_base_allowance: customer.callBaseAllowance ?? 0,
      call_included_minutes: customer.callIncludedMinutes ?? 0,
      call_monthly_charge: customer.callMonthlyCharge ?? 0,
      call_rate_per_call: customer.callRatePerCall ?? 0,
      call_rate_per_minute: customer.callRatePerMinute ?? 0,
      call_rate_sms: customer.callRateSms ?? 0,
      call_rate_transfer_landline: customer.callRateTransferLandline ?? 0,
      call_rate_transfer_mobile: customer.callRateTransferMobile ?? 0,
      call_billing_unit: customer.callBillingUnit || 'per_call',
      direct_dial_number: customer.directDialNumber ?? false,
      vat_rate: customer.vatRate ?? 0.20,
      lead_metadata: customer.leadMetadata || null,
      account_id: customer.accountId ?? null,
    };
    return dbCustomer;
  };

  const saveScriptToDatabase = async (customerId: string, script?: string, scriptTags?: { name: string; searchText: string }[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase.rpc('update_customer_script', {
        p_id: customerId,
        p_script: script ?? null,
        p_script_tags: scriptTags ? JSON.parse(JSON.stringify(scriptTags)) : null,
      });

      if (error) {
        console.error('❌ Script save error:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('❌ Script save exception:', err);
      return false;
    }
  };

  const saveLeadMetadataToDatabase = async (customerId: string, status?: string, leadMetadata?: Customer['leadMetadata']) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase.rpc('update_customer_lead_metadata' as any, {
        p_id: customerId,
        p_status: status ?? null,
        p_lead_metadata: leadMetadata ? JSON.parse(JSON.stringify(leadMetadata)) : null,
      });

      if (error) {
        console.error('❌ Lead metadata save error:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('❌ Lead metadata save exception:', err);
      return false;
    }
  };

  const fetchLatestCustomerFromDatabase = async (customerId: string): Promise<Customer | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase.rpc('get_all_customers_secure');
      if (error || !data) {
        console.error('❌ Failed to fetch latest customer snapshot:', error);
        return null;
      }

      const latestCustomer = (data as any[]).find((customer) => customer.id === customerId);
      return latestCustomer ? convertDatabaseToCustomer(latestCustomer) : null;
    } catch (error) {
      console.error('❌ Error fetching latest customer snapshot:', error);
      return null;
    }
  };

  const getProposalRecords = (leadMetadata?: Customer['leadMetadata'] | null): ProposalSnapshot[] => {
    const proposals = (leadMetadata as any)?.proposals;
    return Array.isArray(proposals) ? proposals : [];
  };

  const mergeProposalRecords = (current?: Customer['leadMetadata'] | null, incoming?: Customer['leadMetadata'] | null) => {
    const merged = new Map<string, ProposalSnapshot>();

    [...getProposalRecords(current), ...getProposalRecords(incoming)].forEach((proposal, index) => {
      const key = proposal.id || `${proposal.serviceType || 'unknown'}-${proposal.signedAt || index}`;
      const existing = merged.get(key);
      const existingSignedAt = existing?.signedAt ? new Date(existing.signedAt).getTime() : 0;
      const proposalSignedAt = proposal?.signedAt ? new Date(proposal.signedAt).getTime() : 0;

      if (!existing || proposalSignedAt >= existingSignedAt) {
        merged.set(key, proposal);
      }
    });

    return Array.from(merged.values()).sort((a, b) => {
      const aTime = a.signedAt ? new Date(a.signedAt).getTime() : 0;
      const bTime = b.signedAt ? new Date(b.signedAt).getTime() : 0;
      return bTime - aTime;
    });
  };

  const mergeLeadMetadataPreservingProposals = (
    current?: Customer['leadMetadata'] | null,
    incoming?: Customer['leadMetadata'] | null,
  ) => {
    if (!current && !incoming) return null;

    const mergedProposals = mergeProposalRecords(current, incoming);
    const mergedMetadata = {
      ...(current || {}),
      ...(incoming || {}),
    } as Record<string, any>;

    if (mergedProposals.length > 0) {
      mergedMetadata.proposals = mergedProposals;
    }

    return mergedMetadata as Customer['leadMetadata'];
  };

  const preserveProposalDrivenFields = (incoming: Customer, latestRemote: Customer | null): Customer => {
    if (!latestRemote) return incoming;

    const latestProposals = getProposalRecords(latestRemote.leadMetadata);
    const incomingProposals = getProposalRecords(incoming.leadMetadata);

    const incomingProposalIds = new Set(
      incomingProposals.map((proposal, index) => proposal.id || `${proposal.serviceType || 'unknown'}-${proposal.signedAt || index}`)
    );

    const hasNewerRemoteProposalForService = (serviceType: ProposalSnapshot['serviceType']) =>
      latestProposals.some((proposal, index) => {
        const key = proposal.id || `${proposal.serviceType || 'unknown'}-${proposal.signedAt || index}`;
        return proposal.serviceType === serviceType && !incomingProposalIds.has(key);
      });

    const mergedCustomer: Customer = {
      ...incoming,
      leadMetadata: mergeLeadMetadataPreservingProposals(latestRemote.leadMetadata, incoming.leadMetadata),
    };

    if (hasNewerRemoteProposalForService('VA')) {
      mergedCustomer.vaPackage = latestRemote.vaPackage;
      mergedCustomer.vaPackagedHours = latestRemote.vaPackagedHours;
      mergedCustomer.vaHourlyOverageRate = latestRemote.vaHourlyOverageRate;
      mergedCustomer.vaPrice = latestRemote.vaPrice;
    }

    if (hasNewerRemoteProposalForService('VR')) {
      mergedCustomer.vrPackage = latestRemote.vrPackage;
      mergedCustomer.vrPrice = latestRemote.vrPrice;
      mergedCustomer.vrIncludedMinutes = latestRemote.vrIncludedMinutes;
      mergedCustomer.vrOverageRate = latestRemote.vrOverageRate;
    }

    if (hasNewerRemoteProposalForService('AI')) {
      mergedCustomer.aiPackage = latestRemote.aiPackage;
      mergedCustomer.aiSetupFee = latestRemote.aiSetupFee;
      mergedCustomer.aiMonthlyFee = latestRemote.aiMonthlyFee;
      mergedCustomer.aiCallsAllocated = latestRemote.aiCallsAllocated;
    }

    if (hasNewerRemoteProposalForService('DT')) {
      mergedCustomer.dtPackage = latestRemote.dtPackage;
      mergedCustomer.dtPricePerMinute = latestRemote.dtPricePerMinute;
    }

    return mergedCustomer;
  };

  const saveToDatabase = async (customer: Customer, opts?: { skipDuplicateCheck?: boolean }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('⚠️ No authenticated user, skipping database save');
        return false;
      }

      let customerToPersist = customer;

      if (customer.id && customers.some(c => c.id === customer.id)) {
        const latestRemoteCustomer = await fetchLatestCustomerFromDatabase(customer.id);
        customerToPersist = preserveProposalDrivenFields(customer, latestRemoteCustomer);
      }

      const dbCustomer = convertCustomerToDatabase(customerToPersist);
      
      // Map database field names to function parameters with p_ prefix
      const customerParams = {
        p_name: dbCustomer.name,
        p_business_type: dbCustomer.business_type,
        p_address_line1: dbCustomer.address_line1,
        p_address_line2: dbCustomer.address_line2,
        p_city: dbCustomer.city,
        p_postcode: dbCustomer.postcode,
        p_tel: dbCustomer.tel,
        p_mobile: dbCustomer.mobile,
        p_email: dbCustomer.email,
        p_website: dbCustomer.website,
        p_status: dbCustomer.status,
        p_contact: dbCustomer.contact,
        p_phone: dbCustomer.phone,
        p_calls_per_month: dbCustomer.calls_per_month,
        p_billing_day: dbCustomer.billing_day,
        p_billing_options: dbCustomer.billing_options,
        p_billing_status: dbCustomer.billing_status,
        p_additional_services: dbCustomer.additional_services,
        p_call_handling_tier: dbCustomer.call_handling_tier,
        p_services: dbCustomer.services,
        p_virtual_assistant_plan: dbCustomer.virtual_assistant_plan,
        p_call_answering_plan: dbCustomer.call_answering_plan,
        p_packages: dbCustomer.packages,
        p_contacts: dbCustomer.contacts,
        p_locations: dbCustomer.locations,
        p_outcome_how: dbCustomer.outcome_how,
        p_outcome_when: dbCustomer.outcome_when,
        p_outcome_format: dbCustomer.outcome_format,
        p_message_selection: dbCustomer.message_selection,
        p_filters: dbCustomer.filters,
        p_system_link: dbCustomer.system_link,
        p_system_icon: dbCustomer.system_icon,
        p_script: dbCustomer.script,
        p_script_tags: dbCustomer.script_tags,
        p_va_package: dbCustomer.va_package,
        p_va_packaged_hours: dbCustomer.va_packaged_hours,
        p_va_hourly_overage_rate: dbCustomer.va_hourly_overage_rate,
        p_vr_package: dbCustomer.vr_package,
        p_vr_price: dbCustomer.vr_price,
        p_vr_included_minutes: dbCustomer.vr_included_minutes,
        p_vr_overage_rate: dbCustomer.vr_overage_rate,
        p_ai_package: dbCustomer.ai_package,
        p_ai_setup_fee: dbCustomer.ai_setup_fee,
        p_ai_monthly_fee: dbCustomer.ai_monthly_fee,
        p_ai_calls_allocated: dbCustomer.ai_calls_allocated,
        p_dt_package: dbCustomer.dt_package,
        p_dt_price_per_minute: dbCustomer.dt_price_per_minute,
        p_cl_package: dbCustomer.cl_package,
        p_cl_price: dbCustomer.cl_price,
        p_cl_included_minutes: dbCustomer.cl_included_minutes,
        p_cl_overage_rate: dbCustomer.cl_overage_rate,
        p_va_price: dbCustomer.va_price,
        p_lead_metadata: dbCustomer.lead_metadata ? JSON.parse(JSON.stringify(dbCustomer.lead_metadata)) : null,
        p_account_id: dbCustomer.account_id,
        ...(opts?.skipDuplicateCheck ? { p_skip_duplicate_check: true } : {}),
        // For UPDATE: explicitly clear account_id when null is intended
        ...((dbCustomer.id && customers.some(c => c.id === dbCustomer.id) && dbCustomer.account_id === null)
          ? { p_clear_account: true } : {})
      };

      // Use secure function for database operations
      let result;
      const isUpdate = dbCustomer.id && customers.some(c => c.id === dbCustomer.id);
      if (isUpdate) {
        // Update existing customer
        result = await supabase.rpc('update_customer_secure', {
          p_id: dbCustomer.id,
          ...customerParams
        });
      } else {
        // Add new customer
        result = await supabase.rpc('add_customer_secure', customerParams);
      }
      
      const { error, data } = result as any;

      if (error) {
        console.error('❌ Database save error:', error);
        const msg = (error as any)?.message || '';
        if (msg.includes('DUPLICATE_CUSTOMER')) {
          const friendly = msg.replace(/^.*DUPLICATE_CUSTOMER:\s*/, '');
          toast({
            title: "Duplicate Customer",
            description: friendly || "A customer with the same name or email already exists.",
            variant: "destructive",
          });
          return false;
        }
        toast({
          title: "Save Error",
          description: "Failed to save to database. Data saved locally as backup.",
          variant: "destructive",
        });
        return false;
      }

      // Persist unified-billing call_* fields (not covered by the secure RPC signature)
      const persistedId: string | undefined = isUpdate ? dbCustomer.id : (typeof data === 'string' ? data : undefined);
      if (persistedId) {
        const { error: billingErr } = await supabase
          .from('customers')
          .update({
            call_package_name: dbCustomer.call_package_name,
            call_base_allowance: dbCustomer.call_base_allowance,
            call_included_minutes: dbCustomer.call_included_minutes,
            call_monthly_charge: dbCustomer.call_monthly_charge,
            call_rate_per_call: dbCustomer.call_rate_per_call,
            call_rate_per_minute: dbCustomer.call_rate_per_minute,
            call_rate_sms: dbCustomer.call_rate_sms,
            call_rate_transfer_landline: dbCustomer.call_rate_transfer_landline,
            call_rate_transfer_mobile: dbCustomer.call_rate_transfer_mobile,
            call_billing_unit: dbCustomer.call_billing_unit,
            vat_rate: dbCustomer.vat_rate,
            has_inbound_call_script: dbCustomer.has_inbound_call_script,
          })
          .eq('id', persistedId);
        if (billingErr) {
          console.warn('⚠️ Could not persist unified billing fields:', billingErr.message);
        }
      }

      secureLog.debug('Customer saved to database');
      return true;
    } catch (error) {
      console.error('❌ Error saving to database:', error);
      return false;
    }
  };

  const migrateCustomersToDatabase = async (customers: Customer[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      for (const customer of customers) {
        await saveToDatabase(customer);
      }
      
      toast({
        title: "Migration Complete",
        description: `Successfully migrated ${customers.length} customers to database.`,
      });
    } catch (error) {
      console.error('❌ Migration error:', error);
    }
  };

  const saveToLocalStorage = (customers: Customer[]) => {
    try {
      // Only store minimal non-sensitive data in localStorage
      const minimalCustomers = customers.map(customer => ({
        id: customer.id,
        name: customer.name,
        status: customer.status,
        businessType: customer.businessType,
        callHandlingTier: customer.callHandlingTier,
        // Exclude sensitive data: contacts, scripts, addresses, phone numbers, emails
      }));
      
      const currentData = localStorage.getItem(LS_KEY);
      if (currentData) {
        localStorage.setItem(LS_BACKUP_KEY, currentData);
      }
      localStorage.setItem(LS_KEY, JSON.stringify(minimalCustomers));
    } catch (error) {
      console.error('❌ LocalStorage save error:', error);
    }
  };

  // Auto-save to localStorage as backup (no longer primary storage)
  useEffect(() => {
    if (loading || customers.length === 0) return;
    
    saveToLocalStorage(customers);
  }, [customers, loading]);

  const addCustomer = async (customerData: Omit<Customer, 'id'>, options?: { skipDuplicateCheck?: boolean }) => {
    secureLog.debug('Adding new customer');

    // Server-side fuzzy duplicate detection (name similarity, phone, address, email)
    if (!options?.skipDuplicateCheck) {
    try {
      const { data: matches, error: dupErr } = await supabase.rpc(
        'find_customer_duplicates',
        {
          p_exclude_id: null,
          p_name: customerData.name || '',
          p_email: customerData.email || '',
          p_phone: customerData.tel || customerData.phone || '',
          p_mobile: customerData.mobile || '',
          p_address: [
            customerData.addressLine1,
            customerData.addressLine2,
            customerData.city,
            customerData.postcode,
          ].filter(Boolean).join(' '),
        }
      );
      if (!dupErr && Array.isArray(matches) && matches.length > 0) {
        // Return matches so the caller can show a confirmation dialog
        // ("Continue Anyway") instead of silently blocking the create.
        return { duplicates: matches as Array<{ name: string; reasons: string[] | null; score: number }> };
      }
    } catch (e) {
      // Non-fatal: fall through to insert; the DB trigger is the final guard
      secureLog.debug('Duplicate pre-check failed, relying on DB trigger');
    }
    }

    const newCustomer: Customer = {
      ...customerData,
      id: crypto.randomUUID()
    };

    
    // Save to database first
    const dbSuccess = await saveToDatabase(newCustomer, { skipDuplicateCheck: options?.skipDuplicateCheck });
    
    if (dbSuccess) {
      // Refresh from database to get the server-generated ID
      await loadCustomers();
      secureLog.debug('Customer added and refreshed from database');
    } else {
      // Fallback: add to local state with client-generated ID
      setCustomers(prev => {
        const updated = [newCustomer, ...prev];
        toast({
          title: "Offline Mode",
          description: `${customerData.name} saved locally. Will sync when connection is restored.`,
        });
        return updated;
      });
    }
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    secureLog.debug('Updating customer', { hasUpdates: !!updates });
    const existingCustomer = customers.find((customer) => customer.id === id);

    if (!existingCustomer) {
      console.error(`❌ Customer ${id} not found for update`);
      return false;
    }

    let updatedCustomer = { ...existingCustomer, ...updates };

    if (!isValidUUID(updatedCustomer.id)) {
      secureLog.debug('Converting customer ID to UUID for database compatibility');
      const newId = crypto.randomUUID();
      updatedCustomer = { ...updatedCustomer, id: newId };
    }

    const updateKeys = Object.keys(updates);
    const isScriptOnly = updateKeys.every(k => k === 'script' || k === 'scriptTags');
    const isLeadMetadataOnly = updateKeys.every(k => k === 'leadMetadata' || k === 'status');

    let success = false;
    if (isScriptOnly) {
      success = await saveScriptToDatabase(updatedCustomer.id, updates.script, updates.scriptTags);
    } else if (isLeadMetadataOnly) {
      success = await saveLeadMetadataToDatabase(updatedCustomer.id, updates.status, updates.leadMetadata);
    } else {
      success = await saveToDatabase(updatedCustomer);
    }

    const latestRemoteCustomer = success
      ? await fetchLatestCustomerFromDatabase(updatedCustomer.id)
      : null;

    if (success) {
      setCustomers(prev => prev.map(customer => {
        if (customer.id !== id) return customer;
        return latestRemoteCustomer || updatedCustomer;
      }));
    }

    if (!success) {
      toast({
        title: "Save failed",
        description: "Changes were not saved to the database. A local draft has been kept where available.",
        variant: "destructive",
      });
      console.warn(`⚠️ Customer ${id} update failed`);
      return false;
    }

    console.log(`✅ Customer ${id} updated successfully`);
    return success;
  };

  const deleteCustomer = async (id: string) => {
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) {
        console.error('❌ Database delete error:', error);
        toast({
          title: "Delete Error",
          description: error.message || "Failed to delete customer from database.",
          variant: "destructive",
        });
        return;
      }
    } catch (error) {
      console.error('❌ Error deleting from database:', error);
      return;
    }

    setCustomers(prev => prev.filter(customer => customer.id !== id));
  };


  const mergeCustomers = (targetId: string, sourceId: string) => {
    const target = customers.find(c => c.id === targetId);
    const source = customers.find(c => c.id === sourceId);
    
    if (!target || !source) return;

    // Merge logic: keep target's ID, merge other fields intelligently
    const merged: Customer = {
      ...target,
      id: targetId,
      name: target.name, // Keep target name
      contact: target.contact || source.contact,
      email: target.email || source.email,
      phone: target.phone || source.phone,
      tel: target.tel || source.tel,
      mobile: target.mobile || source.mobile,
      businessType: target.businessType || source.businessType,
      addressLine1: target.addressLine1 || source.addressLine1,
      addressLine2: target.addressLine2 || source.addressLine2,
      city: target.city || source.city,
      postcode: target.postcode || source.postcode,
      website: target.website || source.website,
      status: target.status === 'Active' ? 'Active' : source.status,
      billingStatus: [...new Set([...target.billingStatus, ...source.billingStatus])],
      additionalServices: [...new Set([...target.additionalServices, ...source.additionalServices])],
      callHandlingTier: target.callHandlingTier || source.callHandlingTier,
      contacts: [...target.contacts, ...source.contacts],
      address: target.address || source.address,
      systemLink: target.systemLink || source.systemLink,
      script: target.script || source.script,
      scriptTags: [...(target.scriptTags || []), ...(source.scriptTags || [])]
    };

    setCustomers(prev => prev
      .filter(c => c.id !== sourceId) // Remove source
      .map(c => c.id === targetId ? merged : c) // Update target
    );
  };

  const activeCustomers = customers.filter(c => c.status === 'Active' || c.status === 'Paused');
  const leads = customers.filter(c => c.status === 'Lead' || c.status === 'Lost');

  return (
    <CustomersContext.Provider value={{ 
      customers, 
      activeCustomers,
      leads,
      loading,
      addCustomer, 
      updateCustomer, 
      deleteCustomer, 
      mergeCustomers,
      refreshCustomers,
      accounts,
      addAccount,
      refreshAccounts,
    }}>
      {children}
    </CustomersContext.Provider>
  );
}

export function useCustomers() {
  const context = useContext(CustomersContext);
  if (context === undefined) {
    throw new Error('useCustomers must be used within a CustomersProvider');
  }
  return context;
}