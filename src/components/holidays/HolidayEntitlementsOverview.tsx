import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, RefreshCw } from "lucide-react";
import { useHoliday } from "@/context/HolidayContext";

export function HolidayEntitlementsOverview() {
  const { holidayBreakdown, isLoading } = useHoliday();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Holiday Entitlements Overview</CardTitle>
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

  if (!holidayBreakdown) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Holiday Entitlements Overview</CardTitle>
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
        <CardTitle>Holiday Entitlements Overview</CardTitle>
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Base Holiday Calculation */}
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="text-sm font-medium mb-2">Base Holiday Calculation</div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs text-muted-foreground">
              <div className="text-center">
                <div className="font-semibold text-lg text-foreground">{holidayBreakdown.base_entitlement}</div>
                <div>Base Entitlement</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-destructive">-{holidayBreakdown.mandatory_deductions}</div>
                <div>Mandatory Deductions</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-primary">{holidayBreakdown.personal_allowance_available}</div>
                <div>Personal Choice</div>
              </div>
            </div>
          </div>

          {/* Mandatory Holidays (Auto-assigned) */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Mandatory Holidays (Auto-assigned)</div>
            <div className="pl-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>UK Bank Holidays:</span>
                <span className="font-mono text-muted-foreground">{holidayBreakdown.bank_holidays} days</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Christmas Closure:</span>
                <span className="font-mono text-muted-foreground">{holidayBreakdown.christmas_closure} days</span>
              </div>
            </div>
          </div>

          {/* Available for Booking */}
          <div className="space-y-2 pt-2 border-t">
            <div className="text-sm font-medium text-muted-foreground">Available for Booking</div>
            <div className="pl-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Annual Leave (Personal Choice):</span>
                <span className="font-mono font-semibold text-primary">{holidayBreakdown.personal_remaining} days</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Sick Leave:</span>
                <span className="font-mono">{holidayBreakdown.sick_leave_remaining} days</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Personal Days:</span>
                <span className="font-mono">{holidayBreakdown.personal_days_remaining} days</span>
              </div>
            </div>
          </div>

          {/* Personal Leave Breakdown */}
          <div className="bg-orange-50 dark:bg-orange-950/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
            <div className="text-sm font-medium mb-2">Personal Annual Leave Status</div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs">
              <div className="text-center">
                <div className="font-semibold text-lg text-foreground">{holidayBreakdown.personal_allowance_available}</div>
                <div className="text-muted-foreground">Available</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-orange-700 dark:text-orange-300">{holidayBreakdown.personal_taken}</div>
                <div className="text-muted-foreground">Taken</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-green-700 dark:text-green-300">{holidayBreakdown.personal_remaining}</div>
                <div className="text-muted-foreground">Remaining</div>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-primary/10 p-3 rounded-lg">
            <div className="text-sm font-medium mb-1">Available to Book Now</div>
            <div className="text-2xl font-bold text-primary">
              {holidayBreakdown.personal_remaining} days
            </div>
            <div className="text-xs text-muted-foreground">
              Personal choice holidays remaining
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}