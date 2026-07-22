import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, RefreshCw, TrendingDown } from "lucide-react";
import { useEffect, useState, useImperativeHandle, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface HolidayData {
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
}

interface SystemUserHolidayCardProps {
  userId: string;
  userName: string;
}

export interface SystemUserHolidayCardRef {
  refresh: () => Promise<void>;
}

export const SystemUserHolidayCard = forwardRef<SystemUserHolidayCardRef, SystemUserHolidayCardProps>(
  ({ userId, userName }, ref) => {
  const { user } = useAuth();
  const [holidayData, setHolidayData] = useState<HolidayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Expose refresh function to parent components
  useImperativeHandle(ref, () => ({
    refresh: loadHolidayData
  }));

  useEffect(() => {
    if (userId) {
      loadHolidayData();
    }
  }, [userId]);

  const loadHolidayData = async () => {
    setIsLoading(true);
    try {
      console.log(`🔥 Loading holiday data for system user ID: ${userId} (${userName})`);
      
      // Use the new RPC function that works directly with system user IDs
      const { data, error } = await (supabase as any)
        .rpc('get_system_user_holiday_breakdown', { 
          target_user_id: userId 
        });

      if (error) {
        console.error('Database error:', error);
        throw error;
      }
      
      console.log(`🔥 Holiday data loaded for ${userName}:`, data);
      if (data && data.length > 0) {
        const holidayData = data[0];
        // Map new RPC response fields to expected data structure
        setHolidayData({
          annual_leave_allowed: holidayData.base_entitlement || 0,
          annual_leave_used: holidayData.personal_taken || 0,
          annual_leave_remaining: Math.max(0, (holidayData.base_entitlement || 0) - (holidayData.personal_taken || 0)),
          sick_leave_allowed: 10, // Default value since not in response
          sick_leave_used: 0,
          sick_leave_remaining: holidayData.sick_leave_remaining || 0,
          personal_days_allowed: holidayData.personal_allowance_available || 0,
          personal_days_used: holidayData.personal_taken || 0,
          personal_days_remaining: holidayData.personal_days_remaining || 0,
          public_holidays: holidayData.bank_holidays || 0,
          carried_over_days: 0 // Not available in this response
        });
      } else {
        console.log(`No holiday data returned for ${userName}`);
        setHolidayData(null);
      }
    } catch (error) {
      console.error(`Error loading holiday data for ${userName} (${userId}):`, error);
      setHolidayData(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Holiday Entitlements - {userName}</CardTitle>
          <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-6 bg-muted rounded w-16"></div>
            <div className="h-4 bg-muted rounded w-24"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!holidayData) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Holiday Entitlements - {userName}</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No holiday data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>Holiday Entitlements - {userName}</CardTitle>
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex justify-center items-center gap-4 sm:gap-8 py-4 sm:py-6 flex-wrap">
          {/* Annual Leave Taken */}
          <div className="text-center">
            <div className="text-6xl font-extrabold text-red-600 leading-none">
              {holidayData.annual_leave_used || 0}
            </div>
            <div className="text-sm font-medium text-muted-foreground mt-2">Taken</div>
          </div>
          
          {/* Pending/In Progress */}
          <div className="text-center">
            <div className="text-6xl font-extrabold text-orange-600 leading-none">
              0
            </div>
            <div className="text-sm font-medium text-muted-foreground mt-2">Pending</div>
          </div>
          
          {/* Annual Leave Remaining */}
          <div className="text-center">
            <div className="text-6xl font-extrabold text-green-600 leading-none">
              {holidayData.annual_leave_remaining || 0}
            </div>
            <div className="text-sm font-medium text-muted-foreground mt-2">Remaining</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});