import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Users, AlertTriangle } from "lucide-react";
import { HolidayAdminUserSummaryCard } from "./HolidayAdminUserSummaryCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useHoliday } from "@/context/HolidayContext";
import { calculateApprovedHolidayUsage } from "@/lib/holidayUsage";

interface HolidayOverviewData {
  auth_user_id: string;
  system_user_id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  base_annual: number;
  annual_booked: number;
  annual_remaining: number;
  sick_remaining: number;
  personal_remaining: number;
  personal_taken: number;
  bank_holidays: number;
  carried_over: number;
  christmas_closure: number;
  available_for_booking: number;
  mandatory_deductions: number;
}

export function HolidayAdminUserSummaryGrid() {
  const [data, setData] = useState<HolidayOverviewData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { holidayRequests } = useHoliday();
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);

  const loadHolidayOverview = async (backgroundRefresh = false) => {
    try {
      if (isInitialLoad.current) {
        setIsLoading(true);
      } else if (backgroundRefresh) {
        setIsRefreshing(true);
      }
      setError(null);
      
      const { data: overviewData, error: rpcError } = await supabase
        .rpc('get_holiday_admin_overview');

      if (rpcError) {
        console.error('RPC Error:', rpcError);
        throw rpcError;
      }

      if (!overviewData) {
        setData([]);
        return;
      }

      const currentYear = new Date().getFullYear();

      setData(overviewData.map((item: any) => {
        // RPC returns: user_id, user_name, user_role, annual_leave_entitlement,
        // annual_leave_used, sick_leave_used, personal_days_used, pending_requests
        const baseAnnual = Number(item.annual_leave_entitlement ?? item.base_annual ?? 0);
        const carriedOver = Number(item.carried_over || 0);
        const bankHolidays = Number(item.bank_holidays || 0);
        const christmasClosure = Number(item.christmas_closure || 0);
        const usage = calculateApprovedHolidayUsage(holidayRequests, currentYear, {
          authUserId: item.auth_user_id ?? item.user_id ?? null,
          systemUserId: item.system_user_id ?? item.user_id ?? null,
        });
        const annualBooked = usage.annual;
        const sickUsed = usage.sick;
        const personalUsed = usage.personal;
        const sickEntitlement = Number(item.sick_leave_entitlement ?? 0);
        const personalEntitlement = Number(item.personal_days_entitlement ?? 0);
        const sickRemaining = Number(item.sick_remaining ?? Math.max(0, sickEntitlement - sickUsed));
        const personalRemaining = Number(item.personal_remaining ?? Math.max(0, personalEntitlement - personalUsed));

        const availableForBooking = Math.max(0, baseAnnual + carriedOver - bankHolidays - christmasClosure);
        const annualRemaining = Math.max(0, availableForBooking - annualBooked);

        return {
          auth_user_id: item.auth_user_id ?? item.user_id,
          system_user_id: item.system_user_id ?? item.user_id,
          name: item.name ?? item.user_name ?? 'Unknown User',
          email: item.email ?? '',
          role: item.role ?? item.user_role ?? '',
          department: item.department || '',
          base_annual: baseAnnual,
          annual_booked: annualBooked,
          annual_remaining: annualRemaining,
          sick_remaining: sickRemaining,
          personal_remaining: personalRemaining,
          personal_taken: personalUsed,
          bank_holidays: bankHolidays,
          carried_over: carriedOver,
          christmas_closure: christmasClosure,
          available_for_booking: availableForBooking,
          mandatory_deductions: bankHolidays + christmasClosure
        };
      }));
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
      }
    } catch (err) {
      console.error('Error loading holiday overview:', err);
      setError(err instanceof Error ? err.message : 'Failed to load holiday overview');
      if (!backgroundRefresh) {
        toast.error('Failed to load holiday overview');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadHolidayOverview();
  }, []);

  // Auto-refresh when holiday requests change (with debouncing)
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(() => {
      if (!isInitialLoad.current) {
        loadHolidayOverview(true);
      }
    }, 500);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [holidayRequests]);

  // Real-time updates for holiday requests and system users
  useEffect(() => {
    const channel = supabase
      .channel('holiday_admin_overview_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'holiday_requests'
        },
        () => {
          console.log('🔄 Holiday request changed, refreshing admin overview...');
          loadHolidayOverview(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_users'
        },
        () => {
          console.log('🔄 System user changed, refreshing admin overview...');
          loadHolidayOverview(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'holiday_entitlements'
        },
        () => {
          console.log('🔄 Holiday entitlement changed, refreshing admin overview...');
          loadHolidayOverview(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = () => {
    loadHolidayOverview(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Per-User Holiday Overview
          </CardTitle>
          <CardDescription>
            Loading holiday summary for all active users...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Per-User Holiday Overview
          </CardTitle>
          <CardDescription>
            Holiday summary for all active users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <div className="text-center">
              <p className="font-medium text-destructive">Failed to load holiday overview</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Per-User Holiday Overview
          </CardTitle>
          <CardDescription>
            Holiday summary for all active users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Users className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">No active users found</p>
              <p className="text-sm text-muted-foreground mt-1">
                No users with Active status are currently in the system
              </p>
            </div>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Per-User Holiday Overview
          </h2>
          <p className="text-muted-foreground">
            Holiday summary for {data.length} active user{data.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm" disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {data.map((user) => (
          <HolidayAdminUserSummaryCard 
            key={user.system_user_id} 
            data={user} 
          />
        ))}
      </div>
    </div>
  );
}