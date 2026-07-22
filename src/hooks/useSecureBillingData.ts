import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { secureLog } from '@/lib/secureLogger';

// Enhanced hook for secure billing data access with audit logging
export function useSecureBillingData() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Check if user has billing access
  const checkBillingAccess = async () => {
    if (!user) return false;
    
    try {
      const { data, error } = await supabase.rpc('has_billing_access');
      if (error) throw error;
      return data || false;
    } catch (error: any) {
      secureLog.error('Failed to check billing access:', error);
      return false;
    }
  };

  // Get secure customer billing data with justification
  const getCustomerBillingData = async (customerId: string, accessReason: string) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_customer_billing_data_ultra_secure', {
        target_customer_id: customerId,
        access_reason: accessReason
      });
      if (error) throw error;
      return data;
    } catch (error: any) {
      toast({
        title: "Access Denied",
        description: error.message || "Failed to access customer billing data",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Get secure customer invoices with justification
  const getCustomerInvoices = async (customerId: string, accessReason: string) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_customer_invoices_ultra_secure', {
        target_customer_id: customerId,
        access_reason: accessReason
      });
      if (error) throw error;
      return data;
    } catch (error: any) {
      toast({
        title: "Access Denied",
        description: error.message || "Failed to access customer invoices",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Get billing dashboard data (only for authorized users)
  const getBillingDashboardData = async () => {
    if (!user) throw new Error('User not authenticated');
    
    const hasAccess = await checkBillingAccess();
    if (!hasAccess) {
      throw new Error('Access denied: Insufficient privileges for billing data');
    }

    setIsLoading(true);
    try {
      // Use regular queries for dashboard data since user is already verified
      const [
        { data: callLogs, error: callLogsError },
        { data: invoices, error: invoicesError },
        { data: customers, error: customersError }
      ] = await Promise.all([
        supabase.from('call_logs').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('billing_invoices').select('*').order('created_on', { ascending: false }).limit(50),
        supabase.from('billing_customers').select('*')
      ]);

      if (callLogsError) throw callLogsError;
      if (invoicesError) throw invoicesError;
      if (customersError) throw customersError;

      return { callLogs: callLogs || [], invoices: invoices || [], customers: customers || [] };
    } catch (error: any) {
      toast({
        title: "Error Loading Dashboard",
        description: error.message || "Failed to load billing dashboard data",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    checkBillingAccess,
    getCustomerBillingData,
    getCustomerInvoices,
    getBillingDashboardData
  };
}