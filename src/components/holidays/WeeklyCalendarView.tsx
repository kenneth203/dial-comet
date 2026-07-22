import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameDay } from "date-fns";
import { useHoliday } from "@/context/HolidayContext";
import { supabase } from "@/integrations/supabase/client";

const absenceTypeColors = {
  annual_leave: "bg-pink-200 border-pink-300 text-pink-800",
  sick_leave: "bg-yellow-200 border-yellow-300 text-yellow-800",
  maternity_leave: "bg-purple-200 border-purple-300 text-purple-800",
  paternity_leave: "bg-blue-200 border-blue-300 text-blue-800",
  compassionate_leave: "bg-gray-200 border-gray-300 text-gray-800",
  study_leave: "bg-green-200 border-green-300 text-green-800",
  unpaid_leave: "bg-orange-200 border-orange-300 text-orange-800",
  public_holiday: "bg-red-200 border-red-300 text-red-800"
};

const absenceTypeLabels = {
  annual_leave: "Paid Time Off",
  sick_leave: "Sick Leave",
  maternity_leave: "Maternity Leave",
  paternity_leave: "Paternity Leave",
  compassionate_leave: "Compassionate Leave",
  study_leave: "Study Leave",
  unpaid_leave: "Unpaid Leave",
  public_holiday: "Bank Holiday/Closures"
};

interface StaffMember {
  auth_user_id: string | null;
  system_user_id: string;
  name: string;
}

export function WeeklyCalendarView() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const { holidayRequests } = useHoliday();

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 }); // Start on Sunday
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Fetch active staff using the new secure RPC function
  useEffect(() => {
    const fetchStaff = async () => {
      setIsLoadingStaff(true);
      try {
        const { data, error } = await supabase.rpc('get_active_staff_minimal');
        
        if (error) {
          console.error('Error fetching staff:', error);
          return;
        }

        if (data) {
          const staffData: StaffMember[] = data.map((staff: any) => ({
            auth_user_id: staff.id,
            system_user_id: staff.id,
            name: staff.name
          }));
          setAllStaff(staffData);
        }
      } catch (error) {
        console.error('Error fetching staff:', error);
      } finally {
        setIsLoadingStaff(false);
      }
    };
    
    fetchStaff();
  }, []);

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeek(prev => direction === 'prev' ? subWeeks(prev, 1) : addWeeks(prev, 1));
  };

  // Get approved and pending holiday requests for the current week (for admin view)
  const weeklyRequests = holidayRequests.filter(request => {
    if (request.status !== 'approved' && request.status !== 'pending') return false;
    
    const startDate = new Date(request.start_date);
    const endDate = new Date(request.end_date);
    
    // Check if the request overlaps with the current week
    return (startDate <= weekEnd && endDate >= weekStart);
  });

  // Get holiday requests for a specific staff member and day - fixed matching logic
  const getUserHolidayForDay = (staff: StaffMember, date: Date) => {
    const matchedRequest = weeklyRequests.find(request => {
      // PRIORITY 1: If request has system_user_id, match against staff system_user_id
      if (request.system_user_id && staff.system_user_id) {
        const systemMatch = request.system_user_id === staff.system_user_id;
        if (!systemMatch) return false;
      } 
      // PRIORITY 2: If no system_user_id in request, fall back to auth user matching
      else if (staff.auth_user_id && request.user_id) {
        const authMatch = request.user_id === staff.auth_user_id;
        if (!authMatch) return false;
      } 
      // No valid matching criteria
      else {
        return false;
      }
      
      const startDate = new Date(request.start_date);
      const endDate = new Date(request.end_date);
      return date >= startDate && date <= endDate;
    });
    
    return matchedRequest;
  };

  if (isLoadingStaff) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Team Schedule - Loading...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>Loading team schedule...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Team Schedule - Week of {format(weekStart, 'MMM d, yyyy')}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateWeek('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek(new Date())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateWeek('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[800px] border border-border rounded-lg overflow-hidden">
            {/* Header Row with Staff and Days */}
            <div className="grid grid-cols-8 bg-muted/50">
              <div className="p-3 font-semibold text-sm border-r border-border min-w-[150px]">
                Staff Member
              </div>
              {weekDays.map((day, index) => (
                <div key={index} className={`p-2 text-center ${index < 6 ? 'border-r border-border' : ''}`}>
                  <div className="text-xs font-medium text-muted-foreground">
                    {format(day, 'EEE').toUpperCase()}
                  </div>
                  <div className="text-lg font-bold">
                    {format(day, 'd')}
                  </div>
                </div>
              ))}
            </div>

            {/* Staff Rows */}
            {allStaff.length > 0 ? (
              allStaff.map((staff, staffIndex) => (
                <div key={staff.system_user_id} className={`grid grid-cols-8 ${staffIndex < allStaff.length - 1 ? 'border-b border-border' : ''}`}>
                  {/* Staff Name */}
                  <div className="p-3 bg-muted/20 border-r border-border font-medium text-sm flex items-center min-w-[150px]">
                    <div className="truncate" title={staff.name}>
                      {staff.name}
                    </div>
                  </div>
                  
                  {/* Week Days */}
                  {weekDays.map((day, dayIndex) => {
                    const userHoliday = getUserHolidayForDay(staff, day);
                    
                    let cellClass = `p-3 min-h-[50px] border-r border-border relative`;
                    if (dayIndex === 6) cellClass = cellClass.replace(' border-r border-border', '');
                    
                    if (userHoliday) {
                      const baseColor = absenceTypeColors[userHoliday.absence_type] || absenceTypeColors.annual_leave;
                      if (userHoliday.status === 'pending') {
                        // Pending requests get dashed border and reduced opacity
                        cellClass += ` ${baseColor} opacity-60 border-dashed border-2`;
                      } else {
                        // Approved requests get solid styling
                        cellClass += ` ${baseColor}`;
                      }
                    } else {
                      cellClass += ' bg-background hover:bg-muted/20';
                    }
                    
                    return (
                      <div 
                        key={`${staff.system_user_id}-${dayIndex}`}
                        className={cellClass}
                        title={
                          userHoliday 
                            ? `${staff.name} - ${absenceTypeLabels[userHoliday.absence_type] || userHoliday.absence_type}`
                            : `${staff.name} - Available`
                        }
                      >
                        {userHoliday && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-xs font-medium text-center px-1">
                              {absenceTypeLabels[userHoliday.absence_type] || userHoliday.absence_type}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground col-span-8">
                <p>No active staff members found</p>
              </div>
            )}
          </div>
        </div>

        {/* Legend - Always visible */}
        <div className="border-t pt-4 mt-4 space-y-3">
          <div>
            <div className="text-sm font-medium mb-2">Request Status:</div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs bg-green-100 border-green-300 text-green-800">
                Solid = Approved
              </Badge>
              <Badge variant="outline" className="text-xs bg-orange-100 border-orange-300 text-orange-800 border-dashed border-2">
                Dashed = Pending
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Leave Types:</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(absenceTypeLabels).map(([type, label]) => (
                <Badge
                  key={type}
                  variant="outline"
                  className={`text-xs ${absenceTypeColors[type as keyof typeof absenceTypeColors]}`}
                >
                  {label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
