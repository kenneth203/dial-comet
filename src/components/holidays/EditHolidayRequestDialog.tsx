import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, differenceInBusinessDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useHoliday, AbsenceType, HolidayRequest } from "@/context/HolidayContext";
import { toast } from "@/hooks/use-toast";

const absenceTypeLabels: Record<AbsenceType, string> = {
  annual_leave: "Annual Leave",
  sick_leave: "Sick Leave",
  maternity_leave: "Maternity Leave",
  paternity_leave: "Paternity Leave",
  compassionate_leave: "Compassionate Leave",
  study_leave: "Study Leave",
  unpaid_leave: "Unpaid Leave",
  public_holiday: "Bank Holiday/Closures"
};

interface EditHolidayRequestDialogProps {
  request: HolidayRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditHolidayRequestDialog({ request, open, onOpenChange }: EditHolidayRequestDialogProps) {
  const { updateHolidayRequest, remainingLeave, holidayRequests } = useHoliday();
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    absence_type: request.absence_type,
    start_date: new Date(request.start_date),
    end_date: new Date(request.end_date),
    reason: request.reason || ''
  });

  useEffect(() => {
    if (open) {
      setFormData({
        absence_type: request.absence_type,
        start_date: new Date(request.start_date),
        end_date: new Date(request.end_date),
        reason: request.reason || ''
      });
    }
  }, [request, open]);

  const calculateWorkingDays = () => {
    if (!formData.start_date || !formData.end_date) return 0;
    return differenceInBusinessDays(formData.end_date, formData.start_date) + 1;
  };

  // Check for overlapping holidays (excluding current request)
  const checkForOverlappingHolidays = () => {
    if (!formData.start_date || !formData.end_date) return false;
    
    return holidayRequests.some(req => {
      // Skip the current request being edited
      if (req.id === request.id) return false;
      if (req.status !== 'approved') return false;
      
      const reqStart = new Date(req.start_date);
      const reqEnd = new Date(req.end_date);
      
      // Check for any overlap between date ranges
      return (reqStart <= formData.end_date && reqEnd >= formData.start_date);
    });
  };

  // Check if request meets 14-day advance requirement
  const checkAdvanceNoticeRequirement = () => {
    if (!formData.start_date) return { valid: true, daysInAdvance: 0 };
    
    const today = new Date();
    const startDate = formData.start_date;
    const daysInAdvance = Math.floor((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const workingDays = calculateWorkingDays();
    
    return {
      valid: workingDays <= 1 || daysInAdvance >= 14,
      daysInAdvance,
      isMultiDay: workingDays > 1
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.start_date || !formData.end_date) {
      toast({
        title: "Missing Dates",
        description: "Please select both start and end dates",
        variant: "destructive"
      });
      return;
    }

    if (formData.start_date > formData.end_date) {
      toast({
        title: "Invalid Date Range",
        description: "End date must be after start date",
        variant: "destructive"
      });
      return;
    }

    const workingDays = calculateWorkingDays();
    
    // Rule 1: Check for overlapping approved holidays
    if (checkForOverlappingHolidays()) {
      toast({
        title: "Holiday Conflict",
        description: "Another user already has approved holiday during this period. Only one person can be on holiday at a time.",
        variant: "destructive"
      });
      return;
    }
    
    // Rule 2: Check 14-day advance notice requirement for multi-day holidays
    const advanceNotice = checkAdvanceNoticeRequirement();
    if (!advanceNotice.valid) {
      toast({
        title: "Insufficient Advance Notice",
        description: `Holidays longer than one day must be requested at least 14 days in advance. You are requesting ${advanceNotice.daysInAdvance} days in advance.`,
        variant: "destructive"
      });
      return;
    }
    
    // Check if user has enough leave days for annual leave
    if (formData.absence_type === 'annual_leave' && remainingLeave) {
      // Calculate the difference in days from original request
      const originalDays = request.total_days;
      const daysDifference = workingDays - originalDays;
      
      if (daysDifference > 0 && daysDifference > remainingLeave.annual_leave_remaining) {
        toast({
          title: "Insufficient Leave Days",
          description: `You only have ${remainingLeave.annual_leave_remaining} additional annual leave days available`,
          variant: "destructive"
        });
        return;
      }
    }

    setIsLoading(true);
    
    try {
      await updateHolidayRequest(request.id, {
        absence_type: formData.absence_type,
        start_date: format(formData.start_date, 'yyyy-MM-dd'),
        end_date: format(formData.end_date, 'yyyy-MM-dd'),
        total_days: workingDays,
        reason: formData.reason || undefined,
        status: 'pending', // Reset to pending for reapproval
        approved_by: undefined,
        approved_at: undefined,
        decline_reason: undefined
      });

      toast({
        title: "Request Updated",
        description: "Your holiday request has been updated and sent for reapproval"
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating request:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Holiday Request</DialogTitle>
            <DialogDescription>
              Update your holiday request details. Changes will require reapproval.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="absence_type">Type of Leave</Label>
              <Select 
                value={formData.absence_type} 
                onValueChange={(value: AbsenceType) => setFormData(prev => ({ ...prev, absence_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(absenceTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.start_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.start_date ? format(formData.start_date, "dd/MM/yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.start_date}
                      onSelect={(date) => {
                        setFormData(prev => ({ 
                          ...prev, 
                          start_date: date || prev.start_date,
                          end_date: date && !prev.end_date ? date : prev.end_date
                        }));
                      }}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.end_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.end_date ? format(formData.end_date, "dd/MM/yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.end_date}
                      onSelect={(date) => setFormData(prev => ({ ...prev, end_date: date || prev.end_date }))}
                      disabled={(date) => {
                        const minDate = formData.start_date || new Date();
                        return date < minDate;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {formData.start_date && formData.end_date && (
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                <strong>Working days:</strong> {calculateWorkingDays()}
                {formData.absence_type === 'annual_leave' && remainingLeave && (
                  <div className="mt-1">
                    <strong>Available annual leave:</strong> {remainingLeave.annual_leave_remaining + request.total_days} days
                    <div className="text-xs text-orange-600 mt-1">
                      (Including {request.total_days} days from this request)
                    </div>
                  </div>
                )}
                
                {/* Rule validation warnings */}
                {(() => {
                  const hasOverlap = checkForOverlappingHolidays();
                  const advanceNotice = checkAdvanceNoticeRequirement();
                  
                  if (hasOverlap || !advanceNotice.valid) {
                    return (
                      <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded">
                        <div className="text-destructive font-medium text-xs mb-1">⚠️ Validation Issues:</div>
                        {hasOverlap && (
                          <div className="text-destructive text-xs">
                            • Another user has approved holiday during this period
                          </div>
                        )}
                        {!advanceNotice.valid && (
                          <div className="text-destructive text-xs">
                            • Multi-day holidays require 14 days advance notice (currently {advanceNotice.daysInAdvance} days)
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Show helpful info for multi-day requests
                  if (advanceNotice.isMultiDay && advanceNotice.valid) {
                    return (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                        <div className="text-green-700 text-xs">
                          ✅ Request meets 14-day advance notice requirement ({advanceNotice.daysInAdvance} days)
                        </div>
                      </div>
                    );
                  }
                  
                  return null;
                })()}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                placeholder="Add any additional details..."
                value={formData.reason}
                onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !formData.start_date || !formData.end_date}>
              {isLoading ? "Updating..." : "Update & Resubmit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}