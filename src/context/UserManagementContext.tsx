import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useHoliday } from '@/context/HolidayContext';
import { toast } from 'sonner';
import { asPromise } from '@/lib/supabaseRpc';

// Unified User interface combining system users and staff details
export interface UnifiedUser {
  id: string;
  auth_user_id?: string | null;
  name: string;
  email: string;
  phone_number?: string;
  role: string;
  status: string;
  
  // Employment Details
  employee_id?: string;
  department?: string;
  job_position?: string;
  contract_type?: string;
  working_hours_per_week?: number;
  start_date?: string;
  annual_leave_entitlement?: number;
  
  // Contact Information
  city?: string;
  country?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  
  // System flags
  is_system_user: boolean;
  is_staff_member: boolean;
  
  // Timestamps
  created_at?: string;
  updated_at?: string;
  
  // Sensitive data (only visible to admins or own user)
  salary?: number | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_sort_code?: string | null;
  ni_number?: string | null;
  date_of_birth?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
}

export interface CreateUserData {
  name: string;
  email: string;
  phone_number?: string;
  role?: string;
  status?: string;
  department?: string;
  job_position?: string;
  contract_type?: string;
  working_hours_per_week?: number;
  annual_leave_entitlement?: number;
  employee_id?: string;
  start_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  city?: string;
  country?: string;
  salary?: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_sort_code?: string;
  ni_number?: string;
  date_of_birth?: string;
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
  is_system_user?: boolean;
  is_staff_member?: boolean;
  create_auth_user?: boolean;
  auth_password?: string;
}

interface UserManagementContextValue {
  users: UnifiedUser[];
  isLoading: boolean;
  addUser: (userData: CreateUserData) => Promise<UnifiedUser | null>;
  updateUser: (id: string, userData: Partial<CreateUserData>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
  // For task/todo assignment compatibility
  assignableUsers: Array<{id: string; name: string; role: string; status: string}>;
}

const UserManagementContext = createContext<UserManagementContextValue | undefined>(undefined);

export function UserManagementProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<UnifiedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { isAdmin } = useHoliday();

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      
      // Check if user is admin/HR to determine data access level
      const { data: isAdminResult }: any = await asPromise(supabase.rpc('is_admin_or_higher'));
      const isCurrentUserAdmin = isAdminResult;

      if (isCurrentUserAdmin) {
        // Admin/HR users access all basic user profiles
        const { data: userData, error }: any = await asPromise(
          supabase.rpc('get_all_basic_user_profiles')
        );

        if (error) throw error;

        // Transform secure basic data (no sensitive information)
        const transformedUsers: UnifiedUser[] = (userData || []).map(user => ({
          id: user.id,
          auth_user_id: user.auth_user_id,
          name: user.name || 'Unknown',
          email: user.email || '',
          phone_number: user.phone_number,
          role: user.role || 'Operator',
          status: user.status || 'Active',
          employee_id: user.employee_id,
          department: user.department,
          job_position: user.job_position,
          contract_type: user.contract_type,
          working_hours_per_week: user.working_hours_per_week,
          start_date: user.start_date,
          annual_leave_entitlement: user.annual_leave_entitlement,
          city: user.city,
          country: user.country,
          // Emergency contacts not available in comprehensive_users table
          emergency_contact_name: null,
          emergency_contact_phone: null,
          emergency_contact_relationship: null,
          is_system_user: user.is_system_user || false,
          is_staff_member: user.is_staff_member || false,
          created_at: user.created_at,
          updated_at: user.updated_at,
          // Sensitive data - not accessible via basic data function
          salary: null,
          bank_name: null,
          bank_account_number: null,
          bank_sort_code: null,
          ni_number: null,
          date_of_birth: null,
          address_line1: null,
          address_line2: null,
          postal_code: null,
        }));

        setUsers(transformedUsers);
      } else {
        // Regular users can only access their own basic profile via secure function
        const { data: userProfile, error }: any = await asPromise(supabase.rpc('get_basic_user_profile'));
        
        if (error) throw error;

        // Transform basic profile data (no sensitive information) - RPC returns array
        const transformedUsers: UnifiedUser[] = (userProfile || []).map(profile => ({
          id: profile.id,
          auth_user_id: profile.auth_user_id,
          name: profile.name || 'Unknown',
          email: profile.email || '',
          phone_number: profile.phone_number,
          role: profile.role || 'Operator',
          status: profile.status || 'Active',
          department: profile.department,
          job_position: profile.job_position,
          contract_type: profile.contract_type,
          working_hours_per_week: profile.working_hours_per_week,
          start_date: profile.start_date,
          annual_leave_entitlement: profile.annual_leave_entitlement,
          city: profile.city,
          country: profile.country,
          // Emergency contacts not available in comprehensive_users table
          emergency_contact_name: null,
          emergency_contact_phone: null,
          emergency_contact_relationship: null,
          is_system_user: profile.is_system_user || false,
          is_staff_member: profile.is_staff_member || false,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
          // Sensitive data - not accessible to regular users
          salary: null,
          bank_name: null,
          bank_account_number: null,
          bank_sort_code: null,
          ni_number: null,
          date_of_birth: null,
          address_line1: null,
          address_line2: null,
          postal_code: null,
        }));

        setUsers(transformedUsers);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      // Fail silently - don't show toast storm on boot
    } finally {
      setIsLoading(false);
    }
  };

  const addUser = async (userData: CreateUserData): Promise<UnifiedUser | null> => {
    try {
      // Server-side admin check BEFORE any operations
      const { data: isAdminResult } = await supabase.rpc('is_admin_or_higher');
      if (!isAdminResult) {
        throw new Error('Access denied: Only administrators can create users');
      }

      let authUserId = null;

      // Create auth user if requested (only after admin check passes)
      if (userData.create_auth_user && userData.email && userData.auth_password) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: userData.email,
          password: userData.auth_password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`
          }
        });

        if (authError) throw authError;
        authUserId = authData.user?.id;
      }

      // Insert user into comprehensive_users table (admin-only operation)
      const { data, error } = await (supabase
        .from('comprehensive_users') as any)
        .insert({
          auth_user_id: authUserId,
          name: userData.name,
          email: userData.email,
          phone_number: userData.phone_number,
          role: userData.role || 'Operator',
          status: userData.status || 'Active',
          employee_id: userData.employee_id,
          department: userData.department,
          position: userData.job_position,
          contract_type: userData.contract_type || 'full_time',
          working_hours_per_week: userData.working_hours_per_week || 37.5,
          start_date: userData.start_date,
          annual_leave_entitlement: userData.annual_leave_entitlement ?? 25.0,
          city: userData.city,
          country: userData.country || 'United Kingdom',
          is_system_user: userData.is_system_user || false,
          is_staff_member: userData.is_staff_member || false,
        })
        .select()
        .single();

      if (error) throw error;

      await loadUsers(); // Refresh the list
      toast.success('User added successfully!');

      return {
        id: data.id,
        auth_user_id: data.auth_user_id,
        name: data.name,
        email: data.email,
        phone_number: data.phone_number,
        role: data.role,
        status: data.status,
        employee_id: data.employee_id,
        department: data.department,
        job_position: data.position,
        contract_type: data.contract_type,
        working_hours_per_week: data.working_hours_per_week,
        start_date: data.start_date,
        annual_leave_entitlement: data.annual_leave_entitlement,
        city: data.city,
        country: data.country,
        is_system_user: data.is_system_user,
        is_staff_member: data.is_staff_member,
        created_at: data.created_at,
        updated_at: data.updated_at,
        // Financial data is handled separately via employee_financial_data table
        salary: null,
        bank_name: null,
        bank_account_number: null,
        bank_sort_code: null,
        ni_number: null,
        // Sensitive personal data is now handled separately via employee_sensitive_data table
        date_of_birth: null,
        address_line1: null,
        address_line2: null,
        postal_code: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        emergency_contact_relationship: null,
      };
    } catch (error: any) {
      console.error('Error adding user:', error);
      toast.error(error.message || 'Failed to add user');
      throw error;
    }
  };

  const updateUser = async (id: string, userData: Partial<CreateUserData>): Promise<void> => {
    try {
      // Server-side admin check
      const { data: isAdminResult } = await supabase.rpc('is_admin_or_higher');
      const targetUser = users.find(u => u.id === id);
      const isOwnProfile = targetUser?.auth_user_id === user?.id;
      
      if (!isAdminResult && !isOwnProfile) {
        throw new Error('Access denied: Can only update own profile or admin required');
      }

      if (isAdminResult) {
        // Admins can update all fields directly
        const { error } = await (supabase
          .from('comprehensive_users') as any)
          .update({
            name: userData.name,
            email: userData.email,
            phone_number: userData.phone_number,
            role: userData.role,
            status: userData.status,
            employee_id: userData.employee_id,
            department: userData.department,
            position: userData.job_position,
            contract_type: userData.contract_type,
            working_hours_per_week: userData.working_hours_per_week,
            start_date: userData.start_date,
            annual_leave_entitlement: userData.annual_leave_entitlement,
            city: userData.city,
            country: userData.country,
            is_system_user: userData.is_system_user,
            is_staff_member: userData.is_staff_member,
          })
          .eq('id', id);

        if (error) throw error;
      } else {
        // Regular users can only update safe fields via secure function
        const { error } = await supabase.rpc('update_basic_user_info', {
          user_uuid: targetUser?.auth_user_id,
          new_phone_number: userData.phone_number,
        });

        if (error) throw error;
      }

      await loadUsers(); // Refresh the list
      toast.success('User updated successfully!');
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast.error(error.message || 'Failed to update user');
      throw error;
    }
  };

  const deleteUser = async (id: string): Promise<void> => {
    try {
      // Server-side admin check
      const { data: isAdminResult } = await supabase.rpc('is_admin_or_higher');
      if (!isAdminResult) {
        throw new Error('Access denied: Only administrators can delete users');
      }

      const { error } = await supabase
        .from('comprehensive_users')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await loadUsers(); // Refresh the list
      toast.success('User deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error(error.message || 'Failed to delete user');
      throw error;
    }
  };

  const refreshUsers = async () => {
    await loadUsers();
  };

  // Computed value for task/todo assignment compatibility
  const assignableUsers = useMemo(() => 
    users
      .filter(user => user.status === 'Active')
      .map(user => ({
        id: user.auth_user_id || user.id, // Use auth_user_id if available, otherwise use user.id
        name: user.name,
        role: user.role,
        status: user.status
      })),
    [users]
  );

  useEffect(() => {
    if (user) {
      loadUsers();
    } else {
      setUsers([]);
      setIsLoading(false);
    }
  }, [user]);

  const value = useMemo(() => ({
    users,
    isLoading,
    addUser,
    updateUser,
    deleteUser,
    refreshUsers,
    assignableUsers,
  }), [users, isLoading, assignableUsers]);

  return (
    <UserManagementContext.Provider value={value}>
      {children}
    </UserManagementContext.Provider>
  );
}

export function useUserManagement() {
  const context = useContext(UserManagementContext);
  if (context === undefined) {
    // Return a default context instead of throwing to prevent crashes
    console.warn('useUserManagement called outside of UserManagementProvider, returning default values');
    return {
      users: [],
      isLoading: false,
      addUser: async () => null,
      updateUser: async () => {},
      deleteUser: async () => {},
      refreshUsers: async () => {},
      assignableUsers: [],
    };
  }
  return context;
}