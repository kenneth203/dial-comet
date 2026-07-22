import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Clock } from "lucide-react";

interface TimeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  currentTotalTime: number;
  currentBillableTime: number;
  onSave: (totalTime: number, billableTime: number) => void;
}

export function TimeEditDialog({
  open,
  onOpenChange,
  taskTitle,
  currentTotalTime,
  currentBillableTime,
  onSave,
}: TimeEditDialogProps) {
  const [totalTimeInput, setTotalTimeInput] = useState("");
  const [billableTimeInput, setBillableTimeInput] = useState("");

  // Initialize inputs when dialog opens
  useEffect(() => {
    if (open) {
      setTotalTimeInput(formatTime(currentTotalTime));
      setBillableTimeInput(formatTime(currentBillableTime || currentTotalTime));
    }
  }, [open, currentTotalTime, currentBillableTime]);

  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function parseTimeToSeconds(timeString: string): number {
    const parts = timeString.split(':');
    if (parts.length !== 3) return 0;
    
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    const seconds = parseInt(parts[2]) || 0;
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  function isValidTimeFormat(timeString: string): boolean {
    const regex = /^\d{1,2}:\d{2}:\d{2}$/;
    if (!regex.test(timeString)) return false;
    
    const parts = timeString.split(':');
    const minutes = parseInt(parts[1]);
    const seconds = parseInt(parts[2]);
    
    return minutes < 60 && seconds < 60;
  }

  const handleSave = () => {
    if (!isValidTimeFormat(totalTimeInput) || !isValidTimeFormat(billableTimeInput)) {
      toast({
        title: "Invalid time format",
        description: "Please use HH:MM:SS format",
        variant: "destructive",
      });
      return;
    }

    const totalSeconds = parseTimeToSeconds(totalTimeInput);
    const billableSeconds = parseTimeToSeconds(billableTimeInput);

    if (billableSeconds > totalSeconds) {
      toast({
        title: "Invalid time",
        description: "Billable time cannot exceed actual time",
        variant: "destructive",
      });
      return;
    }

    if (totalSeconds < 0 || billableSeconds < 0) {
      toast({
        title: "Invalid time",
        description: "Time values cannot be negative",
        variant: "destructive",
      });
      return;
    }

    onSave(totalSeconds, billableSeconds);
    onOpenChange(false);
    toast({
      title: "Time updated",
      description: `Updated time for: ${taskTitle}`,
    });
  };

  const handleReset = () => {
    setTotalTimeInput(formatTime(currentTotalTime));
    setBillableTimeInput(formatTime(currentBillableTime || currentTotalTime));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Adjust Time - {taskTitle}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="total-time">Actual Time (HH:MM:SS)</Label>
            <Input
              id="total-time"
              value={totalTimeInput}
              onChange={(e) => setTotalTimeInput(e.target.value)}
              placeholder="00:00:00"
              pattern="[0-9]{1,2}:[0-9]{2}:[0-9]{2}"
            />
            <p className="text-xs text-muted-foreground">
              Total time spent on this task
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="billable-time">Billable Time (HH:MM:SS)</Label>
            <Input
              id="billable-time"
              value={billableTimeInput}
              onChange={(e) => setBillableTimeInput(e.target.value)}
              placeholder="00:00:00"
              pattern="[0-9]{1,2}:[0-9]{2}:[0-9]{2}"
            />
            <p className="text-xs text-muted-foreground">
              Time to charge the customer for (cannot exceed actual time)
            </p>
          </div>
          
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between pt-4 gap-2">
            <Button variant="outline" onClick={handleReset}>
              Reset
            </Button>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}