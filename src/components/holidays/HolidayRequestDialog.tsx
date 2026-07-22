import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, User } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format, differenceInBusinessDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useHoliday, AbsenceType } from "@/context/HolidayContext";
import { toast } from "@/hooks/use-toast";
import { sanitizeText } from "@/lib/sanitize";
import { supabase } from "@/integrations/supabase/client";
import { FormActions } from "@/components/common/FormActions";
import { RequiredMark } from "@/components/common/RequiredMark";

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

interface ActiveUser {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  role: string;
  system_user_id?: string;
}

export function HolidayRequestDialog() {
  const { addHolidayRequest, remainingLeave, isAdmin, holidayRequests } = useHoliday();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  const [formData, setFormData] = useState({
    absence_type: 'annual_leave' as AbsenceType,
    start_date: undefined as Date | undefined,
    end_date: undefined as Date | undefined,
    reason: '',
    selected_user_id: undefined as string | undefined,
    manager_override: false
  });

  // Load active users for admin selection
  useEffect(() => {
    if (isAdmin && open) {
      loadActiveUsers();
    }
  }, [isAdmin, open]);

  const loadActiveUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .rpc('get_active_users_for_admin');

      if (error) throw error;
      
      // Remove duplicates based on system_user_id to prevent key conflicts
      const uniqueUsers = (data || []).reduce((acc: ActiveUser[], user: any) => {
        const mapped: ActiveUser = { id: user.id, user_id: user.user_id, name: user.name, role: user.role, system_user_id: user.id };
        if (!acc.find(existing => existing.system_user_id === mapped.system_user_id)) {
          acc.push(mapped);
        }
        return acc;
      }, [] as ActiveUser[]);
      
      setActiveUsers(uniqueUsers);
    } catch (error) {
      console.error('Error loading active users:', error);
      toast({
        title: "Error",
        description: "Failed to load active users",
        variant: "destructive"
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  const calculateWorkingDays = () => {
    if (!formData.start_date || !formData.end_date) return 0;
    return differenceInBusinessDays(formData.end_date, formData.start_date) + 1;
  };

  // Check for overlapping holidays
  const checkForOverlappingHolidays = () => {
    if (!formData.start_date || !formData.end_date) return false;
    
    return holidayRequests.some(request => {
      if (request.status !== 'approved') return false;
      
      const requestStart = new Date(request.start_date);
      const requestEnd = new Date(request.end_date);
      
      // Check for any overlap between date ranges
      return (requestStart <= formData.end_date && requestEnd >= formData.start_date);
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
    
    // Prevent duplicate submissions
    if (isLoading) return;
    
    if (!formData.start_date || !formData.end_date) {
      toast({
        title: "Missing Dates",
        description: "Please select both start and end dates",
        variant: "destructive"
      });
      return;
    }

    // Enhanced validation with security checks
    const today = new Date();
    const startDate = formData.start_date;
    const endDate = formData.end_date;
    
    // For admins creating for another user, ensure a user is selected
    // Note: selected_user_id is undefined when "Create For Myself" is chosen, which is valid
    
    if (startDate > endDate) {
      toast({
        title: "Invalid Date Range",
        description: "End date must be after start date",
        variant: "destructive"
      });
      return;
    }
    
    // Prevent excessive future dating (more than 1 year)
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    if (startDate > oneYearFromNow) {
      toast({
        title: "Invalid Date Range",
        description: "Cannot request leave more than 1 year in advance",
        variant: "destructive"
      });
      return;
    }
    
    // Check backdating rules (except for sick leave)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (startDate < yesterday && formData.absence_type !== 'sick_leave') {
      toast({
        title: "Invalid Date Range", 
        description: "Cannot request leave for past dates (except sick leave)",
        variant: "destructive"
      });
      return;
    }

    const workingDays = calculateWorkingDays();
    
    // Rule 1: Check for overlapping approved holidays (can be overridden with manager approval)
    if (checkForOverlappingHolidays() && !formData.manager_override) {
      toast({
        title: "Holiday Conflict",
        description: "Another user already has approved holiday during this period. Tick 'Discussed with Manager' to override.",
        variant: "destructive"
      });
      return;
    }
    
    // Rule 2: Check 14-day advance notice requirement for multi-day holidays (can be overridden)
    const advanceNotice = checkAdvanceNoticeRequirement();
    if (!advanceNotice.valid && !formData.manager_override) {
      toast({
        title: "Insufficient Advance Notice",
        description: `Holidays longer than one day must be requested at least 14 days in advance. Tick 'Discussed with Manager' to override.`,
        variant: "destructive"
      });
      return;
    }
    
    // Enhanced leave balance validation
    if (formData.absence_type === 'annual_leave' && remainingLeave) {
      if (workingDays > remainingLeave.annual_leave_remaining) {
        toast({
          title: "Insufficient Leave Days",
          description: `Available: ${remainingLeave.annual_leave_remaining} days, Requested: ${workingDays} days`,
          variant: "destructive"
        });
        return;
      }
    }

    setIsLoading(true);
    
    try {
      // Sanitize the reason field before submission
      const sanitizedReason = formData.reason ? sanitizeText(formData.reason.trim()) : undefined;
      
      const fullReason = formData.manager_override 
        ? `[Manager Approved Override] ${sanitizedReason || ''}`.trim()
        : sanitizedReason;

      await addHolidayRequest({
        absence_type: formData.absence_type,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        total_days: workingDays,
        reason: fullReason
      }, formData.selected_user_id === "self" ? undefined : formData.selected_user_id);

      // Success - reset form and close dialog
      // (Success toast is already shown in the context)
      setFormData({
        absence_type: 'annual_leave',
        start_date: undefined,
        end_date: undefined,
        reason: '',
        selected_user_id: undefined,
        manager_override: false
      });
      
      setOpen(false);
    } catch (error) {
      console.error('Error submitting request:', error);
      // Error handling and toast are done in the context
      // Keep dialog open so user can retry
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Request Holiday
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Request Time Off</DialogTitle>
            <DialogDescription>
              Submit a new holiday request for approval
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {isAdmin && (
              <div className="space-y-1.5">
                <Label htmlFor="selected_user">Request For User</Label>
                <Select
                  value={formData.selected_user_id || "self"}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, selected_user_id: value === "self" ? undefined : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingUsers ? "Loading users..." : "Select user"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="self" className="cursor-pointer">
                      <div className="flex items-center gap-2 py-1">
                        <User className="h-4 w-4" />
                        <span className="font-medium">Create For Myself</span>
                      </div>
                    </SelectItem>
                    {activeUsers.map((user, index) => (
                      <SelectItem key={`user-${user.system_user_id}-${index}`} value={user.system_user_id} className="cursor-pointer">
                        <div className="flex items-center gap-2 py-1">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{user.name}</span>
                            <span className="text-xs text-muted-foreground">{user.email} • {user.role}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {loadingUsers && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-primary"></div>
                    Loading users...
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="absence_type">
                Type of Leave<RequiredMark />
              </Label>
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
              <div className="space-y-1.5">
                <Label>
                  Start Date<RequiredMark />
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
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
                          start_date: date,
                          end_date: date && !prev.end_date ? date : prev.end_date
                        }));
                      }}
                      disabled={(date) => {
                        const today = new Date();
                        const oneYearFromNow = new Date();
                        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
                        if (date > oneYearFromNow) return true;
                        if (formData.absence_type === 'sick_leave') {
                          const yesterday = new Date(today);
                          yesterday.setDate(yesterday.getDate() - 1);
                          return date < yesterday;
                        }
                        return date < today;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label>
                  End Date<RequiredMark />
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
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
                      onSelect={(date) => setFormData(prev => ({ ...prev, end_date: date }))}
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
                <strong className="text-foreground">Working days:</strong> {calculateWorkingDays()}
                {formData.absence_type === 'annual_leave' && remainingLeave && (
                  <div className="mt-1">
                    <strong className="text-foreground">Remaining annual leave:</strong> {remainingLeave.annual_leave_remaining} days
                  </div>
                )}

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

                  if (advanceNotice.isMultiDay && advanceNotice.valid) {
                    return (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded dark:bg-green-950/20 dark:border-green-800">
                        <div className="text-green-700 dark:text-green-300 text-xs">
                          ✅ Request meets 14-day advance notice requirement ({advanceNotice.daysInAdvance} days)
                        </div>
                      </div>
                    );
                  }

                  return null;
                })()}
              </div>
            )}

            {formData.start_date && formData.end_date && (checkForOverlappingHolidays() || !checkAdvanceNoticeRequirement().valid) && (
              <div className="flex items-start space-x-3 p-3 border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 rounded-md">
                <Checkbox
                  id="manager_override"
                  checked={formData.manager_override}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, manager_override: checked === true }))}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="manager_override" className="text-sm font-medium cursor-pointer">
                    Discussed with Manager &amp; Agreed
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tick this to confirm the request has been discussed and agreed with your manager. The request will still require formal approval.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                placeholder="Add any additional details..."
                value={formData.reason}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 500) {
                    setFormData(prev => ({ ...prev, reason: value }));
                  }
                }}
                rows={3}
                maxLength={500}
              />
              {formData.reason.length > 400 && (
                <div className="text-xs text-muted-foreground">
                  {500 - formData.reason.length} characters remaining
                </div>
              )}
            </div>

            <FormActions>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !formData.start_date || !formData.end_date}>
                {isLoading ? "Submitting..." : "Submit Request"}
              </Button>
            </FormActions>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}