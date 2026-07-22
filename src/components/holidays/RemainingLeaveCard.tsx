import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, TrendingDown, Clock, RefreshCw } from "lucide-react";
import { useHoliday } from "@/context/HolidayContext";
import { useMemo } from "react";

export function RemainingLeaveCard() {
  const { holidayBreakdown, isLoading, myRequests } = useHoliday();

  // Calculate pending annual leave requests
  const pendingAnnualLeave = useMemo(() => {
    return myRequests
      .filter(request => request.status === 'pending' && request.absence_type === 'annual_leave')
      .reduce((total, request) => total + request.total_days, 0);
  }, [myRequests]);

  // Calculate total available considering pending requests
  const effectiveRemainingLeave = useMemo(() => {
    const remaining = holidayBreakdown?.personal_remaining || 0;
    return Math.max(0, remaining - pendingAnnualLeave);
  }, [holidayBreakdown?.personal_remaining, pendingAnnualLeave]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Annual Leave</CardTitle>
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
        <CardTitle>Annual Leave</CardTitle>
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Main annual leave display */}
          <div>
            <div className="text-2xl font-bold text-primary">
              {holidayBreakdown?.personal_remaining || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Days available to book
            </p>
          </div>

          {/* Pending requests warning */}
          {pendingAnnualLeave > 0 && (
            <div className="p-2 bg-orange-50 dark:bg-orange-950/20 rounded-md border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                <Clock className="h-3 w-3" />
                <span className="text-xs font-medium">
                  {pendingAnnualLeave} days pending approval
                </span>
              </div>
              <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                Effectively {effectiveRemainingLeave} days available
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}