import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Calendar, Heart, Coffee } from "lucide-react";

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

interface HolidayAdminUserSummaryCardProps {
  data: HolidayOverviewData;
}

export function HolidayAdminUserSummaryCard({ data }: HolidayAdminUserSummaryCardProps) {
  const formatDays = (days: number) => {
    return days % 1 === 0 ? days.toString() : days.toFixed(1);
  };

  const getStatusColor = (remaining: number, available: number) => {
    const percentage = (remaining / available) * 100;
    if (percentage >= 75) return "bg-success/10 text-success";
    if (percentage >= 50) return "bg-warning/10 text-warning";
    if (percentage >= 25) return "bg-orange-500/10 text-orange-500";
    return "bg-destructive/10 text-destructive";
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {data.name}
          </CardTitle>
          <Badge variant="secondary">{data.role}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{data.email}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Annual Leave Summary */}
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Annual Leave Summary
          </h4>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Available</p>
              <p className="font-semibold text-primary">{formatDays(data.base_annual + data.carried_over)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Booked</p>
              <p className="font-semibold">{formatDays(data.annual_booked)}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-muted-foreground">Remaining</p>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{formatDays(data.annual_remaining)}</p>
                <Badge 
                  variant="outline" 
                  className={getStatusColor(data.annual_remaining, data.available_for_booking)}
                >
                  {data.available_for_booking > 0 ? Math.round((data.annual_remaining / data.available_for_booking) * 100) : 0}%
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Leave Breakdown */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-card border">
            <h5 className="font-medium text-sm mb-2">Base Annual</h5>
            <p className="text-lg font-semibold">{formatDays(data.base_annual)}</p>
          </div>
          
          <div className="p-3 rounded-lg bg-card border">
            <h5 className="font-medium text-sm mb-2">Carried Over</h5>
            <p className="text-lg font-semibold">{formatDays(data.carried_over)}</p>
          </div>
          
          <div className="p-3 rounded-lg bg-card border">
            <h5 className="font-medium text-sm mb-2">Bank Holidays</h5>
            <p className="text-lg font-semibold">{formatDays(data.bank_holidays)}</p>
          </div>
          
          <div className="p-3 rounded-lg bg-card border">
            <h5 className="font-medium text-sm mb-2">Available for Booking</h5>
            <p className="text-lg font-semibold">{formatDays(data.available_for_booking)}</p>
          </div>
        </div>

        {/* Other Leave Types */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-800/50">
            <h5 className="font-medium text-sm mb-2 flex items-center gap-1">
              <Heart className="h-3 w-3" />
              Sick Leave
            </h5>
            <p className="text-lg font-semibold">{formatDays(data.sick_remaining)}</p>
          </div>
          
          <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/50">
            <h5 className="font-medium text-sm mb-2 flex items-center gap-1">
              <Coffee className="h-3 w-3" />
              Personal Days
            </h5>
            <p className="text-lg font-semibold">{formatDays(data.personal_remaining)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
