import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { playNotificationPing } from '@/lib/notificationSound';

export interface RoomUnread {
  roomId: string;
  count: number;
}

export const useChatUnread = () => {
  const { user } = useAuth();
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const roomIdsRef = useRef<string[]>([]);

  const totalUnread = Object.values(unreadByRoom).reduce((s, n) => s + n, 0);

  const calculateUnread = useCallback(async () => {
    if (!user) {
      setUnreadByRoom({});
      return;
    }

    try {
      setLoading(true);

      const counts: Record<string, number> = {};
      const { data, error } = await supabase.rpc('get_chat_unread_counts' as any);
      if (error) throw error;

      for (const row of (data ?? []) as Array<{ room_id: string; unread_count: number | string }>) {
        counts[row.room_id] = Number(row.unread_count) || 0;
      }

      roomIdsRef.current = Object.keys(counts);
      setUnreadByRoom(counts);
    } catch (error) {
      console.error('Error calculating unread messages:', error);
      setUnreadByRoom({});
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Realtime: optimistic per-room increment on new messages; recalc on read receipts
  useEffect(() => {
    if (!user) return;

    const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channelName = `unread-messages-${user.id}-${uniqueId}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages'
      }, (payload) => {
        const newMessage = payload.new as { id: string; room_id: string; sender_id: string };
        if (
          newMessage.sender_id !== user.id &&
          roomIdsRef.current.includes(newMessage.room_id)
        ) {
          setUnreadByRoom(prev => ({
            ...prev,
            [newMessage.room_id]: (prev[newMessage.room_id] ?? 0) + 1,
          }));
          playNotificationPing();
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_message_reads'
      }, (payload) => {
        const record = (payload.new ?? payload.old) as { user_id?: string } | null;
        if (record?.user_id === user.id) {
          calculateUnread();
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_room_members'
      }, (payload) => {
        const rec = (payload.new ?? payload.old) as { user_id?: string } | null;
        if (rec?.user_id === user.id) {
          calculateUnread();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, calculateUnread]);

  // Initial calculation
  useEffect(() => {
    calculateUnread();
  }, [calculateUnread]);

  const clearRoomUnread = useCallback((roomId: string) => {
    setUnreadByRoom(prev => ({
      ...prev,
      [roomId]: 0,
    }));
  }, []);

  return {
    totalUnread,
    unreadByRoom,
    loading,
    refreshUnread: calculateUnread,
    clearRoomUnread,
  };
};
