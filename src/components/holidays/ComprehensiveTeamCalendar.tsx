import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, isWeekend, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, isToday, parseISO, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Users } from "lucide-react";
import { useHoliday } from "@/context/HolidayContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDisplayName } from "@/lib/nameUtils";

interface ComprehensiveTeamCalendarProps {
  includeAllStaff?: boolean;
  strictMatching?: boolean;
  mode?: 'team' | 'personal';
}

export function ComprehensiveTeamCalendar({ includeAllStaff = false, strictMatching = false, mode = 'team' }: ComprehensiveTeamCalendarProps) {
  const STAFF_COLUMN_WIDTH = 200;
  const DAY_COLUMN_WIDTH = 50;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [allStaff, setAllStaff] = useState<Array<{ auth_user_id: string | null; system_user_id: string | null; name: string }>>([]);
  const { calendarRequests } = useHoliday();
  const [mySystemUserId, setMySystemUserId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const todayColumnRef = useRef<HTMLDivElement>(null);
  const staffColumnRef = useRef<HTMLDivElement>(null);
  
  // UK Bank Holidays for 2025, 2026, and 2027
  const ukHolidays = [
    // 2025
    { date: '2025-08-25', name: 'Summer bank holiday' },
    { date: '2025-12-25', name: 'Christmas Day' },
    { date: '2025-12-26', name: 'Boxing Day' },
    // 2026
    { date: '2026-01-01', name: 'New Year\'s Day' },
    { date: '2026-04-03', name: 'Good Friday' },
    { date: '2026-04-06', name: 'Easter Monday' },
    { date: '2026-05-04', name: 'Early May bank holiday' },
    { date: '2026-05-25', name: 'Spring bank holiday' },
    { date: '2026-08-31', name: 'Summer bank holiday' },
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-28', name: 'Boxing Day (substitute day)' },
    // 2027
    { date: '2027-01-01', name: 'New Year\'s Day' },
    { date: '2027-03-26', name: 'Good Friday' },
    { date: '2027-03-29', name: 'Easter Monday' },
    { date: '2027-05-03', name: 'Early May bank holiday' },
    { date: '2027-05-31', name: 'Spring bank holiday' },
    { date: '2027-08-30', name: 'Summer bank holiday' },
    { date: '2027-12-27', name: 'Christmas Day (substitute day)' },
    { date: '2027-12-28', name: 'Boxing Day (substitute day)' },
  ];
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  
  // Get the calendar view with proper week alignment (Monday as first day)
  const calendarStart = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Fetch staff members using appropriate RPC function
  useEffect(() => {
    const fetchStaff = async () => {
      if (mode === 'personal') {
        // For personal mode, get current user's system_user_id and only show their row
        const { data: mySystemUserData, error: systemUserError } = await supabase.rpc('get_my_system_user_id');
        
        setMySystemUserId(mySystemUserData || null);
        
        // Get user's name from system_users (preferred) or profiles as fallback
        let userName = 'Me';
        let authUserId = null;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          authUserId = user.id;
          
          // Try system_users first for proper capitalised name
          if (mySystemUserData) {
            const { data: allStaffData } = await supabase.rpc('get_all_system_users_minimal');
            const myStaffEntry = allStaffData?.find((s: any) => (s.id ?? s.system_user_id) === mySystemUserData);
            if (myStaffEntry?.name) {
              userName = myStaffEntry.name;
            }
          }
          
          // Fallback to profiles if system_users didn't provide a name
          if (userName === 'Me') {
            const { data: profilesData } = await supabase
              .from('profiles')
              .select('name')
              .eq('user_id', user.id)
              .single();
            
            if (profilesData?.name) {
              userName = formatDisplayName(profilesData.name);
            } else {
              userName = user.email || 'Me';
            }
          }
        }
        
        // Always set staff to show current user's row
        setAllStaff([{
          auth_user_id: authUserId,
          system_user_id: mySystemUserData || null,
          name: userName
        }]);
      } else {
        // Use different RPC based on includeAllStaff prop for team mode
        const rpcFunction = includeAllStaff ? 'get_all_system_users_minimal' : 'get_active_staff_minimal';
        const { data, error } = await supabase.rpc(rpcFunction);
      
        if (!error && data) {
          const mappedData = data.map((staff: any) => ({
            auth_user_id: staff.user_id ?? staff.auth_user_id ?? null,
            system_user_id: staff.id ?? staff.system_user_id ?? null,
            name: formatDisplayName(staff.name)
          }));
          
          // For admin view, also include any users who have holiday requests but aren't in the main list
          if (includeAllStaff && calendarRequests.length > 0) {
          const existingUserIds = new Set(mappedData.map(u => u.auth_user_id).filter(Boolean));
          const existingSystemUserIds = new Set(mappedData.map(u => u.system_user_id).filter(Boolean));
          
          // Find unique users from holiday requests
          const requestUsers = calendarRequests.reduce((acc, request) => {
            const key = request.user_id || request.system_user_id || 'unknown';
            if (!acc.has(key)) {
              // Only add if not already in main list (ignore nulls in comparison)
              const isAlreadyIncluded = (request.user_id && existingUserIds.has(request.user_id)) || 
                                      (request.system_user_id && existingSystemUserIds.has(request.system_user_id));
              if (!isAlreadyIncluded) {
                acc.set(key, {
                  auth_user_id: request.user_id,
                  system_user_id: request.system_user_id,
                  name: `User ${key.substring(0, 8)}...` // Fallback name
                });
              }
            }
            return acc;
          }, new Map());
          
            mappedData.push(...Array.from(requestUsers.values()));
          }
          
          // Sort alphabetically by name for consistent display
          setAllStaff(mappedData.sort((a, b) => a.name.localeCompare(b.name)));
        }
      }
    };
    
    fetchStaff();
  }, [includeAllStaff, calendarRequests, mode]);

  // Auto-scroll so today's date is the first visible date after the sticky staff column
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const todayIndex = calendarDays.findIndex((day) => isToday(day));
    if (todayIndex === -1) return;

    const targetScrollLeft = Math.max(0, todayIndex * DAY_COLUMN_WIDTH);

    let frameA = 0;
    let frameB = 0;

    const applyScroll = () => {
      if (!scrollContainerRef.current) return;

      scrollContainerRef.current.scrollLeft = targetScrollLeft;

      frameB = requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return;
        scrollContainerRef.current.scrollLeft = targetScrollLeft;
      });
    };

    frameA = requestAnimationFrame(applyScroll);

    return () => {
      cancelAnimationFrame(frameA);
      cancelAnimationFrame(frameB);
    };
  }, [calendarDays, currentDate, allStaff.length, DAY_COLUMN_WIDTH]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const getApprovedRequestsForDay = (date: Date) => {
    return calendarRequests.filter(request => {
      if (request.status !== 'approved') return false;
      const requestStart = startOfDay(parseISO(request.start_date));
      const requestEnd = startOfDay(parseISO(request.end_date));
      const checkDate = startOfDay(date);
      return checkDate >= requestStart && checkDate <= requestEnd;
    });
  };

  const getUserHolidayForDay = (staff: { auth_user_id: string | null; system_user_id: string | null; name: string }, date: Date) => {
    return calendarRequests.find(request => {
      // Check if the date falls within the request period first
      // Normalize all dates to local day boundaries to avoid UTC vs local time issues
      const requestStart = startOfDay(parseISO(request.start_date));
      const requestEnd = startOfDay(parseISO(request.end_date));
      const checkDate = startOfDay(date);
      
      // End date is inclusive - a 2-day request from Mar 25 to Mar 26 covers both days
      if (checkDate < requestStart || checkDate > requestEnd) {
        return false;
      }

      // Show both approved and pending requests
      if (request.status !== 'approved' && request.status !== 'pending') return false;

      // For personal mode, use strict but safe matching
      const useStrictMatching = strictMatching || mode === 'personal';
      
      if (useStrictMatching) {
        // STRICT MATCHING: Prefer system_user_id but allow safe fallback in personal mode
        if (request.system_user_id && staff.system_user_id) {
          return request.system_user_id === staff.system_user_id;
        }
        
        // In personal mode only: safe fallback to user_id matching (still only shows own data)
        if (mode === 'personal' && request.user_id && staff.auth_user_id) {
          return request.user_id === staff.auth_user_id;
        }
        
        // For strict matching outside personal mode, require system_user_id match
        return false;
      } else {
        // FLEXIBLE MATCHING: Try multiple strategies for backwards compatibility
        let isMatch = false;
        
        // Strategy 1: Match by system_user_id if both exist
        if (request.system_user_id && staff.system_user_id) {
          isMatch = request.system_user_id === staff.system_user_id;
        }
        
        // Strategy 2: If no system match yet, try auth_user_id
        if (!isMatch && request.user_id && staff.auth_user_id) {
          isMatch = request.user_id === staff.auth_user_id;
        }

        return isMatch;
      }
    });
  };

  const getUKHolidayForDay = (date: Date) => {
    return ukHolidays.find(holiday => {
      const holidayDate = new Date(holiday.date);
      return isSameDay(date, holidayDate);
    });
  };

  const getDayTypeClass = (date: Date) => {
    const isCurrentMonth = date >= monthStart && date <= monthEnd;
    const ukHoliday = getUKHolidayForDay(date);
    const isWeekendDay = isWeekend(date);
    const todayClass = isToday(date) ? 'ring-2 ring-primary' : '';
    
    let baseClass = `border ${todayClass}`;
    
    if (!isCurrentMonth) {
      baseClass += ' opacity-40 text-muted-foreground';
    }
    
    if (ukHoliday) {
      baseClass += ' bg-red-50 border-red-200';
    } else if (isWeekendDay) {
      baseClass += ' bg-gray-50 border-gray-200';
    } else {
      baseClass += ' bg-white border-gray-200';
    }
    
    return baseClass;
  };

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              {mode === 'personal' ? `My Calendar - ${format(currentDate, 'MMMM yyyy')}` : `Team Schedule Grid - ${format(currentDate, 'MMMM yyyy')}`}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentDate(new Date())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>

        {/* Grid Container */}
        <div ref={scrollContainerRef} className="overflow-x-auto min-w-full rounded-lg border border-border">
          <div className="min-w-max">
            {/* Header Row with Staff and Dates */}
            <div className="grid bg-muted/50" style={{ gridTemplateColumns: `${STAFF_COLUMN_WIDTH}px repeat(${calendarDays.length}, minmax(${DAY_COLUMN_WIDTH}px, ${DAY_COLUMN_WIDTH}px))` }}>
                 <div
                 ref={staffColumnRef}
                 className="sticky left-0 z-30 border-r border-border bg-muted/50 p-3 text-sm font-semibold shadow-[1px_0_0_hsl(var(--border))]"
               >
                Staff Member
              </div>
              {calendarDays.map((day, index) => {
                const ukHoliday = getUKHolidayForDay(day);
                const isWeekendDay = isWeekend(day);
                const isCurrentMonth = day >= monthStart && day <= monthEnd;
                
                let headerClass = 'p-2 text-center text-xs font-medium min-w-[40px]';
                if (index < calendarDays.length - 1) headerClass += ' border-r border-border';
                
                if (!isCurrentMonth) {
                  headerClass += ' opacity-50 text-muted-foreground';
                } else if (isToday(day)) {
                  headerClass += ' bg-primary/20 font-bold';
                } else if (ukHoliday) {
                  headerClass += ' bg-red-100';
                } else if (isWeekendDay) {
                  headerClass += ' bg-gray-100';
                }
                
                return (
                  <div key={day.toISOString()} className={headerClass} ref={isToday(day) ? todayColumnRef : undefined}>
                    <div className={`${isToday(day) ? 'font-bold text-primary' : ''}`}>
                      {format(day, 'd')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(day, 'EEE')}
                    </div>
                    {ukHoliday && isCurrentMonth && (
                      <div className="text-red-600 text-xs mt-1">
                        BH
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Staff Rows */}
            {allStaff.length > 0 ? (
               allStaff.map((staff, staffIndex) => (
                 <div key={staff.system_user_id ?? staff.auth_user_id ?? `staff-${staffIndex}`} className={`grid ${staffIndex < allStaff.length - 1 ? 'border-b border-border' : ''}`} 
                      style={{ gridTemplateColumns: `${STAFF_COLUMN_WIDTH}px repeat(${calendarDays.length}, minmax(${DAY_COLUMN_WIDTH}px, ${DAY_COLUMN_WIDTH}px))` }}>
                  {/* Staff Name - Sticky */}
                  <div className="sticky left-0 z-20 flex items-center border-r border-border bg-background p-3 text-sm font-medium shadow-[1px_0_0_hsl(var(--border))]">
                    <div className="truncate" title={staff.name}>
                      {staff.name}
                    </div>
                  </div>
                  
                   {/* Calendar Days */}
                   {calendarDays.map((day, dayIndex) => {
                     const userHoliday = getUserHolidayForDay(staff, day);
                    const ukHoliday = getUKHolidayForDay(day);
                    const isWeekendDay = isWeekend(day);
                    const isCurrentMonth = day >= monthStart && day <= monthEnd;
                    
                    let cellClass = `min-h-[50px] flex items-center justify-center relative min-w-[40px]`;
                    if (dayIndex < calendarDays.length - 1) cellClass += ' border-r border-border';
                    
                    // Dim days outside current month
                    if (!isCurrentMonth) {
                      cellClass += ' opacity-30';
                    }
                    
                    if (userHoliday && isCurrentMonth) {
                      // Use different colors based on absence type and status
                      const isPending = userHoliday.status === 'pending';
                      const absenceTypeColors = {
                        // Approved (solid colors) vs Pending (lighter with dashed border)
                        annual_leave: isPending ? 'bg-pink-100 border-pink-200 border-dashed' : 'bg-pink-200 border-pink-300',
                        sick_leave: isPending ? 'bg-yellow-100 border-yellow-200 border-dashed' : 'bg-yellow-200 border-yellow-300',
                        maternity_leave: isPending ? 'bg-purple-100 border-purple-200 border-dashed' : 'bg-purple-200 border-purple-300',
                        paternity_leave: isPending ? 'bg-blue-100 border-blue-200 border-dashed' : 'bg-blue-200 border-blue-300',
                        compassionate_leave: isPending ? 'bg-gray-100 border-gray-200 border-dashed' : 'bg-gray-200 border-gray-300',
                        study_leave: isPending ? 'bg-green-100 border-green-200 border-dashed' : 'bg-green-200 border-green-300',
                        unpaid_leave: isPending ? 'bg-orange-100 border-orange-200 border-dashed' : 'bg-orange-200 border-orange-300',
                        public_holiday: isPending ? 'bg-red-100 border-red-200 border-dashed' : 'bg-red-200 border-red-300'
                      };
                      cellClass += ` ${absenceTypeColors[userHoliday.absence_type as keyof typeof absenceTypeColors] || absenceTypeColors.annual_leave}`;
                    } else if (ukHoliday && isCurrentMonth) {
                      cellClass += ' bg-red-100';
                    } else if (isWeekendDay) {
                      cellClass += ' bg-gray-50';
                    } else {
                      cellClass += ' bg-background hover:bg-muted/20';
                    }
                    
                    if (isToday(day)) {
                      cellClass += ' ring-2 ring-primary ring-inset';
                    }
                    
                    return (
                       <div 
                         key={`${staff.system_user_id ?? staff.auth_user_id ?? `staff-${staffIndex}`}-${dayIndex}`}
                         className={cellClass}
                        title={
                          userHoliday 
                            ? `${staff.name} - ${userHoliday.absence_type.replace('_', ' ')} (${userHoliday.status})`
                            : ukHoliday 
                              ? ukHoliday.name
                              : isWeekendDay 
                                ? 'Weekend' 
                                : 'Available'
                        }
                      >
                        {userHoliday && isCurrentMonth && (
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            userHoliday.status === 'pending' ? 'opacity-70' : ''
                          }`}>
                            {userHoliday.absence_type.charAt(0).toUpperCase()}
                            {userHoliday.status === 'pending' && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-400 rounded-full text-[8px] flex items-center justify-center text-white">
                                ?
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground col-span-full">
                <p>Loading staff members...</p>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        {allStaff.length > 0 && (
          <div className="border-t pt-4 mt-4 space-y-4">
            <div>
              <div className="text-sm font-medium mb-2">Request Status:</div>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="outline" className="bg-green-100 border-green-300 text-green-800">
                  Solid = Approved
                </Badge>
                <Badge variant="outline" className="bg-orange-100 border-orange-300 border-dashed text-orange-800">
                  Dashed = Pending (?)
                </Badge>
              </div>
            </div>
            
            <div>
              <div className="text-sm font-medium mb-2">Leave Types:</div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-pink-200 border-pink-300 text-pink-800">
                  Annual Leave (A)
                </Badge>
                <Badge variant="outline" className="bg-yellow-200 border-yellow-300 text-yellow-800">
                  Sick Leave (S)
                </Badge>
                <Badge variant="outline" className="bg-purple-200 border-purple-300 text-purple-800">
                  Maternity Leave (M)
                </Badge>
                <Badge variant="outline" className="bg-blue-200 border-blue-300 text-blue-800">
                  Paternity Leave (P)
                </Badge>
                <Badge variant="outline" className="bg-gray-200 border-gray-300 text-gray-800">
                  Compassionate Leave (C)
                </Badge>
                <Badge variant="outline" className="bg-green-200 border-green-300 text-green-800">
                  Study Leave (S)
                </Badge>
                <Badge variant="outline" className="bg-orange-200 border-orange-300 text-orange-800">
                  Unpaid Leave (U)
                </Badge>
                <Badge variant="outline" className="bg-red-200 border-red-300 text-red-800">
                  Bank Holiday/Closures (P)
                </Badge>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}