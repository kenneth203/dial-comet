import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { persistStatusWithNews } from "@/lib/statusSync";
import { CircleCheck, Toilet, Coffee, Laptop, CircleX, type LucideIcon } from "lucide-react";

interface StatusOption {
  value: 'online' | 'toilet' | 'coffee' | 'meeting' | 'offline';
  label: string;
  emoji: string;
  icon: LucideIcon;
  timeoutMinutes?: number;
}

const statusOptions: StatusOption[] = [
  { value: 'online',  label: 'Online',       emoji: '✅', icon: CircleCheck },
  { value: 'toilet',  label: 'Toilet Break', emoji: '🚽', icon: Toilet,      timeoutMinutes: 15 },
  { value: 'coffee',  label: 'Coffee Break', emoji: '☕', icon: Coffee,      timeoutMinutes: 15 },
  { value: 'meeting', label: 'Zoom/Meeting', emoji: '💻', icon: Laptop },
  { value: 'offline', label: 'Offline',      emoji: '⛔', icon: CircleX },
];

const getHeaderStatusChannelName = (userId: string) => {
  const uniqueSuffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `header-status-${userId}-${uniqueSuffix}`;
};

type ColorTheme = 'red' | 'blue';

const themeColors: Record<ColorTheme, { icon: string; labelActive: string }> = {
  red: {
    icon: 'text-[hsl(var(--primary))]',
    labelActive: 'text-[hsl(var(--primary))]',
  },
  blue: {
    icon: 'text-[hsl(var(--primary-variant))]',
    labelActive: 'text-[hsl(var(--primary-variant))]',
  },
};

export default function HeaderStatusButtons() {
  const { user } = useAuth();
  const [currentStatus, setCurrentStatus] = useState<StatusOption>(statusOptions[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
    try {
      const saved = localStorage.getItem('status-color-theme');
      return saved === 'blue' ? 'blue' : 'red';
    } catch {
      return 'red';
    }
  });

  const toggleTheme = (theme: ColorTheme) => {
    setColorTheme(theme);
    try {
      localStorage.setItem('status-color-theme', theme);
    } catch {
      // ignore
    }
  };

  const fetchCurrentStatus = useCallback(async () => {
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
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    void fetchCurrentStatus();

    const channelName = getHeaderStatusChannelName(user.id);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_statuses'
        },
        (payload) => {
          if (!isMounted) return;

          if (payload.new && 
              typeof payload.new === 'object' && 
              'user_id' in payload.new && 
              'status' in payload.new &&
              (payload.new as any).user_id === user.id) {
            const statusOption = statusOptions.find(opt => opt.value === (payload.new as any).status) || statusOptions[0];
            setCurrentStatus(statusOption);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [fetchCurrentStatus, user]);


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
        toast.success(`Your status is now: ${newStatus.emoji} ${newStatus.label}`);

        if (newStatus.timeoutMinutes) {
          toast.info(`Status will automatically reset to Online in ${newStatus.timeoutMinutes} minutes.`);
        }
      } catch (error) {
        console.error('Error updating status:', error);
        toast.error("Failed to update status. Please try again.");
        return;
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  const theme = themeColors[colorTheme];

  return (
    <>
      {statusOptions.map((option, index) => {
        const Icon = option.icon;
        const isActive = currentStatus.value === option.value;
        const colorClass = index % 2 === 0
          ? 'text-[hsl(var(--primary))]'
          : 'text-[hsl(var(--primary-variant))]';
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => updateStatus(option)}
            disabled={isLoading}
            className={cn(
              "flex flex-col items-center gap-1 group transition-all disabled:opacity-50 w-full min-w-0 px-0.5",
              isActive ? "opacity-100" : "opacity-60 hover:opacity-90"
            )}
          >
            <Icon
              className={cn("w-8 h-8", colorClass)}
              strokeWidth={1.75}
            />
            <span className={cn(
              "text-[11px] font-semibold text-center leading-tight break-words w-full",
              isActive ? colorClass : "text-foreground"
            )}>
              {option.label}
            </span>
          </button>
        );
      })}
    </>
  );
}