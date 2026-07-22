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

      // Rooms the user is a member of
      const { data: membershipData, error: membershipError } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', user.id);

      if (membershipError) throw membershipError;

      const roomIds = (membershipData ?? []).map(m => m.room_id);
      roomIdsRef.current = roomIds;

      if (roomIds.length === 0) {
        setUnreadByRoom({});
        return;
      }

      // Pull all messages in those rooms not sent by the user
      const { data: messages, error: msgError } = await supabase
        .from('chat_messages')
        .select('id, room_id')
        .in('room_id', roomIds)
        .neq('sender_id', user.id);

      if (msgError) throw msgError;

      const allMessages = messages ?? [];
      if (allMessages.length === 0) {
        // Seed every room with 0 so consumers can read per-room counts safely
        const seeded: Record<string, number> = {};
        for (const id of roomIds) seeded[id] = 0;
        setUnreadByRoom(seeded);
        return;
      }

      // Read receipts the user already has
      const messageIds = allMessages.map(m => m.id);
      const { data: reads, error: readsError } = await (supabase
        .from('chat_message_reads') as any)
        .select('message_id')
        .eq('user_id', user.id)
        .in('message_id', messageIds);

      if (readsError) throw readsError;

      const readSet = new Set<string>((reads ?? []).map((r: any) => r.message_id as string));

      const counts: Record<string, number> = {};
      for (const id of roomIds) counts[id] = 0;
      for (const m of allMessages) {
        if (!readSet.has(m.id)) {
          counts[m.room_id] = (counts[m.room_id] ?? 0) + 1;
        }
      }

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
