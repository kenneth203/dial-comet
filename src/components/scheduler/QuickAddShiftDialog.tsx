import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

interface QuickAddShiftDialogProps {
  onShiftAdded: () => void;
}

export function QuickAddShiftDialog({ onShiftAdded }: QuickAddShiftDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    shift_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '17:00',
    role_name: 'General',
    headcount_needed: 1,
    color_code: '#3b82f6'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await (supabase
        .from('shift_instances') as any)
        .insert({
          template_id: null,
          shift_date: formData.shift_date,
          start_time: formData.start_time,
          end_time: formData.end_time,
          headcount_needed: formData.headcount_needed,
          role_name: formData.role_name,
          color_code: formData.color_code,
          status: 'open'
        });

      if (error) throw error;

      toast.success('Shift created successfully');
      setOpen(false);
      onShiftAdded();
      
      // Reset form
      setFormData({
        shift_date: new Date().toISOString().split('T')[0],
        start_time: '09:00',
        end_time: '17:00',
        role_name: 'General',
        headcount_needed: 1,
        color_code: '#3b82f6'
      });
    } catch (error: any) {
      console.error('Error creating shift:', error);
      toast.error('Failed to create shift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Quick Add
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Add Shift</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="shift_date">Date</Label>
            <Input
              id="shift_date"
              type="date"
              value={formData.shift_date}
              onChange={(e) => setFormData({ ...formData, shift_date: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="start_time">Start Time</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="end_time">End Time</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role_name">Role</Label>
            <Select
              value={formData.role_name}
              onValueChange={(value) => setFormData({ ...formData, role_name: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Early">Early</SelectItem>
                <SelectItem value="Supervisor">Supervisor</SelectItem>
                <SelectItem value="Late">Late</SelectItem>
                <SelectItem value="General">General</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="headcount_needed">Staff Needed</Label>
            <Input
              id="headcount_needed"
              type="number"
              min="1"
              value={formData.headcount_needed}
              onChange={(e) => setFormData({ ...formData, headcount_needed: parseInt(e.target.value) })}
              required
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Shift'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}