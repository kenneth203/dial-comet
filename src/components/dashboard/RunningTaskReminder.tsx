import React, { useState, useEffect } from 'react';
import { useTasks } from '@/context/TasksContext';
import { useCustomers } from '@/context/CustomersContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Clock, Play } from 'lucide-react';
import { getCustomerTaskHourlyRate } from '@/lib/taskBilling';

export function RunningTaskReminder() {
  const { tasks, stopTimer } = useTasks();
  const { customers } = useCustomers();
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showHourWarning, setShowHourWarning] = useState(false);
  const [warningShownFor, setWarningShownFor] = useState<string | null>(null);

  // Find the currently running task
  const runningTask = tasks.find(task => task.isTimerRunning && task.startTime);

  // Update current time every second when there's a running task
  useEffect(() => {
    if (!runningTask) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [runningTask]);

  // Check if timer has been running for more than 60 minutes
  useEffect(() => {
    if (!runningTask || !runningTask.startTime) return;

    const elapsedMinutes = (currentTime - runningTask.startTime) / (1000 * 60);
    
    if (elapsedMinutes >= 60 && warningShownFor !== runningTask.id) {
      setShowHourWarning(true);
      setWarningShownFor(runningTask.id);
    }
  }, [runningTask, currentTime, warningShownFor]);

  // Format elapsed time
  const formatElapsedTime = (startTime: number) => {
    const elapsed = Math.floor((currentTime - startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Get customer name
  const getCustomerName = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || 'Unknown Customer';
  };

  // Handle continue timer
  const handleContinueTimer = () => {
    setShowHourWarning(false);
  };

  // Get customer's hourly rate
  const getCustomerHourlyRate = (customerId: string): number => {
    const customer = customers.find(c => c.id === customerId);
    return getCustomerTaskHourlyRate(customer);
  };

  // Handle stop timer
  const handleStopTimer = () => {
    if (runningTask) {
      const hourlyRate = getCustomerHourlyRate(runningTask.customerId);
      stopTimer(runningTask.id, hourlyRate);
      setShowHourWarning(false);
      setWarningShownFor(null);
    }
  };

  if (!runningTask || !runningTask.startTime) {
    return null;
  }

  return (
    <>
      <Badge 
        variant="secondary" 
        className="bg-primary/10 text-primary border-primary/20 animate-pulse cursor-pointer hover:bg-primary/20 transition-colors"
        onClick={() => window.location.href = '/tasks'}
      >
        <Play className="w-3 h-3 mr-1 animate-pulse" />
        <Clock className="w-3 h-3 mr-1" />
        <span className="font-mono text-xs">
          {formatElapsedTime(runningTask.startTime)}
        </span>
        <span className="ml-1 text-xs hidden sm:inline">
          • {runningTask.title.length > 20 ? `${runningTask.title.substring(0, 20)}...` : runningTask.title}
        </span>
      </Badge>

      <Dialog open={showHourWarning} onOpenChange={setShowHourWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Timer Running for 1+ Hour
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>
                Your task timer has been running for over an hour:
              </p>
              <div className="bg-muted p-3 rounded-lg">
                <p className="font-medium">{runningTask.title}</p>
                <p className="text-sm text-muted-foreground">
                  Customer: {getCustomerName(runningTask.customerId)}
                </p>
                <p className="text-sm font-mono">
                  Elapsed: {formatElapsedTime(runningTask.startTime)}
                </p>
              </div>
              <p>Do you want to continue timing this task?</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={handleStopTimer}
              className="w-full sm:w-auto"
            >
              Stop Timer
            </Button>
            <Button 
              onClick={handleContinueTimer}
              className="w-full sm:w-auto"
            >
              Continue Timer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}