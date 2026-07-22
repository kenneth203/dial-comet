import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getFormattedNameFromProfile } from "@/lib/nameUtils";

interface UserStatus {
  id: string;
  user_id: string;
  status: 'online' | 'toilet' | 'coffee' | 'meeting' | 'offline';
  status_emoji: string;
  last_updated: string;
  auto_reset_at?: string;
  userName?: string;
}

export default function TeamStatusDisplay() {
  const { user } = useAuth();
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatus>>({});

  useEffect(() => {
    if (user) {
      fetchUserStatuses();
      return subscribeToStatusUpdates();
    }
  }, [user]);

  const fetchUserStatuses = async () => {
    if (!user) return;

    try {
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
      console.error('Error fetching user statuses:', error);
    }
  };

  const subscribeToStatusUpdates = () => {
    const channel = supabase
      .channel(`team-status-changes-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_statuses'
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newStatus = payload.new as any;
            setUserStatuses(prev => ({
              ...prev,
              [newStatus.user_id]: {
                ...prev[newStatus.user_id],
                ...newStatus,
                userName: prev[newStatus.user_id]?.userName || 'User'
              }
            }));

            void (async () => {
              const { data } = await Promise.resolve(
                supabase.from('profiles').select('user_id, name').eq('user_id', newStatus.user_id).single()
              );
                if (data) {
                  setUserStatuses(prev => ({
                    ...prev,
                    [data.user_id]: {
                      ...prev[data.user_id],
                      userName: getFormattedNameFromProfile(data)
                    }
                  }));
                }
            })();
          } else if (payload.eventType === 'DELETE') {
            setUserStatuses(prev => {
              const updated = { ...prev };
              delete updated[(payload.old as any).user_id];
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

  if (!user) return null;

  const otherUsers = Object.entries(userStatuses)
    .filter(([userId]) => userId !== user.id)
    .slice(0, 8); // Limit display to prevent overflow

  if (otherUsers.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Team Status</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2">
          {otherUsers.map(([userId, status]) => (
            <div
              key={userId}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted/50 text-xs"
            >
              <span className="flex-shrink-0">{status.status_emoji}</span>
              <span className="max-w-[60px] sm:max-w-[80px] truncate">
                {status.userName || 'User'}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}