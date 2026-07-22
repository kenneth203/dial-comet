import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { secureLog } from "@/lib/secureLogger";
import { asPromise } from '@/lib/supabaseRpc';

type RpcResult<T> = { data: T | null; error: { message?: string } | null };

export type UserRole = "Operator" | "Supervisor" | "Admin";
export type UserStatus = "Active" | "On Leave" | "Inactive";

export interface SystemUser {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  status: UserStatus;
  // Personal details
  date_of_birth?: string;
  current_address?: string;
  current_post_code?: string;
  permanent_address?: string;
  permanent_post_code?: string;
  home_phone?: string;
  mobile_phone?: string;
  national_insurance?: string;
  // Monitoring information
  gender?: string;
  ethnicity?: string;
  nationality?: string;
  disability?: string;
  disability_category?: string;
  marital_status?: string;
  // Emergency contact
  emergency_name?: string;
  emergency_relationship?: string;
  emergency_address?: string;
  emergency_phone?: string;
  // Bank details
  bank_name?: string;
  bank_address?: string;
  account_number?: string;
  sort_code?: string;
  // Employment details
  job_title?: string;
  department?: string;
  start_date?: string;
  // Holiday entitlements  
  annual_leave_days?: number;
  sick_leave_days?: number;
  personal_days?: number;
  public_holidays?: number;
  christmas_closure_days?: number;
  carried_over_days?: number;
}

interface UsersContextValue {
  users: SystemUser[];
  addUser: (data: Omit<SystemUser, "id">) => Promise<SystemUser | null>;
  updateUser: (id: string, patch: Partial<Omit<SystemUser, "id">>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  isLoading: boolean;
  loadUsers: () => Promise<void>;
}

const UsersContext = createContext<UsersContextValue | undefined>(undefined);

const LS_KEY = "app.users";

export function UsersProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  // Load users from Supabase
  useEffect(() => {
    if (!user) {
      setUsers([]);
      setIsLoading(false);
      return;
    }

    loadUsers();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`team-users-refresh-${user.id}-${uniqueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_users' }, () => {
        void loadUsers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comprehensive_users' }, () => {
        void loadUsers();
      })
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadUsers();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', loadUsers);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', loadUsers);
    };
  }, [user]);

  // Load users from Supabase with fresh data every time
  const loadUsers = async () => {
    secureLog.debug('Loading users from database...');
    setIsLoading(true);
    try {
      // Try to get full system users for management first using secure function
      const { data: managementData, error: managementError } = await asPromise<RpcResult<any[]>>(
        supabase.rpc('get_all_system_users_for_management_secure')
      );

      if (!managementError && managementData && Array.isArray(managementData) && managementData.length > 0) {
        secureLog.debug('Loaded system users for management', { count: managementData.length });
        
        const mappedUsers: SystemUser[] = (managementData || []).map(row => {
          // Type assertion to handle newly added christmas_closure_days field
          const typedRow = row as typeof row & { christmas_closure_days?: number };
          
          return {
            id: typedRow.id,
            name: typedRow.name,
            role: typedRow.role as UserRole,
            email: typedRow.email || '',
            status: typedRow.status as UserStatus,
            // Personal details - use available masked/safe data
            date_of_birth: typedRow.date_of_birth || '',
            current_address: typedRow.address_masked || 'Protected',
            current_post_code: 'Protected',
            permanent_address: typedRow.address_masked || 'Protected',
            permanent_post_code: 'Protected',
            home_phone: typedRow.home_phone_masked || 'Protected',
            mobile_phone: typedRow.mobile_phone_masked || 'Protected',
            national_insurance: 'Protected',
            // Monitoring information - not available in secure response
            gender: 'Protected',
            ethnicity: 'Protected',
            nationality: 'Protected',
            disability: 'Protected',
            disability_category: 'Protected',
            marital_status: 'Protected',
            // Emergency contact - protected
            emergency_name: 'Protected',
            emergency_relationship: 'Protected',
            emergency_address: 'Protected',
            emergency_phone: 'Protected',
            // Bank details - protected
            bank_name: 'Protected',
            bank_address: 'Protected',
            account_number: 'Protected',
            sort_code: 'Protected',
            // Employment details
            job_title: typedRow.job_title,
            department: typedRow.department,
            start_date: typedRow.start_date,
            // Holiday entitlements
            annual_leave_days: typedRow.annual_leave_days,
            sick_leave_days: typedRow.sick_leave_days,
            personal_days: typedRow.personal_days,
            public_holidays: typedRow.public_holidays,
            christmas_closure_days: typedRow.christmas_closure_days,
            carried_over_days: typedRow.carried_over_days,
          };
        });

        setUsers(mappedUsers);
        secureLog.debug('Successfully loaded system users for management', { count: mappedUsers.length });
        return;
      }

      // Fallback to assignable users for dropdowns
      secureLog.debug('Management users not available, falling back to assignable users');
      const { data: assignableData, error: assignableError } = await asPromise<RpcResult<any[]>>(
        supabase.rpc('get_assignable_comprehensive_users')
      );

      if (assignableError) {
        console.error('🔥 Error loading assignable users:', assignableError);
        return;
      }

      secureLog.debug('Fresh users data loaded from RPC', { count: assignableData?.length });
      
      const mappedUsers: SystemUser[] = (assignableData || []).map(row => {
        return {
          id: row.id,
          name: row.name,
          role: row.role as UserRole,
          email: '', // Not available in assignable users
          status: row.status as UserStatus,
          department: row.department,
          // All other fields set to undefined for basic dropdown functionality
          title: undefined,
          date_of_birth: undefined,
          current_address: undefined,
          current_post_code: undefined,
          permanent_address: undefined,
          permanent_post_code: undefined,
          home_phone: undefined,
          mobile_phone: undefined,
          national_insurance: undefined,
          gender: undefined,
          ethnicity: undefined,
          nationality: undefined,
          disability: undefined,
          disability_category: undefined,
          marital_status: undefined,
          emergency_name: undefined,
          emergency_relationship: undefined,
          emergency_address: undefined,
          emergency_phone: undefined,
          bank_name: undefined,
          bank_address: undefined,
          account_number: undefined,
          sort_code: undefined,
          job_title: row.job_position, // Map job_position to job_title
          start_date: undefined,
          annual_leave_days: undefined,
          sick_leave_days: undefined,
          personal_days: undefined,
          public_holidays: undefined,
          christmas_closure_days: undefined,
          carried_over_days: undefined,
        };
      });

      secureLog.debug('Setting fresh users data in context');
      setUsers(mappedUsers);

      // Migrate data from localStorage if Supabase is empty and localStorage has data
      if (mappedUsers.length === 0) {
        await migrateFromLocalStorage();
      }
    } catch (error) {
      console.error('Error loading system users:', error);
      // Fail silently to prevent error storms on boot
    } finally {
      setIsLoading(false);
    }
  };

  const migrateFromLocalStorage = async () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw && raw !== 'undefined' && raw !== 'null') {
        const parsed = JSON.parse(raw) as SystemUser[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          secureLog.debug('Migrating users from localStorage to Supabase', { count: parsed.length });
          
          for (const localUser of parsed) {
            await addUser({
              name: localUser.name,
              role: localUser.role,
              email: localUser.email,
              status: localUser.status,
            });
          }
          
          // Clear localStorage after successful migration
          localStorage.removeItem(LS_KEY);
        }
      }
    } catch (error) {
      console.error('Error migrating users from localStorage:', error);
    }
  };

  const addUser = async (data: Omit<SystemUser, "id">): Promise<SystemUser | null> => {
    if (!user) return null;

    try {
      const { data: newUserId, error } = await supabase.rpc('admin_create_system_user', {
        p_user_id: user.id,
        p_name: data.name,
        p_email: data.email,
        p_role: data.role,
        p_status: data.status
      });

      if (error) {
        console.error('Error adding system user:', error);
        return null;
      }

      // Reload users to get the fresh data
      await loadUsers();
      
      return users.find(u => u.id === newUserId) || null;
    } catch (error) {
      console.error('Error adding system user:', error);
      return null;
    }
  };

  const updateUser = async (id: string, patch: any): Promise<void> => {
    if (!user) return;

    try {
      const { error } = await supabase.rpc('admin_update_system_user', {
        p_id: id,
        ...Object.fromEntries(
          Object.entries(patch).map(([key, value]) => [`p_${key}`, value])
        )
      });

      if (error) {
        console.error('Error updating system user:', error);
        return;
      }

      secureLog.debug('Update successful - refreshing context with fresh database data');
      
      // Immediately refresh the context with fresh data from database
      await loadUsers();
    } catch (error) {
      console.error('Error updating system user:', error);
    }
  };

  const deleteUser = async (id: string): Promise<void> => {
    if (!user) return;

    try {
      const { error } = await supabase.rpc('admin_delete_system_user', {
        p_id: id
      });

      if (error) {
        console.error('Error deleting system user:', error);
        return;
      }

      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (error) {
      console.error('Error deleting system user:', error);
    }
  };

  const value = useMemo<UsersContextValue>(() => ({
    users,
    addUser,
    updateUser,
    deleteUser,
    isLoading,
    loadUsers, // Expose loadUsers for manual refresh
  }), [users, isLoading]);

  return <UsersContext.Provider value={value}>{children}</UsersContext.Provider>;
}

export function useUsers() {
  const ctx = useContext(UsersContext);
  if (!ctx) throw new Error("useUsers must be used within a UsersProvider");
  return ctx;
}
