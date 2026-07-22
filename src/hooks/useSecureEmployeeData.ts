import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { secureLog } from '@/lib/secureLogger';

// Safe profile data that regular users can access
export interface SafeProfileData {
  id: string;
  name: string;
  email: string;
  phone_number?: string;
  role: string;
  status: string;
  department?: string;
  job_position?: string;
  is_system_user: boolean;
  created_at: string;
  updated_at: string;
}

// Sensitive employee data only accessible to HR/Admin
export interface SensitiveEmployeeData {
  id: string;
  name: string;
  email: string;
  phone_number?: string;
  date_of_birth?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  employee_id?: string;
  role: string;
  status: string;
  department?: string;
  job_position?: string;
  contract_type?: string;
  working_hours_per_week?: number;
  start_date?: string;
  annual_leave_entitlement?: number;
  created_at: string;
  updated_at: string;
  access_level: string;
}

// Basic employee info for dropdowns/lists (HR only)
export interface BasicEmployeeInfo {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  department?: string;
  job_position?: string;
  employee_id?: string;
}

export const useSecureEmployeeData = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [myProfile, setMyProfile] = useState<SafeProfileData | null>(null);
  const { toast } = useToast();

  // Auto-load user's safe profile data on hook initialization
  useEffect(() => {
    loadMyProfile();
  }, []);

  // Load current user's safe profile data
  const loadMyProfile = async (): Promise<SafeProfileData | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_employee_basic_info_secure');

      if (error) {
        console.error('Error loading safe profile:', error);
        throw error;
      }

      if (data && data.length > 0) {
        const profileData = data[0] as SafeProfileData;
        setMyProfile(profileData);
        return profileData;
      }

      return null;
    } catch (error: any) {
      toast({
        title: "Profile Load Failed",
        description: error.message || "Unable to load your profile information",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Update current user's safe profile data
  const updateMyProfile = async (updates: {
    phone_number?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    emergency_contact_relationship?: string;
  }): Promise<boolean> => {
    setIsLoading(true);
    try {
      // Update basic contact info
      const { error: basicError } = await supabase.rpc('update_basic_user_info', {
        user_uuid: (await supabase.auth.getUser()).data.user?.id,
        new_phone_number: updates.phone_number || null
      });

      if (basicError) {
        console.error('Error updating basic info:', basicError);
        throw basicError;
      }

      // Update emergency contacts via sensitive data if provided
      if (updates.emergency_contact_name || updates.emergency_contact_phone || updates.emergency_contact_relationship) {
        const { error: sensitiveError } = await supabase.rpc('get_employee_sensitive_data_secure', {
          target_user_id: (await supabase.auth.getUser()).data.user?.id,
          access_reason: 'User updating own emergency contact information'
        });
        
        if (sensitiveError) {
          console.warn('Could not access sensitive data for emergency contact update:', sensitiveError);
        }
      }

      // Reload profile after successful update
      await loadMyProfile();

      toast({
        title: "Profile Updated",
        description: "Your profile information has been updated successfully",
        variant: "default"
      });

      return true;
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update profile information",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // HR/Admin only: Get sensitive employee data with audit logging
  const getEmployeeSensitiveData = async (
    targetUserId: string,
    accessReason: string
  ): Promise<SensitiveEmployeeData | null> => {
    if (!accessReason || accessReason.trim().length < 20) {
      toast({
        title: "Access Reason Required",
        description: "Please provide a detailed reason (minimum 20 characters) for accessing sensitive employee data",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_employee_sensitive_data_secure', {
        target_user_id: targetUserId,
        access_reason: accessReason
      });

      if (error) {
        console.error('🚨 HR data access error:', error);
        throw error;
      }

      if (data && data.length > 0) {
        // Map the sensitive data response to our expected format
        const sensitiveData = data[0];
        const employeeData: SensitiveEmployeeData = {
          id: sensitiveData.user_id,
          name: 'Employee', // Sensitive data doesn't include name for security
          email: 'Redacted for Security',
          date_of_birth: sensitiveData.date_of_birth,
          emergency_contact_name: sensitiveData.emergency_contact_name,
          emergency_contact_phone: sensitiveData.emergency_contact_phone,
          emergency_contact_relationship: sensitiveData.emergency_contact_relationship,
          role: 'Employee',
          status: 'Active',
          created_at: sensitiveData.created_at,
          updated_at: sensitiveData.updated_at,
          access_level: 'sensitive',
          address_line1: sensitiveData.full_address?.split(',')[0] || '',
          city: sensitiveData.full_address?.split(',')[1] || '',
        };

        // Log successful access
        secureLog.debug('HR sensitive data access logged', {
          accessLevel: employeeData.access_level,
        });

        toast({
          title: "Sensitive Data Access Granted",
          description: `Access to ${employeeData.name}'s data has been logged for audit purposes`,
          variant: "default"
        });

        return employeeData;
      }

      return null;
    } catch (error: any) {
      const isSecurityViolation = error.message?.includes('SECURITY_VIOLATION');
      
      toast({
        title: isSecurityViolation ? "Security Violation" : "Access Denied",
        description: error.message || "Failed to access sensitive employee data. This incident has been logged.",
        variant: "destructive"
      });

      // Enhanced security logging
      if (isSecurityViolation) {
        console.error('🚨 SECURITY VIOLATION - Sensitive Data Access Denied:', {
          targetUserId,
          accessReason,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }

      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // HR/Admin only: Get basic employee list for dropdowns and selection
  const getBasicEmployeeList = async (): Promise<BasicEmployeeInfo[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_employee_basic_info_secure');

      if (error) {
        console.error('Error loading employee list:', error);
        throw error;
      }

      return (data as BasicEmployeeInfo[]) || [];
    } catch (error: any) {
      const isSecurityViolation = error.message?.includes('SECURITY_VIOLATION');
      
      toast({
        title: isSecurityViolation ? "Security Violation" : "Access Denied",
        description: error.message || "Failed to load employee list. Insufficient permissions.",
        variant: "destructive"
      });

      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Utility function to check if current user has HR/Admin access
  const checkHRAccess = async (): Promise<boolean> => {
    try {
      // Try to access the employee list function - if it succeeds, user has HR access
      await supabase.rpc('get_employee_basic_info_secure');
      return true;
    } catch (error: any) {
      return false;
    }
  };

  return {
    isLoading,
    myProfile,
    loadMyProfile,
    updateMyProfile,
    getEmployeeSensitiveData,
    getBasicEmployeeList,
    checkHRAccess
  };
};

// Enhanced hook for secure staff data access with audit logging
export function useSecureStaffData() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Get basic staff info (non-sensitive data)
  const getBasicStaffInfo = async () => {
    if (!user) throw new Error('User not authenticated');
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_staff_basic_info_secure');
      if (error) throw error;
      return data;
    } catch (error: any) {
      toast({
        title: "Access Denied",
        description: error.message || "Failed to access staff information",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Get contact information (requires justification)
  const getContactInfo = async (targetUserId: string, accessReason?: string) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_staff_contact_info_secure', {
        target_user_id: targetUserId,
        access_reason: accessReason
      });
      if (error) throw error;
      return data;
    } catch (error: any) {
      toast({
        title: "Access Denied",
        description: error.message || "Failed to access contact information",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Get personal details (highly sensitive, requires detailed justification)
  const getPersonalDetails = async (targetUserId: string, accessReason: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!accessReason || accessReason.length < 15) {
      throw new Error('Detailed business justification (min 15 chars) required');
    }
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_staff_personal_details_secure', {
        target_user_id: targetUserId,
        access_reason: accessReason
      });
      if (error) throw error;
      return data;
    } catch (error: any) {
      toast({
        title: "Access Denied",
        description: error.message || "Failed to access personal details",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Get emergency contacts (requires justification)
  const getEmergencyContacts = async (targetUserId: string, accessReason: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!accessReason || accessReason.length < 10) {
      throw new Error('Business justification (min 10 chars) required');
    }
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_staff_emergency_contacts_secure', {
        target_user_id: targetUserId,
        access_reason: accessReason
      });
      if (error) throw error;
      return data;
    } catch (error: any) {
      toast({
        title: "Access Denied",
        description: error.message || "Failed to access emergency contacts",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    getBasicStaffInfo,
    getContactInfo,
    getPersonalDetails,
    getEmergencyContacts
  };
}

interface SensitiveDataFilter {
  canViewSensitiveData: boolean;
  isHROrAdmin: boolean;
  filterSensitiveFields: <T extends Record<string, any>>(data: T) => T;
  logDataAccess: (employeeId: string, action: string) => Promise<void>;
}

export function useSensitiveDataProtection(): SensitiveDataFilter {
  const { user } = useAuth();
  const [canViewSensitiveData, setCanViewSensitiveData] = useState(false);
  const [isHROrAdmin, setIsHROrAdmin] = useState(false);

  useEffect(() => {
    const checkPermissions = async () => {
      if (!user) {
        setCanViewSensitiveData(false);
        setIsHROrAdmin(false);
        return;
      }

      try {
        // Check if user has HR or Admin role
        const { data, error } = await supabase.rpc('can_access_sensitive_financial_data');
        
        if (error) {
          console.error('Error checking permissions:', error);
          setCanViewSensitiveData(false);
          setIsHROrAdmin(false);
          return;
        }

        setCanViewSensitiveData(data || false);
        setIsHROrAdmin(data || false);
      } catch (error) {
        console.error('Error checking permissions:', error);
        setCanViewSensitiveData(false);
        setIsHROrAdmin(false);
      }
    };

    checkPermissions();
  }, [user]);

  const filterSensitiveFields = <T extends Record<string, any>>(data: T): T => {
    if (canViewSensitiveData) {
      return data; // HR/Admin can see all data
    }

    // Filter out sensitive fields for regular users
    const SENSITIVE_FIELDS = [
      'salary',
      'bank_name', 
      'bank_account_number',
      'bank_sort_code',
      'ni_number',
      'date_of_birth',
      'address_line1',
      'address_line2',
      'postal_code'
    ];
    
    const filtered = { ...data } as any;
    SENSITIVE_FIELDS.forEach(field => {
      if (field in filtered) {
        filtered[field] = null; // Mask sensitive data
      }
    });

    return filtered as T;
  };

  const logDataAccess = async (employeeId: string, action: string): Promise<void> => {
    if (!canViewSensitiveData) return; // Only log if accessing sensitive data

    try {
      await supabase.rpc('log_sensitive_data_access', {
        employee_id: employeeId,
        action: action
      });
    } catch (error) {
      console.error('Error logging data access:', error);
      // Don't throw - logging failure shouldn't break functionality
    }
  };

  return {
    canViewSensitiveData,
    isHROrAdmin,
    filterSensitiveFields,
    logDataAccess
  };
}