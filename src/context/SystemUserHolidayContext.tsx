import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { secureLog } from '@/lib/secureLogger';
import { notifyHolidayApprovers } from '@/lib/holidayNotifications';

export type AbsenceType = 
  | 'annual_leave'
  | 'sick_leave'
  | 'maternity_leave'
  | 'paternity_leave'
  | 'compassionate_leave'
  | 'study_leave'
  | 'unpaid_leave'
  | 'public_holiday';

export type RequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export interface HolidayRequest {
  id: string;
  user_id: string;
  absence_type: AbsenceType;
  start_date: string;
  end_date: string;
  total_days: number;
  status: RequestStatus;
  reason?: string;
  approved_by?: string;
  approved_at?: string;
  decline_reason?: string;
  created_at: string;
  updated_at: string;
  user_name?: string;
  approver_name?: string;
}

export interface SystemUserHolidayData {
  annual_leave_allowed: number;
  annual_leave_used: number;
  annual_leave_remaining: number;
  sick_leave_allowed: number;
  sick_leave_used: number;
  sick_leave_remaining: number;
  personal_days_allowed: number;
  personal_days_used: number;
  personal_days_remaining: number;
  public_holidays: number;
  carried_over_days: number;
  // Computed totals
  total_quota: number;
  total_used: number;
  total_remaining: number;
}

interface SystemUserHolidayContextValue {
  // Holiday Requests
  holidayRequests: HolidayRequest[];
  pendingRequests: HolidayRequest[];
  myRequests: HolidayRequest[];
  addHolidayRequest: (request: Omit<HolidayRequest, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'>) => Promise<HolidayRequest | null>;
  updateHolidayRequest: (id: string, updates: Partial<HolidayRequest>) => Promise<void>;
  deleteHolidayRequest: (id: string) => Promise<void>;
  approveRequest: (id: string, approverId: string) => Promise<void>;
  declineRequest: (id: string, reason: string, approverId: string) => Promise<void>;
  
  // Holiday Data
  myHolidayData: SystemUserHolidayData | null;
  getUserHolidayData: (userId: string) => Promise<SystemUserHolidayData | null>;
  
  isLoading: boolean;
  isAdmin: boolean;
}

const SystemUserHolidayContext = createContext<SystemUserHolidayContextValue | undefined>(undefined);

export function SystemUserHolidayProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [holidayRequests, setHolidayRequests] = useState<HolidayRequest[]>([]);
  const [myHolidayData, setMyHolidayData] = useState<SystemUserHolidayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Load data when user changes
  useEffect(() => {
    if (user) {
      loadData();
      checkAdminStatus();
      
      // Set up real-time subscription for holiday_requests changes
      const channel = supabase
        .channel(`sys-holiday-requests-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'holiday_requests'
          },
          (payload) => {
            secureLog.debug('Holiday request changed');
            // Reload data when any holiday request changes
            loadHolidayRequests();
            loadMyHolidayData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setHolidayRequests([]);
      setMyHolidayData(null);
      setIsAdmin(false);
      setIsLoading(false);
    }
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      setIsAdmin(data?.role === 'Admin' || data?.role === 'Super-Admin' || data?.role === 'Supervisor');
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const loadData = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      await Promise.all([
        loadHolidayRequests(),
        loadMyHolidayData()
      ]);
    } catch (error) {
      console.error('Error loading holiday data:', error);
      // Fail silently - don't toast storm on boot
    } finally {
      setIsLoading(false);
    }
  };

  const loadHolidayRequests = async () => {
    if (!user) return;

    try {
      // Get requests first
      const { data: requests, error: requestsError } = await supabase
        .from('holiday_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;

      // Get user names from system_users table
      const userIds = [...new Set([
        ...requests?.map(r => r.user_id) || [],
        ...requests?.filter(r => r.approved_by).map(r => r.approved_by!) || []
      ])];

      const { data: systemUsers, error: usersError } = await supabase
        .from('system_users')
        .select('user_id, name')
        .in('user_id', userIds);

      if (usersError) throw usersError;

      const userNameMap = new Map(systemUsers?.map(u => [u.user_id, u.name]) || []);

      const requestsWithNames = requests?.map(request => ({
        ...request,
        user_name: userNameMap.get(request.user_id) || 'Unknown',
        approver_name: request.approved_by ? userNameMap.get(request.approved_by) : undefined
      })) as unknown as HolidayRequest[] || [];

      setHolidayRequests(requestsWithNames);
    } catch (error) {
      console.error('Error loading holiday requests:', error);
    }
  };

  const loadMyHolidayData = async () => {
    if (!user) return;

    try {
      secureLog.debug('Loading holiday data');
      
      const { data, error } = await supabase
        .rpc('get_system_user_holiday_breakdown');

      if (error) {
        console.error('RPC Error:', error);
        throw error;
      }
      
      secureLog.debug('RPC response received');
      
      const holidayData = data[0];
      if (holidayData) {
        // Calculate totals from the individual values using actual field names
        const totalQuota = (holidayData.base_entitlement || 0) + 10 + (holidayData.personal_allowance_available || 0); // sick_leave assumed 10
        const annualUsed = holidayData.personal_taken || 0;
        const sickUsed = 0; // Not available in response
        const personalUsed = holidayData.personal_taken || 0;
        const totalUsed = annualUsed + sickUsed + personalUsed;
        const totalRemaining = totalQuota - totalUsed;
        
        // Map the RPC response to our SystemUserHolidayData interface
        const mappedData: SystemUserHolidayData = {
          annual_leave_allowed: holidayData.base_entitlement || 0,
          annual_leave_used: annualUsed,
          annual_leave_remaining: Math.max(0, (holidayData.base_entitlement || 0) - annualUsed),
          sick_leave_allowed: 10, // Default value
          sick_leave_used: sickUsed,
          sick_leave_remaining: holidayData.sick_leave_remaining || 0,
          personal_days_allowed: holidayData.personal_allowance_available || 0,
          personal_days_used: personalUsed,
          personal_days_remaining: holidayData.personal_days_remaining || 0,
          public_holidays: holidayData.bank_holidays || 0,
          carried_over_days: 0, // Not available in response
          // Computed totals
          total_quota: totalQuota,
          total_used: totalUsed,
          total_remaining: totalRemaining
        };
        
        secureLog.debug('Holiday data mapped');
        setMyHolidayData(mappedData);
      } else {
        secureLog.debug('No holiday data found');
        setMyHolidayData(null);
      }
    } catch (error) {
      console.error('Error loading my holiday data:', error);
      setMyHolidayData(null);
    }
  };

  const getUserHolidayData = async (userId: string): Promise<SystemUserHolidayData | null> => {
    try {
      secureLog.debug('Loading holiday data for user');
      
      const { data, error } = await (supabase as any)
        .rpc('get_system_user_holiday_breakdown');

      if (error) {
        console.error('RPC Error:', error);
        throw error;
      }
      
      secureLog.debug('RPC response for user received');
      
      const holidayData = data[0];
      if (holidayData) {
        // Calculate totals from the individual values using actual field names
        const totalQuota = (holidayData.base_entitlement || 0) + 10 + (holidayData.personal_allowance_available || 0); // sick_leave assumed 10
        const annualUsed = holidayData.personal_taken || 0;
        const sickUsed = 0; // Not available in response
        const personalUsed = holidayData.personal_taken || 0;
        const totalUsed = annualUsed + sickUsed + personalUsed;
        const totalRemaining = totalQuota - totalUsed;
        
        // Map the RPC response to our SystemUserHolidayData interface
        return {
          annual_leave_allowed: holidayData.base_entitlement || 0,
          annual_leave_used: annualUsed,
          annual_leave_remaining: Math.max(0, (holidayData.base_entitlement || 0) - annualUsed),
          sick_leave_allowed: 10, // Default value
          sick_leave_used: sickUsed,
          sick_leave_remaining: holidayData.sick_leave_remaining || 0,
          personal_days_allowed: holidayData.personal_allowance_available || 0,
          personal_days_used: personalUsed,
          personal_days_remaining: holidayData.personal_days_remaining || 0,
          public_holidays: holidayData.bank_holidays || 0,
          carried_over_days: 0, // Not available in response
          // Computed totals
          total_quota: totalQuota,
          total_used: totalUsed,
          total_remaining: totalRemaining
        };
      }
      return null;
    } catch (error) {
      console.error('Error loading user holiday data:', error);
      return null;
    }
  };

  const addHolidayRequest = async (request: Omit<HolidayRequest, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'>) => {
    if (!user) return null;

    try {
      const { data, error } = await (supabase
        .from('holiday_requests') as any)
        .insert([{
          user_id: user.id,
          absence_type: request.absence_type,
          start_date: request.start_date,
          end_date: request.end_date,
          notes: request.reason,
          status: 'pending'
        }])
        .select()
        .single();

      if (error) throw error;

      await loadHolidayRequests();
      await loadMyHolidayData();

      // Send approval notifications to the right role group
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', user.id)
        .single();

      notifyHolidayApprovers({
        requestId: (data as any).id,
        requesterUserId: user.id,
        requesterName: myProfile?.name || 'Unknown',
        absenceType: request.absence_type,
        startDate: request.start_date,
        endDate: request.end_date,
        totalDays: request.total_days || 0,
      });
      
      toast({
        title: 'Success',
        description: 'Holiday request submitted successfully'
      });
      
      return data as unknown as HolidayRequest;
    } catch (error: any) {
      console.error('Error adding holiday request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit holiday request',
        variant: 'destructive'
      });
      return null;
    }
  };

  const updateHolidayRequest = async (id: string, updates: Partial<HolidayRequest>) => {
    try {
      const { error } = await supabase
        .from('holiday_requests')
        .update(updates as any)
        .eq('id', id);

      if (error) throw error;

      await loadHolidayRequests();
      await loadMyHolidayData();
    } catch (error) {
      console.error('Error updating holiday request:', error);
      toast({
        title: 'Error',
        description: 'Failed to update holiday request',
        variant: 'destructive'
      });
    }
  };

  const approveRequest = async (id: string, approverId: string) => {
    try {
      const { error } = await (supabase
        .from('holiday_requests') as any)
        .update({
          status: 'approved',
          approved_by: approverId,
        })
        .eq('id', id);

      if (error) throw error;

      await loadHolidayRequests();
      await loadMyHolidayData();
      
      toast({
        title: 'Request Approved',
        description: 'Holiday request has been approved'
      });
    } catch (error) {
      console.error('Error approving request:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve request',
        variant: 'destructive'
      });
    }
  };

  const declineRequest = async (id: string, reason: string, approverId: string) => {
    try {
      const { error } = await (supabase
        .from('holiday_requests') as any)
        .update({
          status: 'declined',
          approved_by: approverId,
        })
        .eq('id', id);

      if (error) throw error;

      await loadHolidayRequests();
      await loadMyHolidayData();
      
      toast({
        title: 'Request Declined',
        description: 'Holiday request has been declined'
      });
    } catch (error) {
      console.error('Error declining request:', error);
      toast({
        title: 'Error',
        description: 'Failed to decline request',
        variant: 'destructive'
      });
    }
  };

  const deleteHolidayRequest = async (id: string) => {
    try {
      const { error } = await supabase
        .from('holiday_requests')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await loadHolidayRequests();
      await loadMyHolidayData();
      
      toast({
        title: 'Request Deleted',
        description: 'Holiday request has been deleted'
      });
    } catch (error) {
      console.error('Error deleting request:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete request',
        variant: 'destructive'
      });
    }
  };

  // Computed values
  const pendingRequests = useMemo(() => 
    holidayRequests.filter(request => request.status === 'pending'),
    [holidayRequests]
  );

  const myRequests = useMemo(() => 
    holidayRequests.filter(request => request.user_id === user?.id),
    [holidayRequests, user?.id]
  );

  const contextValue: SystemUserHolidayContextValue = {
    holidayRequests,
    pendingRequests,
    myRequests,
    addHolidayRequest,
    updateHolidayRequest,
    deleteHolidayRequest,
    approveRequest,
    declineRequest,
    myHolidayData,
    getUserHolidayData,
    isLoading,
    isAdmin
  };

  return (
    <SystemUserHolidayContext.Provider value={contextValue}>
      {children}
    </SystemUserHolidayContext.Provider>
  );
}

export function useSystemUserHoliday() {
  const context = useContext(SystemUserHolidayContext);
  if (context === undefined) {
    throw new Error('useSystemUserHoliday must be used within a SystemUserHolidayProvider');
  }
  return context;
}
