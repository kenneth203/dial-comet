import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, Users, UserPlus, Edit, Trash2, Coffee } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, eachDayOfInterval, isSameDay } from "date-fns";
import { QuickAddShiftDialog } from "./QuickAddShiftDialog";
import { EditShiftDialog } from "./EditShiftDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserManagement } from "@/context/UserManagementContext";
import { useAuth } from "@/context/AuthContext";
import { useHoliday } from "@/context/HolidayContext";
import { secureLog } from "@/lib/secureLogger";

interface ShiftInstance {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  role_name: string;
  color_code: string;
  status: 'assigned' | 'open' | 'at_risk' | 'cancelled';
  headcount_needed: number;
  headcount_assigned: number;
  assignments?: ShiftAssignment[];
}

interface ShiftAssignment {
  id: string;
  user_id: string;
  assignment_status: 'assigned' | 'open' | 'at_risk' | 'cancelled';
  user_name?: string;
}

export function ShiftCalendarView() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [shifts, setShifts] = useState<ShiftInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShift, setSelectedShift] = useState<ShiftInstance | null>(null);
  const [editingShift, setEditingShift] = useState<ShiftInstance | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState<ShiftInstance | null>(null);
  const [usersMap, setUsersMap] = useState<Map<string, string>>(new Map());
  const { assignableUsers } = useUserManagement();
  const { user } = useAuth();
  const { holidayRequests, isAdmin } = useHoliday();

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeek(prev => addWeeks(prev, direction === 'next' ? 1 : -1));
  };

  const loadUserNames = async () => {
    try {
      // Get all unique user IDs from holiday requests
      const userIds = new Set<string>();
      
      holidayRequests?.forEach(request => {
        if (request.user_id) userIds.add(request.user_id);
        if (request.system_user_id) userIds.add(request.system_user_id);
      });

      if (userIds.size === 0) return;

      const userIdArray = Array.from(userIds);
      
      // Fetch user names from profiles first
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', userIdArray);

      // Fetch from system_users for any missing names
      const { data: systemUsersData } = await supabase
        .from('system_users')
        .select('id, user_id, name')
        .or(`user_id.in.(${userIdArray.join(',')}),id.in.(${userIdArray.join(',')})`);

      // Create a map of user ID to name
      const newUsersMap = new Map<string, string>();
      
      profilesData?.forEach(profile => {
        if (profile.name && profile.user_id) {
          newUsersMap.set(profile.user_id, profile.name);
        }
      });

      systemUsersData?.forEach(systemUser => {
        if (systemUser.name) {
          // Map both the system user ID and auth user ID to the name
          if (systemUser.id) newUsersMap.set(systemUser.id, systemUser.name);
          if (systemUser.user_id) newUsersMap.set(systemUser.user_id, systemUser.name);
        }
      });

      setUsersMap(newUsersMap);
    } catch (error) {
      console.error('Error loading user names:', error);
    }
  };

  const loadShifts = async () => {
    setLoading(true);
    try {
      // First get shift instances
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shift_instances')
        .select('*')
        .gte('shift_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('shift_date', format(weekEnd, 'yyyy-MM-dd'))
        .order('shift_date')
        .order('start_time');

      if (shiftsError) throw shiftsError;

      // Then get assignments with user names for each shift
      let processedShifts = shiftsData || [];
      
      if (processedShifts.length > 0) {
        const shiftIds = processedShifts.map(s => s.id);
        
        const { data: assignmentsData, error: assignmentsError } = await supabase
          .from('shift_assignments')
          .select(`
            id,
            shift_instance_id,
            user_id,
            status
          `)
          .in('shift_instance_id', shiftIds)
          .eq('status', 'assigned');

        if (assignmentsError) throw assignmentsError;

        // Get user names for assignments
        if (assignmentsData && assignmentsData.length > 0) {
          const userIds = (assignmentsData as any[]).map(a => a.user_id);
          
          const { data: usersData, error: usersError } = await supabase
            .from('comprehensive_users')
            .select('id, auth_user_id, name')
            .or(`auth_user_id.in.(${userIds.join(',')}),id.in.(${userIds.join(',')})`);

          if (usersError) throw usersError;

          processedShifts = processedShifts.map(shift => ({
            ...shift,
            assignments: (assignmentsData as any[])
              .filter(a => a.shift_instance_id === shift.id)
              .map(assignment => ({
                ...assignment,
                assignment_status: assignment.status,
                user_name: usersData?.find(u => 
                  u.id === assignment.user_id
                )?.name
              }))
          }));
        } else {
          processedShifts = processedShifts.map(shift => ({
            ...shift,
            assignments: []
          }));
        }
      }

      if (shiftsError) throw shiftsError;

      setShifts(processedShifts as any);
    } catch (error: any) {
      console.error('Error loading shifts:', error);
      toast.error('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  const deleteShift = async (shift: ShiftInstance) => {
    try {
      // First delete all assignments for this shift
      const { error: assignmentsError } = await supabase
        .from('shift_assignments')
        .delete()
        .eq('shift_instance_id', shift.id);

      if (assignmentsError) throw assignmentsError;

      // Then delete the shift instance
      const { error: shiftError } = await supabase
        .from('shift_instances')
        .delete()
        .eq('id', shift.id);

      if (shiftError) throw shiftError;

      toast.success('Shift deleted successfully');
      setDeleteDialogOpen(false);
      setShiftToDelete(null);
      loadShifts(); // Refresh
    } catch (error: any) {
      console.error('Error deleting shift:', error);
      toast.error('Failed to delete shift');
    }
  };

  const assignUserToShift = async (shiftId: string, userId: string, userName: string) => {
    try {
      // Check if user is already assigned
      const { data: existingAssignment } = await supabase
        .from('shift_assignments')
        .select('id')
        .eq('shift_instance_id', shiftId)
        .eq('user_id', userId)
        .eq('status', 'assigned')
        .single();

      if (existingAssignment) {
        toast.error(`${userName} is already assigned to this shift`);
        return;
      }

      const { error } = await supabase
        .from('shift_assignments')
        .insert({
          shift_instance_id: shiftId,
          user_id: userId,
          assigned_by: user?.id || '',
          status: 'assigned'
        } as any);

      if (error) throw error;

      // Update shift assignment count
      const { data: assignmentCount } = await supabase
        .from('shift_assignments')
        .select('id')
        .eq('shift_instance_id', shiftId)
        .eq('status', 'assigned');

      const newAssignedCount = (assignmentCount?.length || 0);

      // Get the shift to check headcount needed
      const { data: shiftData } = await supabase
        .from('shift_instances')
        .select('headcount_needed')
        .eq('id', shiftId)
        .single();

      const headcountNeeded = shiftData?.headcount_needed || 1;
      const newStatus = newAssignedCount >= headcountNeeded ? 'assigned' : 'at_risk';

      await (supabase
        .from('shift_instances') as any)
        .update({ 
          status: newStatus,
          headcount_assigned: newAssignedCount
        })
        .eq('id', shiftId);

      toast.success(`Assigned ${userName} to shift`);
      setSelectedShift(null);
      loadShifts(); // Refresh
    } catch (error: any) {
      console.error('Error assigning user to shift:', error);
      toast.error('Failed to assign user to shift');
    }
  };

  useEffect(() => {
    loadShifts();
  }, [currentWeek]);

  useEffect(() => {
    if (holidayRequests && holidayRequests.length > 0) {
      loadUserNames();
    }
  }, [holidayRequests]);

  const getShiftsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.filter(shift => shift.shift_date === dateStr);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned': return 'bg-green-500';
      case 'open': return 'bg-red-500';
      case 'at_risk': return 'bg-yellow-500';
      case 'cancelled': return 'bg-gray-500';
      default: return 'bg-blue-500';
    }
  };

  const getAbsenceTypeColor = (absenceType: string) => {
    switch (absenceType) {
      case 'annual_leave': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'sick_leave': return 'bg-red-100 text-red-800 border-red-200';
      case 'personal_day': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'compassionate_leave': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'maternity_leave': return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'paternity_leave': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'unpaid_leave': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'study_leave': return 'bg-green-100 text-green-800 border-green-200';
      case 'public_holiday': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getAbsenceTypeLabel = (absenceType: string) => {
    switch (absenceType) {
      case 'annual_leave': return 'Holiday';
      case 'sick_leave': return 'Sick';
      case 'personal_day': return 'Personal';
      case 'compassionate_leave': return 'Compassionate';
      case 'maternity_leave': return 'Maternity';
      case 'paternity_leave': return 'Paternity';
      case 'unpaid_leave': return 'Unpaid';
      case 'study_leave': return 'Study';
      case 'public_holiday': return 'Public Holiday';
      default: return absenceType.replace('_', ' ');
    }
  };

  const getLeaveForDay = (date: Date) => {
    if (!holidayRequests) {
      return [];
    }
    
    const targetDateStr = format(date, 'yyyy-MM-dd');
    
    const dayLeave = holidayRequests.filter(request => {
      const startDateStr = request.start_date;
      const endDateStr = request.end_date;
      
      const isInPeriod = targetDateStr >= startDateStr && targetDateStr <= endDateStr;
      const isApprovedOrPending = request.status === 'approved' || request.status === 'pending';
      
      return isInPeriod && isApprovedOrPending;
    });
    
    return dayLeave;
  };

  const getUserNameForLeave = (request: any) => {
    // First try to get name from our loaded users map
    let userName = usersMap.get(request.user_id) || usersMap.get(request.system_user_id);
    
    if (userName) return userName;
    
    // Fallback: try to find user name from assignableUsers
    const user = assignableUsers.find(u => 
      u.id === request.user_id || 
      u.auth_user_id === request.user_id ||
      u.id === request.system_user_id
    );
    
    return user?.name || 'Team Member';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="text-muted-foreground">Loading shifts...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Weekly Schedule
          </CardTitle>
          
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateWeek('prev')}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-[120px] sm:min-w-[200px] text-center">
                {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateWeek('next')}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek(new Date())}
            >
              Today
            </Button>
            
            <QuickAddShiftDialog onShiftAdded={loadShifts} />
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="overflow-x-auto -mx-4 sm:mx-0"><div className="min-w-[640px] px-4 sm:px-0 grid grid-cols-7 gap-2 sm:gap-4">
          {weekDays.map((day, index) => {
            const dayShifts = getShiftsForDay(day);
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
            
            return (
              <div key={index} className="space-y-2">
                <div className={`text-center p-2 rounded-lg ${
                  isToday ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>
                  <div className="text-sm font-medium">
                    {format(day, 'EEE')}
                  </div>
                  <div className="text-lg font-bold">
                    {format(day, 'd')}
                  </div>
                </div>
                
                {/* Team Leave Bar */}
                {(() => {
                  const dayLeave = getLeaveForDay(day);
                  if (dayLeave.length === 0) return null;
                  
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
                      <div className="flex items-center gap-1 mb-1">
                        <Coffee className="w-3 h-3 text-amber-600" />
                        <span className="text-xs font-medium text-amber-800">Team off today</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {dayLeave.map((request, idx) => (
                          <Badge 
                            key={idx}
                            variant="outline" 
                            className={`text-xs px-1 py-0 ${getAbsenceTypeColor(request.absence_type)} ${
                              request.status === 'pending' ? 'border-dashed' : ''
                            }`}
                          >
                            {getUserNameForLeave(request)} - {getAbsenceTypeLabel(request.absence_type)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                
                <div className="space-y-1 min-h-[300px]">
                  {dayShifts.map((shift) => (
                    <Dialog key={shift.id}>
                      <DialogTrigger asChild>
                        <div
                          className="p-2 rounded border border-border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                          style={{ borderLeftColor: shift.color_code, borderLeftWidth: '4px' }}
                          onClick={() => setSelectedShift(shift)}
                        >
                          <div className="text-xs font-medium truncate">
                            {shift.role_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                          </div>
                          
                          <div className="flex items-center justify-between mt-1">
                            <Badge 
                              variant={shift.status === 'assigned' ? 'default' : 'destructive'}
                            >
                              {shift.headcount_assigned}/{shift.headcount_needed}
                            </Badge>
                            <div className={`w-2 h-2 rounded-full ${getStatusColor(shift.status)}`} />
                          </div>
                          
                          {shift.assignments && shift.assignments.length > 0 && (
                            <div className="mt-1 text-xs text-muted-foreground truncate">
                              {shift.assignments.map(a => a.user_name).join(', ')}
                            </div>
                          )}
                        </div>
                      </DialogTrigger>
                      
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle className="flex items-center justify-between">
                            <span>Manage Shift</span>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingShift(shift);
                                  setSelectedShift(null);
                                }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setShiftToDelete(shift);
                                  setDeleteDialogOpen(true);
                                  setSelectedShift(null);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </DialogTitle>
                        </DialogHeader>
                        
                        <div className="space-y-4">
                          <div className="p-3 rounded-lg bg-muted">
                            <div className="font-medium">{shift.role_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {format(new Date(shift.shift_date), 'EEE, MMM d')} • {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {shift.headcount_assigned}/{shift.headcount_needed} assigned
                            </div>
                          </div>
                          
                           <div className="space-y-2 max-h-60 overflow-y-auto">
                            <h4 className="font-medium">Available Staff</h4>
                            {assignableUsers.length === 0 ? (
                              <div className="text-center py-4 text-muted-foreground">
                                No available staff found. Users need to be added in User Management first.
                              </div>
                            ) : (
                              assignableUsers.map((user) => (
                                <div key={user.id} className="flex items-center justify-between p-2 rounded border hover:bg-accent/50">
                                  <div>
                                    <div className="font-medium">{user.name}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {user.role}
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => assignUserToShift(shift.id, user.id, user.name)}
                                  >
                                    <UserPlus className="w-4 h-4 mr-1" />
                                    Assign
                                  </Button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ))}
                </div>
              </div>
            );
          })}
        </div></div>
        
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <div className="font-medium">Shift Status:</div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span>Assigned</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span>Open</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span>At Risk</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-500"></div>
              <span>Cancelled</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            <div className="font-medium">Leave Status:</div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-2 bg-blue-100 border border-blue-200 rounded"></div>
              <span>Approved Leave</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-2 bg-blue-100 border border-blue-200 border-dashed rounded"></div>
              <span>Pending Leave</span>
            </div>
          </div>
        </div>

        {/* Edit Shift Dialog */}
        {editingShift && (
          <EditShiftDialog
            shift={editingShift}
            open={!!editingShift}
            onOpenChange={() => setEditingShift(null)}
            onShiftUpdated={loadShifts}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Shift</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this shift? This action cannot be undone and will remove all staff assignments for this shift.
                {shiftToDelete && (
                  <div className="mt-2 p-3 rounded-lg bg-muted">
                    <div className="font-medium">{shiftToDelete.role_name}</div>
                    <div className="text-sm">
                      {format(new Date(shiftToDelete.shift_date), 'EEE, MMM d')} • {shiftToDelete.start_time.slice(0, 5)} - {shiftToDelete.end_time.slice(0, 5)}
                    </div>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => shiftToDelete && deleteShift(shiftToDelete)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Shift
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}