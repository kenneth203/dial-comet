import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { secureLog } from '@/lib/secureLogger';
import { notifyHolidayApprovers, notifyHolidayRequester } from '@/lib/holidayNotifications';
import { asPromise } from '@/lib/supabaseRpc';

const rpc = <T = any>(fn: string, params?: Record<string, any>) =>
  asPromise<{ data: T; error: any }>(supabase.rpc(fn as any, params));

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
  system_user_id?: string;
  absence_type: AbsenceType;
  start_date: string;
  end_date: string;
  total_days: number;
  status: RequestStatus;
  reason?: string;
  approved_by?: string;
  approved_at?: string;
  decline_reason?: string;
  google_calendar_event_id?: string;
  created_at: string;
  updated_at: string;
  user_name?: string;
  approver_name?: string;
  is_unpaid?: boolean;
}

export interface HolidayEntitlement {
  id: string;
  user_id: string;
  year: number;
  annual_leave_days: number;
  sick_leave_days: number;
  personal_days: number;
  carried_over_days: number;
  created_at: string;
  updated_at: string;
}

export interface StaffDetails {
  id: string;
  user_id: string;
  employee_id?: string;
  department?: string;
  position?: string;
  line_manager_id?: string;
  start_date?: string;
  contract_type: string;
  working_hours_per_week: number;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  city?: string;
  postal_code?: string;
  country: string;
  phone_number?: string;
  created_at: string;
  updated_at: string;
}

export interface RemainingLeave {
  annual_leave_remaining: number;
  sick_leave_remaining: number;
  personal_days_remaining: number;
}

export interface HolidayEntitlementsBreakdown {
  annual_allocation_working_days: number; // 25
  bank_holidays: number; // 10
  christmas_closure: number; // 5
  personal_allowance_available: number; // 10 (25 - 10 - 5)
  personal_taken: number; // calculated from bookings
  personal_remaining: number; // personal_allowance_available - personal_taken
  base_entitlement: number;
  mandatory_deductions: number;
  annual_leave_remaining: number;
  sick_leave_remaining: number;
  personal_days_remaining: number;
  public_holidays_remaining: number;
  christmas_closure_remaining: number;
}

interface HolidayContextValue {
  // Holiday Requests
  holidayRequests: HolidayRequest[];
  pendingRequests: HolidayRequest[];
  myRequests: HolidayRequest[];
  calendarRequests: HolidayRequest[]; // For calendar display - all requests for admins, user's requests for non-admins
  addHolidayRequest: (request: Omit<HolidayRequest, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'>, targetUserId?: string) => Promise<HolidayRequest | null>;
  updateHolidayRequest: (id: string, updates: Partial<HolidayRequest>) => Promise<void>;
  deleteHolidayRequest: (id: string) => Promise<void>;
  cancelMyHolidayRequest: (id: string) => Promise<boolean>;
  approveRequest: (id: string, approverId: string, options?: { override?: boolean; convertToUnpaid?: boolean }) => Promise<void>;
  declineRequest: (id: string, reason: string, approverId: string) => Promise<void>;
  
  // Holiday Entitlements
  entitlements: HolidayEntitlement[];
  remainingLeave: RemainingLeave | null;
  holidayBreakdown: HolidayEntitlementsBreakdown | null;
  updateEntitlement: (userId: string, year: number, entitlement: Partial<HolidayEntitlement>) => Promise<void>;
  
  // Staff Details
  staffDetails: StaffDetails[];
  myStaffDetails: StaffDetails | null;
  updateStaffDetails: (userId: string, details: Partial<StaffDetails>) => Promise<void>;
  
  isLoading: boolean;
  isAdmin: boolean;
}

const HolidayContext = createContext<HolidayContextValue | undefined>(undefined);

export function HolidayProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [holidayRequests, setHolidayRequests] = useState<HolidayRequest[]>([]);
  const [myOwnRequests, setMyOwnRequests] = useState<HolidayRequest[]>([]);
  const [entitlements, setEntitlements] = useState<HolidayEntitlement[]>([]);
  const [staffDetails, setStaffDetails] = useState<StaffDetails[]>([]);
  const [remainingLeave, setRemainingLeave] = useState<RemainingLeave | null>(null);
  const [holidayBreakdown, setHolidayBreakdown] = useState<HolidayEntitlementsBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mySystemUserId, setMySystemUserId] = useState<string | null>(null);

  // Load data when user changes - check admin status first then load data
  useEffect(() => {
    if (user) {
      const initializeData = async () => {
        // Check admin status first to ensure proper data loading permissions
        await checkAdminStatus();
        // Then load data with correct permissions
        await loadData();
      };
      
      initializeData();
      
      // Set up real-time subscription for holiday_requests changes
      const channel = supabase
        .channel(`holiday-requests-changes-${user.id}-${Date.now()}`)
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
            loadMyOwnRequests();
            loadRemainingLeave();
            loadHolidayBreakdown();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setHolidayRequests([]);
      setMyOwnRequests([]);
      setEntitlements([]);
      setStaffDetails([]);
      setRemainingLeave(null);
      setHolidayBreakdown(null);
      setIsAdmin(false);
      setIsLoading(false);
    }
  }, [user]);

  // Reload holiday requests when admin status changes
  useEffect(() => {
    if (user && isAdmin) {
      loadHolidayRequests();
    }
  }, [isAdmin, user]);

  const checkAdminStatus = async () => {
    if (!user) return;
    
    try {
      // Use server-side RPC to check admin status — no client-side role string checks
      const { data: isAdminResult } = await rpc<boolean>('is_admin_or_higher');
      const adminStatus = !!isAdminResult;
      setIsAdmin(adminStatus);
      return adminStatus;
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
      return false;
    }
  };

  const loadData = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      await Promise.all([
        loadMySystemUserId(),
        loadHolidayRequests(),
        loadMyOwnRequests(),
        loadEntitlements(),
        loadStaffDetails(),
        loadRemainingLeave(),
        loadHolidayBreakdown()
      ]);
    } catch (error) {
      console.error('Error loading holiday data:', error);
      // Fail silently on boot - don't show toast storm
    } finally {
      setIsLoading(false);
    }
  };

  const loadMySystemUserId = async () => {
    if (!user) return;

    try {
      const { data, error } = await rpc<string | null>('get_my_system_user_id');
      if (error) throw error;
      setMySystemUserId(data);
    } catch (error) {
      console.error('Error loading system user ID:', error);
      setMySystemUserId(null);
    }
  };

  const loadHolidayRequests = async () => {
    if (!user) return;

    try {
      // Always check admin status dynamically to avoid stale closure issues
      const { data: isAdminNow } = await rpc<boolean>('is_admin_or_higher');
      
      if (isAdminNow) {
        // Admins can see all holiday requests - keep existing admin functionality
        const { data: requests, error: requestsError } = await supabase
          .from('holiday_requests')
          .select('*')
          .order('created_at', { ascending: false });

        if (requestsError) throw requestsError;

        // For each request, get the user name from system_users table
        const requestsWithNames = [];
        for (const request of requests || []) {
          let userName = 'Unknown User';
          
          if (request.system_user_id) {
            // Use secure function to get system user name
            const { data: systemUserData } = await rpc<any[]>('get_system_user_name_secure', {
              system_user_id: request.system_user_id
            });
              
            if (systemUserData && Array.isArray(systemUserData) && systemUserData[0]) {
              userName = systemUserData[0].name;
            }
          }
          
          requestsWithNames.push({
            ...request,
            user_name: userName
          });
        }

        // Get approver names from profiles
        const approverIds = [...new Set(requests?.filter(r => r.approved_by).map(r => r.approved_by!) || [])];
        let approverNameMap = new Map();
        
        if (approverIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('user_id, name')
            .in('user_id', approverIds);

          if (profilesError) throw profilesError;
          approverNameMap = new Map(profiles?.map(p => [p.user_id, p.name]) || []);
        }

        const requestsWithNames2 = requestsWithNames?.map(request => ({
          ...request,
          approver_name: request.approved_by ? approverNameMap.get(request.approved_by) : undefined
        })) || [];

        setHolidayRequests(requestsWithNames2);
      } else {
        // For regular users, holidayRequests will be empty since they use myOwnRequests
        setHolidayRequests([]);
      }
    } catch (error) {
      console.error('Error loading holiday requests:', error);
    }
  };

  const loadMyOwnRequests = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await rpc<any[]>('get_my_holiday_requests_strict');
      
      if (error) {
        console.error('RPC error loading my requests:', error);
        return;
      }
      
      // Use the secure system_user-based RPC result
      setMyOwnRequests(data || []);
    } catch (error) {
      console.error('Error loading my own requests:', error);
    }
  };

  const loadEntitlements = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('holiday_entitlements')
        .select('*')
        .order('year', { ascending: false });

      if (error) throw error;
      setEntitlements((data || []) as any);
    } catch (error) {
      console.error('Error loading entitlements:', error);
    }
  };

  const loadStaffDetails = async () => {
    if (!user) return;

    try {
      // Check if user is admin - only they can see all staff details
      const { data: isAdminResult } = await rpc<boolean>('is_admin_or_higher');
      
      if (isAdminResult) {
        // Use secure staff data function instead of direct table access
        const { data, error } = await rpc<any[]>('get_staff_data_secure_with_audit', {
          access_reason: 'Holiday management - staff details access for admin user'
        });

        if (error) throw error;
        setStaffDetails(data || []);
      } else {
        // Regular users can only see their own basic info via secure function
        const { data, error } = await rpc<any[]>('get_my_basic_staff_info');
        
        if (error) throw error;
        
        // Transform the RPC result to match StaffDetails interface
        const transformedData: StaffDetails[] = data ? data.map((item: any) => ({
          id: item.id,
          user_id: item.user_id,
          employee_id: item.employee_id,
          department: item.department,
          position: item.staff_position, // RPC returns staff_position, map to position
          contract_type: item.contract_type || 'full_time',
          working_hours_per_week: item.working_hours_per_week || 37.5,
          country: item.country || 'United Kingdom',
          phone_number: item.phone_number,
          emergency_contact_name: item.emergency_contact_name,
          emergency_contact_phone: item.emergency_contact_phone,
          emergency_contact_relationship: item.emergency_contact_relationship,
          city: item.city,
          created_at: item.created_at,
          updated_at: item.updated_at,
          // Sensitive fields not accessible to regular users
          salary: undefined,
          date_of_birth: undefined,
          ni_number: undefined,
          bank_name: undefined,
          bank_account_number: undefined,
          bank_sort_code: undefined,
          address_line1: undefined,
          address_line2: undefined,
          postal_code: undefined,
          line_manager_id: undefined,
          start_date: undefined
        })) : [];
        
        setStaffDetails(transformedData);
      }
    } catch (error) {
      console.error('Error loading staff details:', error);
    }
  };

  const loadRemainingLeave = async () => {
    if (!user) return;

    try {
      const { data, error } = await rpc<any[]>('get_remaining_leave_days', {
        user_uuid: user.id 
      });

      if (error) throw error;
      setRemainingLeave(data[0] || null);
    } catch (error) {
      console.error('Error loading remaining leave:', error);
    }
  };

  const loadHolidayBreakdown = async () => {
    if (!user) return;

    try {
      secureLog.debug('Loading holiday breakdown');
      
      // Use the RPC function that gets data from system_users as single source of truth
      const { data: breakdown, error } = await rpc<any[]>('get_system_user_holiday_breakdown');

      if (error) {
        console.error('🔥 Error loading holiday breakdown:', error);
        throw error;
      }
      
      secureLog.debug('Breakdown data loaded', { count: breakdown?.length });
      
      if (breakdown && breakdown.length > 0) {
        const data = breakdown[0] as any; // Type assertion for newly added function properties
        secureLog.debug('Individual breakdown data loaded');
        
        // Calculate values from the actual returned data
        const baseEntitlement = data.base_entitlement || data.annual_leave_days || 25;
        const bankHolidays = data.bank_holidays || data.public_holidays || 10;
        const christmasClosureDays = data.christmas_closure || data.christmas_closure_days || 5;
        const mandatoryDeductions = bankHolidays + christmasClosureDays;
        const personalAllowanceAvailable = baseEntitlement - mandatoryDeductions;
        const personalTaken = data.personal_taken || 0;
        const personalRemaining = data.personal_remaining || data.personal_days_remaining || (personalAllowanceAvailable - personalTaken);
        
        // Map to breakdown interface using actual system_users data (no defaults!)
        const holidayBreakdown: HolidayEntitlementsBreakdown = {
          annual_allocation_working_days: baseEntitlement,
          bank_holidays: bankHolidays,
          christmas_closure: christmasClosureDays, // This should now show 3 instead of 5
          personal_allowance_available: personalAllowanceAvailable,
          personal_taken: personalTaken,
          personal_remaining: personalRemaining,
          base_entitlement: baseEntitlement,
          mandatory_deductions: mandatoryDeductions,
          annual_leave_remaining: personalRemaining,
          sick_leave_remaining: data.sick_leave_remaining || 0,
          personal_days_remaining: data.personal_days_remaining || 0,
          public_holidays_remaining: 0,
          christmas_closure_remaining: 0
        };
        
        secureLog.debug('Holiday breakdown calculated');
        setHolidayBreakdown(holidayBreakdown);
      } else {
        secureLog.debug('No breakdown data found');
        // No data found - show zeros instead of defaults
        const emptyBreakdown: HolidayEntitlementsBreakdown = {
          annual_allocation_working_days: 0,
          bank_holidays: 0,
          christmas_closure: 0,
          personal_allowance_available: 0,
          personal_taken: 0,
          personal_remaining: 0,
          base_entitlement: 0,
          mandatory_deductions: 0,
          annual_leave_remaining: 0,
          sick_leave_remaining: 0,
          personal_days_remaining: 0,
          public_holidays_remaining: 0,
          christmas_closure_remaining: 0
        };
        
        setHolidayBreakdown(emptyBreakdown);
      }
    } catch (error) {
      console.error('Error loading holiday breakdown:', error);
      setHolidayBreakdown(null);
    }
  };

  const addHolidayRequest = async (request: Omit<HolidayRequest, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'>, targetUserId?: string) => {
    if (!user) return null;

    try {
      // Always use the secure function — server-side enforces admin checks for cross-user requests
      const { data, error } = await supabase.rpc('create_holiday_request_secure', {
        p_absence_type: request.absence_type,
        p_start_date: request.start_date,
        p_end_date: request.end_date,
        p_reason: request.reason || null,
        p_target_user_id: targetUserId || null
      });
      
      if (error) throw error;
      
      const requestId = data;
      
      await loadHolidayRequests();
      await loadHolidayBreakdown();

      // Send approval notifications to the right role group
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', user.id)
        .single();

      notifyHolidayApprovers({
        requestId: requestId,
        requesterUserId: user.id,
        requesterName: myProfile?.name || 'Unknown',
        absenceType: request.absence_type,
        startDate: request.start_date,
        endDate: request.end_date,
        totalDays: request.total_days,
      });
      
      if (targetUserId) {
        toast({
          title: 'Holiday Request Created',
          description: 'Holiday request has been created for the selected user',
        });
        return null;
      } else {
        await loadMyOwnRequests();
        toast({
          title: 'Holiday Request Submitted',
          description: 'Your holiday request has been submitted successfully and is pending approval',
        });
        return {
          id: requestId,
          user_id: user.id,
          ...request,
          status: 'pending' as RequestStatus,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
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

      // Add a small delay to ensure database changes are processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Refresh all relevant data
      await Promise.all([
        loadHolidayRequests(),
        loadMyOwnRequests(),
        loadRemainingLeave(),
        loadHolidayBreakdown()
      ]);
    } catch (error) {
      console.error('Error updating holiday request:', error);
      toast({
        title: 'Error',
        description: 'Failed to update holiday request',
        variant: 'destructive'
      });
    }
  };

  const approveRequest = async (id: string, approverId: string, options?: { override?: boolean; convertToUnpaid?: boolean }) => {
    try {
      const existing = holidayRequests.find(r => r.id === id);

      const { data, error } = await supabase
        .rpc('approve_holiday_request_secure', {
          p_request_id: id,
          p_override: options?.override ?? false,
          p_convert_to_unpaid: options?.convertToUnpaid ?? false,
        });

      if (error) throw error;

      const approvedRequest = data && typeof data === 'object' ? data as Partial<HolidayRequest> : null;

      if (approvedRequest) {
        setHolidayRequests(prev => prev.map(request =>
          request.id === id
            ? {
                ...request,
                ...approvedRequest,
                status: 'approved',
                approved_by: approvedRequest.approved_by ?? approverId,
                approver_name: request.approver_name,
              }
            : request
        ));
      }

      // Notify the requester that their request was approved
      const requesterUserId = approvedRequest?.user_id ?? existing?.user_id;
      const absenceType = approvedRequest?.absence_type ?? existing?.absence_type;
      const startDate = approvedRequest?.start_date ?? existing?.start_date;
      const endDate = approvedRequest?.end_date ?? existing?.end_date;
      const totalDays = approvedRequest?.total_days ?? existing?.total_days ?? 0;
      if (requesterUserId && absenceType && startDate && endDate) {
        await notifyHolidayRequester({
          requesterUserId,
          decision: 'approved',
          absenceType,
          startDate,
          endDate,
          totalDays,
        });
      }

      // Clear "Holiday Approval Required" notifications for every other approver
      await (supabase.rpc as any)('clear_holiday_approval_notifications', { p_request_id: id });

      await loadHolidayRequests();
      await loadMyOwnRequests();
      await loadRemainingLeave();
      await loadHolidayBreakdown();
      
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
      const existing = holidayRequests.find(r => r.id === id);

      const { data, error } = await supabase
        .rpc('decline_holiday_request_secure', {
          request_id: id,
          p_decline_reason: reason,
          approver_id: approverId
        });

      if (error) throw error;

      // Check the response message
      if (data && data.startsWith('ERROR:')) {
        toast({
          title: 'Cannot Decline',
          description: data.replace('ERROR: ', ''),
          variant: 'destructive'
        });
        return;
      }

      // Notify the requester that their request was declined
      if (existing) {
        await notifyHolidayRequester({
          requesterUserId: existing.user_id,
          decision: 'declined',
          absenceType: existing.absence_type,
          startDate: existing.start_date,
          endDate: existing.end_date,
          totalDays: existing.total_days,
          reason,
        });
      }

      // Clear "Holiday Approval Required" notifications for every other approver
      await (supabase.rpc as any)('clear_holiday_approval_notifications', { p_request_id: id });

      await loadHolidayRequests();
      await loadRemainingLeave();
      // Refresh breakdown to reflect decline changes
      await loadHolidayBreakdown();
      
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
      await loadMyOwnRequests();
      await loadRemainingLeave();
      await loadHolidayBreakdown();
      
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

  const cancelMyHolidayRequest = async (id: string) => {
    try {
      // Optimistically update the local state immediately
      setMyOwnRequests(prev => 
        prev.map(request => 
          request.id === id 
            ? { ...request, status: 'cancelled' as RequestStatus, updated_at: new Date().toISOString() }
            : request
        )
      );
      
      // Also update the main holidayRequests if admin
      if (isAdmin) {
        setHolidayRequests(prev => 
          prev.map(request => 
            request.id === id 
              ? { ...request, status: 'cancelled' as RequestStatus, updated_at: new Date().toISOString() }
              : request
          )
        );
      }

      const { data, error } = await supabase.rpc('cancel_holiday_request_secure', { 
        request_id: id 
      });

      if (error) {
        // Revert optimistic update on error
        await loadMyOwnRequests();
        if (isAdmin) {
          await loadHolidayRequests();
        }
        throw error;
      }

      if (data === true) {
        // Refresh data in background to ensure consistency
        await Promise.all([
          loadMyOwnRequests(),
          isAdmin && loadHolidayRequests(),
          loadHolidayBreakdown(),
          loadRemainingLeave()
        ].filter(Boolean));
        
        return true;
      }

      // Revert optimistic update if RPC returned false
      await loadMyOwnRequests();
      if (isAdmin) {
        await loadHolidayRequests();
      }
      return false;
    } catch (error) {
      console.error('Error cancelling request:', error);
      // Error handling is done above with revert
      throw error;
    }
  };

  const updateEntitlement = async (userId: string, year: number, entitlement: Partial<HolidayEntitlement>) => {
    try {
      const { error } = await supabase
        .from('holiday_entitlements')
        .upsert({
          user_id: userId,
          year,
          ...entitlement
        } as any);

      if (error) throw error;

      await loadEntitlements();
      await loadRemainingLeave();
    } catch (error) {
      console.error('Error updating entitlement:', error);
      toast({
        title: 'Error',
        description: 'Failed to update entitlement',
        variant: 'destructive'
      });
    }
  };

  const updateStaffDetails = async (userId: string, details: Partial<StaffDetails>) => {
    try {
      // Check if user is admin to determine update method
      const { data: isAdminResult } = await supabase.rpc('is_admin_or_higher');
      
      if (isAdminResult) {
        // Admin users: Use secure staff data update via RLS policies
        const { error } = await supabase
          .from('staff_details')
          .upsert([{
            user_id: userId,
            ...details
          }] as any);

        if (error) throw error;
      } else {
        // Regular users can only update their own basic info via secure function
        if (userId !== user?.id) {
          throw new Error('Access denied: Can only update own profile');
        }
        
        const { error } = await supabase.rpc('update_my_staff_basic_info', {
          new_phone_number: details.phone_number,
          new_emergency_contact_name: details.emergency_contact_name,
          new_emergency_contact_phone: details.emergency_contact_phone,
          new_emergency_contact_relationship: details.emergency_contact_relationship,
        });

        if (error) throw error;
      }

      await loadStaffDetails();
      
      toast({
        title: 'Success',
        description: 'Staff details updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating staff details:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update staff details',
        variant: 'destructive'
      });
    }
  };

  // Computed values
  const pendingRequests = useMemo(() => 
    holidayRequests.filter(request => request.status === 'pending'),
    [holidayRequests]
  );

  const myRequests = useMemo(() => {
    // Use the dedicated myOwnRequests state which is loaded via RPC
    // This ensures we only see the current user's requests, not admin-created ones
    return myOwnRequests;
  }, [myOwnRequests]);

  const myStaffDetails = useMemo(() => 
    staffDetails.find(details => details.user_id === user?.id) || null,
    [staffDetails, user]
  );

  const calendarRequests = useMemo(() => 
    isAdmin ? holidayRequests : myRequests,
    [isAdmin, holidayRequests, myRequests]
  );

  const value = useMemo(() => ({
    holidayRequests,
    pendingRequests,
    myRequests,
    calendarRequests,
    addHolidayRequest,
    updateHolidayRequest,
    deleteHolidayRequest,
    cancelMyHolidayRequest,
    approveRequest,
    declineRequest,
    entitlements,
    remainingLeave,
    holidayBreakdown,
    updateEntitlement,
    staffDetails,
    myStaffDetails,
    updateStaffDetails,
    isLoading,
    isAdmin
  }), [
    holidayRequests,
    pendingRequests,
    myRequests,
    calendarRequests,
    entitlements,
    remainingLeave,
    holidayBreakdown,
    staffDetails,
    myStaffDetails,
    isLoading,
    isAdmin
  ]);

  return (
    <HolidayContext.Provider value={value}>
      {children}
    </HolidayContext.Provider>
  );
}

export function useHoliday() {
  const context = useContext(HolidayContext);
  if (context === undefined) {
    throw new Error('useHoliday must be used within a HolidayProvider');
  }
  return context;
}
