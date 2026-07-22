import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, Users, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserManagement } from "@/context/UserManagementContext";
import { useAuth } from "@/context/AuthContext";

interface OpenShift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  role_name: string;
  color_code: string;
  headcount_needed: number;
  headcount_assigned: number;
  status: 'open' | 'at_risk';
}

interface AssignableUser {
  id: string;
  name: string;
  role: string;
  status: string;
}

export function OpenShiftsPanel() {
  const [openShifts, setOpenShifts] = useState<OpenShift[]>([]);
  const [selectedShiftUsers, setSelectedShiftUsers] = useState<{ [shiftId: string]: AssignableUser[] }>({});
  const [loading, setLoading] = useState(true);
  const { assignableUsers } = useUserManagement();
  const { user } = useAuth();

  const loadOpenShifts = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from('shift_instances') as any)
        .select('*')
        .in('status', ['open', 'at_risk'])
        .gte('shift_date', format(new Date(), 'yyyy-MM-dd'))
        .order('shift_date')
        .order('start_time');

      if (error) throw error;
      setOpenShifts((data || []) as OpenShift[]);
    } catch (error: any) {
      console.error('Error loading open shifts:', error);
      toast.error('Failed to load open shifts');
    } finally {
      setLoading(false);
    }
  };

  const showAvailableUsers = (shiftId: string) => {
    // Show all active users as potential assignees
    setSelectedShiftUsers(prev => ({ 
      ...prev, 
      [shiftId]: assignableUsers 
    }));
  };

  const assignShift = async (shiftId: string, userId: string, userName: string) => {
    try {
      // First check if user is already assigned to this shift
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

      // Get current assignment count and update shift
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
      setSelectedShiftUsers(prev => ({ ...prev, [shiftId]: [] })); // Hide user list
      loadOpenShifts(); // Refresh the list
    } catch (error: any) {
      console.error('Error assigning shift:', error);
      toast.error('Failed to assign shift');
    }
  };

  useEffect(() => {
    loadOpenShifts();
  }, []);

  const getUrgencyColor = (shift: OpenShift) => {
    const shiftDate = new Date(shift.shift_date);
    const today = new Date();
    const daysUntil = Math.ceil((shiftDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
    
    if (daysUntil <= 1) return 'destructive';
    if (daysUntil <= 3) return 'secondary';
    return 'outline';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="text-muted-foreground">Loading open shifts...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (openShifts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            All Shifts Covered
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              Great job! All upcoming shifts have been assigned.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          Open Shifts ({openShifts.length})
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {openShifts.map((shift) => {
            const shiftUsers = selectedShiftUsers[shift.id] || [];
            
            return (
              <div key={shift.id} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={getUrgencyColor(shift)}>
                        {format(new Date(shift.shift_date), 'EEE, MMM d')}
                      </Badge>
                      <Badge variant="outline">
                        {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                      </Badge>
                      <span 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: shift.color_code }}
                      />
                    </div>
                    
                    <div>
                      <h3 className="font-medium">{shift.role_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Need {shift.headcount_needed - shift.headcount_assigned} more staff
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => showAvailableUsers(shift.id)}
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Assign Staff
                    </Button>
                    {shiftUsers.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedShiftUsers(prev => ({ ...prev, [shift.id]: [] }))}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
                
                {shiftUsers.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Available Staff</h4>
                    {shiftUsers.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        No available staff found. Users need to be added in User Management first.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                        {shiftUsers.map((assignableUser) => (
                          <div key={assignableUser.id} className="flex items-center justify-between p-2 rounded border hover:bg-accent/50">
                            <div>
                              <div className="font-medium">{assignableUser.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {assignableUser.role} • {assignableUser.status}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => assignShift(shift.id, assignableUser.id, assignableUser.name)}
                            >
                              Assign
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}