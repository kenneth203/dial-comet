import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, isToday, addDays, startOfWeek } from "date-fns";
import { useHoliday } from "@/context/HolidayContext";

export function TeamCalendarCard() {
  const { holidayRequests } = useHoliday();
  
  // Get this week's dates
  const today = new Date();
  const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfCurrentWeek, i));
  
  // Filter approved requests for this week
  const thisWeekRequests = holidayRequests.filter(request => {
    if (request.status !== 'approved') return false;
    
    const startDate = new Date(request.start_date);
    const endDate = new Date(request.end_date);
    
    // Check if any day this week overlaps with the request
    return weekDays.some(day => day >= startDate && day <= endDate);
  });

  const getRequestsForDay = (date: Date) => {
    return thisWeekRequests.filter(request => {
      const startDate = new Date(request.start_date);
      const endDate = new Date(request.end_date);
      return date >= startDate && date <= endDate;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>This Week's Schedule</CardTitle>
        <CardDescription>
          Team members on leave this week
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {weekDays.map((day) => {
            const dayRequests = getRequestsForDay(day);
            return (
              <div key={day.toISOString()} className="flex items-center justify-between p-2 rounded-lg border">
                <div className="flex items-center space-x-3">
                  <div className={`text-sm font-medium ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
                    {format(day, 'EEE')}
                  </div>
                  <div className={`text-sm ${isToday(day) ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                    {format(day, 'dd MMM')}
                  </div>
                  {isToday(day) && (
                    <Badge variant="outline" className="text-xs">Today</Badge>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-1">
                  {dayRequests.length === 0 ? (
                    <span className="text-xs text-muted-foreground">All available</span>
                  ) : (
                    dayRequests.map((request) => (
                      <Badge 
                        key={request.id} 
                        variant="secondary" 
                        className="text-xs"
                      >
                        {request.user_name}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {thisWeekRequests.length === 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No approved leave requests for this week
          </div>
        )}
      </CardContent>
    </Card>
  );
}