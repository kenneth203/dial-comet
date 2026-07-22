
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { secureLog } from "@/lib/secureLogger";
import { useAuth } from "@/context/AuthContext";
import { useHoliday } from "@/context/HolidayContext";
import { HolidayAdminUserSummaryCard } from "./HolidayAdminUserSummaryCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { calculateApprovedHolidayUsage } from "@/lib/holidayUsage";

export function MyHolidayOverview() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { holidayBreakdown } = useHoliday();
  
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for realtime changes to system users and holiday data.
  // NOTE: holiday_entitlements / system_users updates from admin may be keyed by
  // system_users.id (not auth.uid()), so a `user_id=eq.<auth.uid>` filter would
  // miss them. We subscribe broadly here (volume is low) and let the query
  // refetch decide whether anything actually changed.
  useEffect(() => {
    if (!user) return;

    const queryKey = ['my-holiday-overview', user.id];

    const scheduleRefetch = (reason: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        secureLog.debug(`Holiday data changed (${reason}), refetching overview`);
        // Force an immediate refetch of the active query rather than just marking it stale.
        queryClient.refetchQueries({ queryKey, type: 'active' });
      }, 200);
    };

    const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`my_holiday_data_changes_${user.id}_${uniqueId}`)
      // Broad subscriptions — entitlement rows may be keyed by either auth.uid()
      // or system_users.id, and we cannot know the mapping client-side without
      // an extra round-trip. The RPC handles both keys; we just need to know
      // *something* changed.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_users' },
        () => scheduleRefetch('system_users'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holiday_requests' },
        () => scheduleRefetch('holiday_requests'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holiday_entitlements' },
        () => scheduleRefetch('holiday_entitlements'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_quota_defaults' },
        () => scheduleRefetch('leave_quota_defaults'))
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        queryClient.refetchQueries({ queryKey, type: 'active' });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    const poll = window.setInterval(() => {
      queryClient.refetchQueries({ queryKey, type: 'active' });
    }, 30000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(poll);
    };
  }, [user, queryClient]);

  
  const { data: overviewData, isLoading, error } = useQuery({
    queryKey: ['my-holiday-overview', user?.id],
    queryFn: async () => {
      secureLog.debug('Loading my holiday overview data');
      
      try {
        const { data, error } = await supabase
          .rpc('get_my_holiday_overview');

        if (error) {
          secureLog.error('Error loading my holiday overview', error);
          throw error;
        }

        secureLog.debug('Holiday overview data loaded');
        
        // Validate data structure
        if (!data || !Array.isArray(data) || data.length === 0) {
          secureLog.debug('No holiday overview data returned');
          return null;
        }

        const firstRecord = data[0];
        secureLog.debug('Holiday overview record loaded');
        
        return data;
      } catch (err) {
        secureLog.error('Caught error in holiday overview query', err);
        throw err;
      }
    },
    enabled: !!user,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">My Holiday Overview</h3>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">My Holiday Overview</h3>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load your holiday overview: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!overviewData || overviewData.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">My Holiday Overview</h3>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No holiday data found. Please contact your administrator.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const userData = overviewData[0] as any;

  const baseAnnual = Number(userData.annual_leave_entitlement || 0);
  const carriedOver = Number(userData.carried_over || 0);
  const bankHolidays = Number(holidayBreakdown?.bank_holidays || 0);
  const christmasClosure = Number(holidayBreakdown?.christmas_closure || 0);
  const currentYear = new Date().getFullYear();
  const usage = calculateApprovedHolidayUsage(userData.requests ?? [], currentYear);
  const annualBooked = usage.annual;
  
  const availableForBooking = Math.max(0, baseAnnual + carriedOver - bankHolidays - christmasClosure);
  const annualRemaining = Math.max(0, availableForBooking - annualBooked);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">My Holiday Overview</h3>
      <HolidayAdminUserSummaryCard data={{
        auth_user_id: user?.id || '',
        system_user_id: user?.id || '',
        name: user?.email || 'User',
        email: user?.email || '',
        role: 'Staff',
        department: 'Unknown',
        base_annual: baseAnnual,
        annual_booked: annualBooked,
        annual_remaining: annualRemaining,
        sick_remaining: Number(userData.sick_leave_entitlement || 0) - usage.sick,
        personal_remaining: Number(userData.personal_days_entitlement || 0) - usage.personal,
        personal_taken: usage.personal,
        bank_holidays: bankHolidays,
        carried_over: carriedOver,
        christmas_closure: christmasClosure,
        available_for_booking: availableForBooking,
        mandatory_deductions: bankHolidays + christmasClosure
      }} />
    </div>
  );
}
