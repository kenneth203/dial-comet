import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, Clock, RefreshCw } from "lucide-react";
import { useHoliday } from "@/context/HolidayContext";
import { useMemo } from "react";

export function SickLeaveCard() {
  const { holidayBreakdown, isLoading, myRequests } = useHoliday();

  // Calculate pending sick leave requests
  const pendingSickLeave = useMemo(() => {
    return myRequests
      .filter(request => request.status === 'pending' && request.absence_type === 'sick_leave')
      .reduce((total, request) => total + request.total_days, 0);
  }, [myRequests]);

  // Calculate total available considering pending requests
  const effectiveRemainingSickLeave = useMemo(() => {
    const remaining = holidayBreakdown?.sick_leave_remaining || 0;
    return Math.max(0, remaining - pendingSickLeave);
  }, [holidayBreakdown?.sick_leave_remaining, pendingSickLeave]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Sick Leave</CardTitle>
          <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold animate-pulse bg-muted h-8 w-16 rounded"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>Sick Leave</CardTitle>
        <TrendingDown className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Main sick leave display */}
          <div>
            <div className="text-2xl font-bold text-primary">
              {holidayBreakdown?.sick_leave_remaining || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Days available
            </p>
          </div>

          {/* Pending requests warning */}
          {pendingSickLeave > 0 && (
            <div className="p-2 bg-orange-50 dark:bg-orange-950/20 rounded-md border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                <Clock className="h-3 w-3" />
                <span className="text-xs font-medium">
                  {pendingSickLeave} days pending approval
                </span>
              </div>
              <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                Effectively {effectiveRemainingSickLeave} days available
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}