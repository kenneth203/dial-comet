import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

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
}

interface User {
  id: string;
  name: string;
  role?: string;
  status?: string;
}

interface Assignment {
  id: string;
  user_id: string;
  assignment_status: string;
  user?: User;
}

interface EditShiftDialogProps {
  shift: ShiftInstance;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShiftUpdated: () => void;
}

const ROLE_OPTIONS = [
  { value: 'Call Handler', label: 'Call Handler', color: '#3b82f6' },
  { value: 'Supervisor', label: 'Supervisor', color: '#10b981' },
];

export function EditShiftDialog({ shift, open, onOpenChange, onShiftUpdated }: EditShiftDialogProps) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('unassigned');
  const [formData, setFormData] = useState({
    shift_date: shift.shift_date,
    start_time: shift.start_time.slice(0, 5), // Remove seconds
    end_time: shift.end_time.slice(0, 5), // Remove seconds
    role_name: shift.role_name,
    headcount_needed: shift.headcount_needed,
    color_code: shift.color_code
  });

  // Load users and current assignments when dialog opens
  useEffect(() => {
    if (open) {
      loadUsersAndAssignments();
    }
  }, [open, shift.id]);

  const loadUsersAndAssignments = async () => {
    try {
      // Load available users
      const { data: usersData, error: usersError } = await supabase
        .rpc('get_assignable_comprehensive_users');
      
      if (usersError) throw usersError;
      setUsers(usersData || []);

      // Load current assignments for this shift
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('shift_assignments')
        .select(`
          id,
          user_id,
          status
        `)
        .eq('shift_instance_id', shift.id)
        .eq('status', 'assigned');

      if (assignmentsError) throw assignmentsError;
      setAssignments((assignmentsData || []).map(a => ({ id: a.id, user_id: a.user_id, assignment_status: a.status })));
      
      // Set the first assigned user as selected (for single assignment)
      if (assignmentsData && assignmentsData.length > 0) {
        setSelectedUserId(assignmentsData[0].user_id);
      } else {
        setSelectedUserId('unassigned');
      }
    } catch (error: any) {
      console.error('Error loading users and assignments:', error);
      toast.error('Failed to load assignment data');
    }
  };

  const handleRoleChange = (roleName: string) => {
    const selectedRole = ROLE_OPTIONS.find(role => role.value === roleName);
    setFormData(prev => ({
      ...prev,
      role_name: roleName,
      color_code: selectedRole?.color || '#3b82f6'
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate times
      if (formData.start_time >= formData.end_time) {
        toast.error('Start time must be before end time');
        return;
      }

      // Validate date is not in the past
      const shiftDate = new Date(formData.shift_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (shiftDate < today) {
        toast.error('Cannot schedule shifts in the past');
        return;
      }

      // Check if assignment changed
      const currentAssignedUserId = assignments.length > 0 ? assignments[0].user_id : 'unassigned';
      const assignmentChanged = currentAssignedUserId !== selectedUserId;

      // Update the shift
      const { error } = await (supabase
        .from('shift_instances') as any)
        .update({
          shift_date: formData.shift_date,
          start_time: formData.start_time + ':00',
          end_time: formData.end_time + ':00',
          role_name: formData.role_name,
          headcount_needed: formData.headcount_needed,
          color_code: formData.color_code,
          headcount_assigned: selectedUserId !== 'unassigned' ? 1 : 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', shift.id);

      if (error) throw error;

      // Handle assignment changes
      if (assignmentChanged) {
        // Always remove existing assignments first to prevent duplicates
        const { error: deleteError } = await supabase
          .from('shift_assignments')
          .delete()
          .eq('shift_instance_id', shift.id)
          .eq('status', 'assigned');
        
        if (deleteError) throw deleteError;

        // Add new assignment if user selected
        if (selectedUserId !== 'unassigned') {
          // Double-check no duplicate exists before inserting
          const { data: existingCheck } = await supabase
            .from('shift_assignments')
            .select('id')
            .eq('shift_instance_id', shift.id)
            .eq('user_id', selectedUserId)
            .eq('status', 'assigned');

          if (existingCheck && existingCheck.length === 0) {
            const { error: assignError } = await supabase
              .from('shift_assignments')
              .insert({
                shift_instance_id: shift.id,
                user_id: selectedUserId,
                assigned_by: (await supabase.auth.getUser()).data.user?.id || '',
                status: 'assigned'
              } as any);

            if (assignError) throw assignError;
          }
        }
        
        // Update shift status and headcount based on actual assignments
        const { data: finalAssignments } = await supabase
          .from('shift_assignments')
          .select('id')
          .eq('shift_instance_id', shift.id)
          .eq('status', 'assigned');
        
        const finalAssignedCount = finalAssignments?.length || 0;
        const newStatus = finalAssignedCount >= formData.headcount_needed ? 'assigned' : 
                         finalAssignedCount === 0 ? 'open' : 'at_risk';
        
        await (supabase
          .from('shift_instances') as any)
          .update({ 
            headcount_assigned: finalAssignedCount,
            status: newStatus
          })
          .eq('id', shift.id);
      }

      toast.success('Shift updated successfully');
      onOpenChange(false);
      onShiftUpdated();
    } catch (error: any) {
      console.error('Error updating shift:', error);
      toast.error('Failed to update shift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" aria-describedby="edit-shift-description">
        <DialogHeader>
          <DialogTitle>Edit Shift</DialogTitle>
          <div id="edit-shift-description" className="text-sm text-muted-foreground">
            Update shift details and assignment
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shift_date">Date</Label>
            <Input
              id="shift_date"
              type="date"
              value={formData.shift_date}
              onChange={(e) => setFormData(prev => ({ ...prev, shift_date: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">Start Time</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_time">End Time</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role_name">Role</Label>
            <Select value={formData.role_name} onValueChange={handleRoleChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: role.color }}
                      />
                      {role.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="headcount_needed">Staff Needed</Label>
            <Input
              id="headcount_needed"
              type="number"
              min="1"
              max="10"
              value={formData.headcount_needed}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                headcount_needed: parseInt(e.target.value) || 1 
              }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assigned_user">Assigned User</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user to assign (or leave unassigned)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">
                  <span className="text-muted-foreground">Unassigned</span>
                </SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    <div className="flex items-center gap-2">
                      <span>{user.name}</span>
                      {user.role && (
                        <span className="text-sm text-muted-foreground">({user.role})</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Shift'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}