import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { secureLog } from '@/lib/secureLogger';

interface BillingDashboardData {
  total_customers: number;
  total_invoices: number;
  total_call_logs: number;
  monthly_revenue: number;
}

export function useSecureBillingDashboard() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const getBillingDashboard = async (): Promise<BillingDashboardData | null> => {
    setIsLoading(true);
    try {
      secureLog.info('Accessing billing dashboard via secure RPC');
      
      const { data, error } = await supabase.rpc('get_billing_dashboard_secure');
      
      if (error) {
        secureLog.error('Failed to access billing dashboard', { error: error.message });
        toast({
          title: "Access denied",
          description: error.message,
          variant: "destructive",
        });
        return null;
      }

      if (!data || data.length === 0) {
        return null;
      }

      return data[0];
    } catch (error: any) {
      secureLog.error('Error accessing billing dashboard', { error: error.message });
      toast({
        title: "Error",
        description: "Failed to load billing dashboard data",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    getBillingDashboard
  };
}