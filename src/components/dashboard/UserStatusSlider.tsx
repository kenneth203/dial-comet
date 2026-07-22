import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getFormattedNameFromProfile } from "@/lib/nameUtils";
import { persistStatusWithNews } from "@/lib/statusSync";

interface UserStatus {
  id: string;
  user_id: string;
  status: 'online' | 'toilet' | 'coffee' | 'meeting' | 'offline';
  status_emoji: string;
  last_updated: string;
  auto_reset_at?: string;
  userName?: string;
}

interface StatusOption {
  value: 'online' | 'toilet' | 'coffee' | 'meeting' | 'offline';
  label: string;
  emoji: string;
  timeoutMinutes?: number;
}

const statusOptions: StatusOption[] = [
  { value: 'online', label: 'Online', emoji: '✅' },
  { value: 'toilet', label: 'Toilet', emoji: '🚽', timeoutMinutes: 15 },
  { value: 'coffee', label: 'Gone for Coffee', emoji: '☕', timeoutMinutes: 15 },
  { value: 'meeting', label: 'Zoom / Meeting', emoji: '💻' },
  { value: 'offline', label: 'Offline', emoji: '⛔' },
];

export default function UserStatusSlider() {
  const { user } = useAuth();
  const [currentStatus, setCurrentStatus] = useState<StatusOption>(statusOptions[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatus>>({});

  useEffect(() => {
    if (user) {
      fetchCurrentStatus();
      return subscribeToStatusUpdates();
    }
  }, [user]);

  const fetchCurrentStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_statuses')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching status:', error);
        return;
      }

      if (data) {
        const statusOption = statusOptions.find(opt => opt.value === data.status) || statusOptions[0];
        setCurrentStatus(statusOption);
      }

      // Fetch all user statuses for display
      const { data: allStatuses, error: allError } = await supabase
        .from('user_statuses')
        .select('*');

      if (!allError && allStatuses) {
        // Get profile names for all users with statuses
        const userIds = allStatuses.map(status => status.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, name')
          .in('user_id', userIds);

        const profileMap = profiles?.reduce((acc, profile) => {
          const displayName = getFormattedNameFromProfile(profile);
          acc[profile.user_id] = displayName;
          return acc;
        }, {} as Record<string, string>) || {};

        const statusMap = allStatuses.reduce((acc, status) => {
          acc[status.user_id] = {
            ...status,
            userName: profileMap[status.user_id] || 'User'
          };
          return acc;
        }, {} as Record<string, any>);
        setUserStatuses(statusMap);
      }
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  };

  const subscribeToStatusUpdates = () => {
    const channel = supabase
      .channel(`user-status-changes-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_statuses'
        },
        (payload) => {
          // Status change received
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setUserStatuses(prev => ({
              ...prev,
              [payload.new.user_id]: payload.new
            }));
            
            // Update current user's status if it's their own
            if (user && payload.new.user_id === user.id) {
              const statusOption = statusOptions.find(opt => opt.value === payload.new.status) || statusOptions[0];
              setCurrentStatus(statusOption);
            }
          } else if (payload.eventType === 'DELETE') {
            setUserStatuses(prev => {
              const updated = { ...prev };
              delete updated[payload.old.user_id];
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const updateStatus = async (newStatus: StatusOption) => {
    if (!user || isLoading) return;

    setIsLoading(true);
    
    try {
      // Track timing for toilet and coffee statuses
      if ((newStatus.value === 'toilet' || newStatus.value === 'coffee') || 
          (currentStatus.value === 'toilet' || currentStatus.value === 'coffee')) {
        
        // If coming FROM toilet/coffee to another status, log end time
        if ((currentStatus.value === 'toilet' || currentStatus.value === 'coffee') && 
            currentStatus.value !== newStatus.value) {
          const { error: endTimingError } = await supabase
            .from('status_timing_logs')
            .insert({
              user_id: user.id,
              status: currentStatus.value,
              action: 'end',
              timestamp: new Date().toISOString()
            });

          if (endTimingError) {
            console.error('Error logging end time:', endTimingError);
          }
        }

        // If going TO toilet/coffee from another status, log start time
        if ((newStatus.value === 'toilet' || newStatus.value === 'coffee') && 
            currentStatus.value !== newStatus.value) {
          const { error: startTimingError } = await supabase
            .from('status_timing_logs')
            .insert({
              user_id: user.id,
              status: newStatus.value,
              action: 'start',
              timestamp: new Date().toISOString()
            });

          if (startTimingError) {
            console.error('Error logging start time:', startTimingError);
          }
        }
      }

      try {
        await persistStatusWithNews({
          userId: user.id,
          status: newStatus.value,
          emoji: newStatus.emoji,
          label: newStatus.label,
          timeoutMinutes: newStatus.timeoutMinutes,
        });

        setCurrentStatus(newStatus);
        
        toast({
          title: "Status Updated",
          description: `Your status is now: ${newStatus.emoji} ${newStatus.label}`,
        });

        if (newStatus.timeoutMinutes) {
          toast({
            title: "Auto-reset Scheduled",
            description: `Status will automatically reset to Online in ${newStatus.timeoutMinutes} minutes.`,
          });
        }
      } catch (error) {
        console.error('Error updating status:', error);
        toast({
          title: "Error",
          description: "Failed to update status. Please try again.",
          variant: "destructive",
        });
        return;
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Your Status</h3>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted">
              <span className="text-lg">{currentStatus.emoji}</span>
              <span className="text-sm font-medium">{currentStatus.label}</span>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-0.5 sm:gap-1">
            {statusOptions.map((option) => (
              <Button
                key={option.value}
                variant={currentStatus.value === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => updateStatus(option)}
                disabled={isLoading}
                className={cn(
                  "flex flex-col items-center gap-0.5 h-auto py-2 px-1",
                  currentStatus.value === option.value && "ring-2 ring-primary"
                )}
              >
                <span className="text-sm">{option.emoji}</span>
                <span className="text-xs leading-tight text-center line-clamp-2 w-full">{option.label}</span>
                {option.timeoutMinutes && (
                  <span className="text-xs opacity-70">
                    {option.timeoutMinutes}min
                  </span>
                )}
              </Button>
            ))}
          </div>

          {Object.keys(userStatuses).length > 1 && (
            <div className="pt-2 border-t">
              <h4 className="text-sm font-medium mb-2">Team Status</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(userStatuses)
                  .filter(([userId]) => userId !== user.id)
                  .slice(0, 8) // Limit display to prevent overflow
                  .map(([userId, status]) => (
                    <div
                      key={userId}
                      className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted/50 text-xs"
                    >
                      <span>{status.status_emoji}</span>
                      <span className="max-w-[80px] truncate">
                        {status.userName || 'User'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}