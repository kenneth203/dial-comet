import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  user_name?: string;
}

export type ReactionsMap = Record<string, Reaction[]>;

const nameCache: Record<string, string> = {};

async function resolveName(userId: string): Promise<string> {
  if (nameCache[userId]) return nameCache[userId];
  const { data } = await supabase.rpc('get_user_display_name', { target_user_id: userId });
  const name = (data as string) || 'Unknown User';
  nameCache[userId] = name;
  return name;
}

export function useMessageReactions(messageIds: string[]) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<ReactionsMap>({});
  const idsRef = useRef<Set<string>>(new Set());

  // Keep a stable key for the effect
  const idsKey = messageIds.join(',');

  useEffect(() => {
    idsRef.current = new Set(messageIds);
  }, [idsKey, messageIds]);

  // Load reactions when message set changes
  useEffect(() => {
    if (!user || messageIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase
        .from('chat_message_reactions') as any)
        .select('id, message_id, user_id, emoji')
        .in('message_id', messageIds);
      if (error || cancelled) return;
      const rows = (data || []) as Reaction[];
      const uniqueUsers = Array.from(new Set(rows.map(r => r.user_id)));
      await Promise.all(uniqueUsers.map(resolveName));
      const map: ReactionsMap = {};
      for (const r of rows) {
        (map[r.message_id] ||= []).push({ ...r, user_name: nameCache[r.user_id] });
      }
      if (!cancelled) setReactions(map);
    })();
    return () => { cancelled = true; };
  }, [idsKey, user]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat-reactions-${user.id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_message_reactions',
      }, async (payload) => {
        const r = payload.new as Reaction;
        if (!idsRef.current.has(r.message_id)) return;
        const user_name = await resolveName(r.user_id);
        setReactions(prev => {
          const list = prev[r.message_id] || [];
          if (list.some(x => x.id === r.id)) return prev;
          return { ...prev, [r.message_id]: [...list, { ...r, user_name }] };
        });
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'chat_message_reactions',
      }, (payload) => {
        const r = payload.old as Reaction;
        setReactions(prev => {
          const list = prev[r.message_id];
          if (!list) return prev;
          return { ...prev, [r.message_id]: list.filter(x => x.id !== r.id) };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = (reactions[messageId] || []).find(
      r => r.user_id === user.id && r.emoji === emoji
    );
    if (existing) {
      // Optimistic remove
      setReactions(prev => ({
        ...prev,
        [messageId]: (prev[messageId] || []).filter(r => r.id !== existing.id),
      }));
      const { error } = await (supabase.from('chat_message_reactions') as any)
        .delete().eq('id', existing.id);
      if (error) {
        setReactions(prev => ({
          ...prev,
          [messageId]: [...(prev[messageId] || []), existing],
        }));
        toast({ title: 'Error', description: 'Failed to remove reaction', variant: 'destructive' });
      }
    } else {
      const tempId = `temp-${Date.now()}`;
      const optimistic: Reaction = {
        id: tempId, message_id: messageId, user_id: user.id, emoji, user_name: 'You',
      };
      setReactions(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []), optimistic],
      }));
      const { data, error } = await (supabase.from('chat_message_reactions') as any)
        .insert({ message_id: messageId, user_id: user.id, emoji })
        .select().single();
      if (error) {
        setReactions(prev => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter(r => r.id !== tempId),
        }));
        toast({ title: 'Error', description: 'Failed to add reaction', variant: 'destructive' });
      } else {
        setReactions(prev => ({
          ...prev,
          [messageId]: (prev[messageId] || []).map(r =>
            r.id === tempId ? { ...(data as Reaction), user_name: 'You' } : r
          ),
        }));
      }
    }
  }, [reactions, user]);

  return { reactions, toggleReaction };
}

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🙏', '🔥'];
