import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, Clock, RefreshCw, Info, Lock, HelpCircle } from "lucide-react";
import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";

interface HolidayOverviewData {
  annual_leave_allowed: number;
  annual_leave_remaining: number;
  annual_leave_used: number;
  sick_leave_allowed: number;
  sick_leave_remaining: number;
  sick_leave_used: number;
  personal_days_allowed: number;
  personal_days_remaining: number;
  personal_days_used: number;
  public_holidays: number;
  carried_over_days: number;
}

interface SystemUserHolidayOverviewCardProps {
  userId: string;
  userName: string;
}

interface SystemUserHolidayOverviewCardRef {
  refresh: () => void;
}

export const SystemUserHolidayOverviewCard = forwardRef<
  SystemUserHolidayOverviewCardRef,
  SystemUserHolidayOverviewCardProps
>(({ userId, userName }, ref) => {
  const [holidayData, setHolidayData] = useState<HolidayOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadHolidayData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('get_system_user_holiday_breakdown', {
        target_user_id: userId
      });

      if (error) throw error;
      
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
        setHolidayData(null);
      }
    } catch (error) {
      console.error(`Error loading holiday data for ${userName}:`, error);
      setHolidayData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadHolidayData();
    }
  }, [userId]);

  useImperativeHandle(ref, () => ({
    refresh: loadHolidayData,
  }));

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Holiday Entitlements - {userName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="h-20 bg-muted rounded"></div>
              <div className="h-20 bg-muted rounded"></div>
              <div className="h-20 bg-muted rounded"></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-24 bg-muted rounded"></div>
              <div className="h-24 bg-muted rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!holidayData) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            Holiday Entitlements - {userName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No holiday data available</div>
        </CardContent>
      </Card>
    );
  }

  // Calculate totals from the available data
  const totalQuota = holidayData.annual_leave_allowed + holidayData.sick_leave_allowed + holidayData.personal_days_allowed;
  const totalUsed = holidayData.annual_leave_used + holidayData.sick_leave_used + holidayData.personal_days_used;
  const totalRemaining = holidayData.annual_leave_remaining + holidayData.sick_leave_remaining + holidayData.personal_days_remaining;

  return (
    <TooltipProvider>
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Holiday Entitlements - {userName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Top Tiles - Total Overview */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-1">
                  <span className="text-sm font-medium text-muted-foreground">Quota</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total discretionary leave days you can book this year</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-primary">{totalQuota}</div>
              </div>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-1">
                  <span className="text-sm font-medium text-muted-foreground">Used</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Approved leave days taken this year</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-orange-600">{totalUsed}</div>
              </div>
            </Card>

            <Card className="p-4 bg-gradient-to-br from-green-600/10 to-green-600/5 border-green-600/20">
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-1">
                  <span className="text-sm font-medium text-muted-foreground">Remaining</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Leave days still available to book</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-green-600">{totalRemaining}</div>
              </div>
            </Card>
          </div>

          {/* Category Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Annual Leave */}
            <Card className="p-4 border-l-4 border-l-primary">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Annual Leave</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Includes carried over days, minus bank holidays and Christmas closure</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <div className="font-semibold text-lg">{holidayData.annual_leave_allowed}</div>
                    <div className="text-muted-foreground">Allowed</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg text-orange-600">{holidayData.annual_leave_used}</div>
                    <div className="text-muted-foreground">Used</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg text-green-600">{holidayData.annual_leave_remaining}</div>
                    <div className="text-muted-foreground">Remaining</div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Sick Leave */}
            <Card className="p-4 border-l-4 border-l-red-500">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-red-500" />
                  <span className="font-medium text-sm">Sick Leave</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <div className="font-semibold text-lg">{holidayData.sick_leave_allowed}</div>
                    <div className="text-muted-foreground">Allowed</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg text-orange-600">{holidayData.sick_leave_used}</div>
                    <div className="text-muted-foreground">Used</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg text-green-600">{holidayData.sick_leave_remaining}</div>
                    <div className="text-muted-foreground">Remaining</div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Personal Days */}
            <Card className="p-4 border-l-4 border-l-blue-500">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <span className="font-medium text-sm">Personal Days</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <div className="font-semibold text-lg">{holidayData.personal_days_allowed}</div>
                    <div className="text-muted-foreground">Allowed</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg text-orange-600">{holidayData.personal_days_used}</div>
                    <div className="text-muted-foreground">Used</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg text-green-600">{holidayData.personal_days_remaining}</div>
                    <div className="text-muted-foreground">Remaining</div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Public Holidays */}
            <Card className="p-4 border-l-4 border-l-gray-400 bg-muted/50">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm text-muted-foreground">Bank Holiday/Closures</span>
                  <Badge variant="secondary" className="text-xs">Read-only</Badge>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-lg text-muted-foreground">{holidayData.public_holidays}d mandatory</div>
                  <div className="text-xs text-muted-foreground">Auto-deducted from annual leave</div>
                </div>
              </div>
            </Card>

            {/* Carried Over */}
            {holidayData.carried_over_days > 0 && (
              <Card className="p-4 border-l-4 border-l-amber-500 bg-amber-50/50">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-amber-500" />
                    <span className="font-medium text-sm">Carried Over</span>
                  </div>
                  <div className="text-center">
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                      {holidayData.carried_over_days}d from last year
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">Added to annual leave</div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Raw Data Summary */}
          <Card className="p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="font-medium">Current Year Summary:</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span>Annual leave: {holidayData.annual_leave_allowed}d</span>
                <span>Bank holidays: {holidayData.public_holidays}d</span>
                <span>Sick leave: {holidayData.sick_leave_allowed}d</span>
                <span>Carried over: {holidayData.carried_over_days}d</span>
              </div>
            </div>
          </Card>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
});