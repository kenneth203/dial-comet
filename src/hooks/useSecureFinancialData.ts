import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { secureLog } from '@/lib/secureLogger';

export interface FinancialData {
  user_id: string;
  salary: number | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_sort_code: string | null;
  ni_number: string | null;
  created_at: string;
  updated_at: string;
  access_level: 'FULL_ACCESS' | 'ADMIN_MASKED' | 'HR_RESTRICTED';
  security_notice: string;
}

export interface SuspiciousAccess {
  employee_user_id: string;
  accessor_id: string;
  access_count: number;
  avg_risk_score: number;
  suspicious_patterns: string[];
}

export const useSecureFinancialData = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const getFinancialData = async (
    employeeUserId: string,
    accessReason: string,
    mfaVerified: boolean = false
  ): Promise<FinancialData | null> => {
    if (!accessReason || accessReason.trim().length < 25) {
      toast({
        title: "Access Reason Required",
        description: "Please provide a detailed reason (minimum 25 characters) for accessing financial data",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_employee_financial_data_ultra_secure', {
        employee_user_id: employeeUserId,
        access_reason: accessReason,
        decrypt_sensitive: mfaVerified
      });

      if (error) {
        console.error('🚨 Financial data access error:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        toast({
          title: "No Data Found",
          description: "No financial data found for this employee",
          variant: "default"
        });
        return null;
      }

      const financialRecord = data[0] as FinancialData;

      // Enhanced logging for security (sanitized)
      secureLog.info('Maximum security financial data access', {
        employeeUserId,
        accessLevel: financialRecord.access_level,
        mfaVerified,
        timestamp: new Date().toISOString()
      });

      // Show appropriate security notice
      const noticeVariant = financialRecord.security_notice.includes('HIGH_RISK') ? 'destructive' : 
                           financialRecord.security_notice.includes('MFA_RECOMMENDED') ? 'default' : 'default';

      toast({
        title: `Financial Data Access - ${financialRecord.access_level}`,
        description: financialRecord.security_notice,
        variant: noticeVariant
      });

      return financialRecord;
    } catch (error: any) {
      // Enhanced error handling with security context
      const isSecurityViolation = error.message?.includes('SECURITY_VIOLATION');
      
      toast({
        title: isSecurityViolation ? "Security Violation" : "Access Denied",
        description: error.message || "Failed to access financial data. This incident has been logged for security review.",
        variant: "destructive"
      });
      
      // Log security violations for audit (sanitized)
      if (isSecurityViolation) {
        secureLog.error('SECURITY VIOLATION - Financial Data Access Denied', {
          employeeUserId,
          timestamp: new Date().toISOString()
        });
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateFinancialData = async (
    employeeUserId: string,
    accessReason: string,
    updates: {
      salary?: number;
      bankName?: string;
      bankAccountNumber?: string;
      bankSortCode?: string;
      niNumber?: string;
    },
    mfaVerified: boolean = false
  ): Promise<boolean> => {
    if (!accessReason || accessReason.trim().length < 30) {
      toast({
        title: "Detailed Justification Required",
        description: "Please provide a comprehensive reason (minimum 30 characters) for modifying financial data",
        variant: "destructive"
      });
      return false;
    }

    // Warn about sensitive updates requiring MFA
    const isSensitiveUpdate = updates.bankAccountNumber || updates.niNumber;
    if (isSensitiveUpdate && !mfaVerified) {
      toast({
        title: "MFA Required",
        description: "Multi-factor authentication is required for bank account or NI number changes",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('update_employee_financial_data_secure', {
        employee_user_id: employeeUserId,
        access_reason: accessReason,
        new_salary: updates.salary || null,
        new_bank_name: updates.bankName || null,
        new_bank_account_number: updates.bankAccountNumber || null,
        new_bank_sort_code: updates.bankSortCode || null,
        new_ni_number: updates.niNumber || null
      });

      if (error) {
        console.error('🚨 Financial data update error:', error);
        throw error;
      }

      // Enhanced success logging (sanitized)
      secureLog.info('Secure financial data update completed', {
        employeeUserId,
        updatedFields: Object.keys(updates).filter(key => updates[key as keyof typeof updates] != null),
        mfaVerified,
        timestamp: new Date().toISOString()
      });

      toast({
        title: "Financial Data Updated",
        description: `Employee financial information has been securely updated with AES encryption. All changes logged for audit.`,
        variant: "default"
      });

      return data === true;
    } catch (error: any) {
      const isSecurityViolation = error.message?.includes('SECURITY_VIOLATION');
      
      toast({
        title: isSecurityViolation ? "Security Violation" : "Update Failed",
        description: error.message || "Failed to update financial data. This incident has been logged for security review.",
        variant: "destructive"
      });
      
      // Enhanced security logging for update failures (sanitized)
      if (isSecurityViolation) {
        secureLog.error('SECURITY VIOLATION - Financial Data Update Denied', {
          employeeUserId,
          attemptedUpdates: Object.keys(updates),
          mfaVerified,
          timestamp: new Date().toISOString()
        });
      }
      
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const detectSuspiciousAccess = async (): Promise<SuspiciousAccess[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('detect_suspicious_financial_access');

      if (error) {
        console.error('Error detecting suspicious access:', error);
        throw error;
      }

      if (data && data.length > 0) {
        toast({
          title: "Suspicious Activity Detected",
          description: `Found ${data.length} suspicious access pattern(s). Review recommended.`,
          variant: "destructive"
        });
      }

      return (data as SuspiciousAccess[]) || [];
    } catch (error: any) {
      toast({
        title: "Security Analysis Failed",
        description: error.message || "Failed to analyze access patterns",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    getFinancialData,
    updateFinancialData,
    detectSuspiciousAccess
  };
};