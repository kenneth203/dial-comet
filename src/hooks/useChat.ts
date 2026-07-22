import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface ChatRoom {
  id: string;
  name: string;
  type: 'general' | 'dm';
  created_at: string;
  updated_at: string;
  created_by?: string;
  members?: ChatMember[];
  other_member?: ChatMember;
}

export interface MessageRead {
  user_id: string;
  read_at: string;
  reader_name?: string;
}

export interface MessageDelivery {
  user_id: string;
  delivered_at: string;
  recipient_name?: string;
}

export interface ChatAttachment {
  id: string;
  message_id: string;
  file_name: string;
  file_path: string;
  content_type: string | null;
  file_size: number | null;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    name: string;
  };
  reads?: MessageRead[];
  deliveries?: MessageDelivery[];
  attachments?: ChatAttachment[];
}

export interface ChatMember {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  user?: {
    id: string;
    name: string;
  };
}

export const useChat = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [reconcilingReceipts, setReconcilingReceipts] = useState(false);
  const channelRef = useRef<any>(null);
  const roomsRef = useRef<ChatRoom[]>([]);
  const activeRoomRef = useRef<ChatRoom | null>(null);
  const messagesMapRef = useRef<Record<string, ChatMessage[]>>({});
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);
  useEffect(() => { activeRoomRef.current = activeRoom; }, [activeRoom]);
  useEffect(() => { messagesMapRef.current = messagesMap; }, [messagesMap]);

  // Derive current messages / loading from active room
  const messages = activeRoom ? (messagesMap[activeRoom.id] || []) : [];
  const loading = activeRoom ? (loadingMap[activeRoom.id] || false) : false;

  // Load rooms that the user belongs to
  const loadRooms = useCallback(async () => {
    if (!user) return;

    try {
      // Get rooms the user is a member of
      const { data: memberships, error } = await supabase
        .from('chat_room_members')
        .select(`
          room_id,
          chat_rooms (
            id,
            name,
            type,
            created_at,
            updated_at,
            created_by
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      const roomsData = memberships?.map((m: any) => m.chat_rooms).filter(Boolean) || [];
      
      // For direct message rooms, get the other member's info
      const enrichedRooms = await Promise.all(
        roomsData.map(async (room: any) => {
          if (room.type === 'dm') {
            // Get the other member
            const { data: members } = await supabase
              .from('chat_room_members')
              .select('user_id')
              .eq('room_id', room.id)
              .neq('user_id', user.id);

            if (members && members.length > 0) {
              const { data: displayName } = await supabase.rpc('get_user_display_name', {
                target_user_id: members[0].user_id
              });

              return {
                ...room,
                name: displayName || 'Unknown User',
                other_member: {
                  id: members[0].user_id,
                  name: displayName,
                  user_id: members[0].user_id
                }
              };
            }
          }
          return room;
        })
      );

      setRooms(enrichedRooms);
    } catch (error) {
      console.error('Error loading rooms:', error);
      toast({
        title: 'Error',
        description: 'Failed to load chat rooms',
        variant: 'destructive'
      });
    }
  }, [user]);

  // Load messages for a specific room
  const loadMessages = useCallback(async (roomId: string) => {
    if (!user || !roomId) return;

    try {
      setLoadingMap(prev => ({ ...prev, [roomId]: true }));

      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, room_id, sender_id, content, created_at, updated_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;

      const rawMessages = data || [];

      // Fetch read receipts for messages sent by the current user (others' reads on own messages)
      const ownMessageIds = rawMessages
        .filter((m: any) => m.sender_id === user.id)
        .map((m: any) => m.id);

      let readsByMessage: Record<string, MessageRead[]> = {};
      let deliveriesByMessage: Record<string, MessageDelivery[]> = {};
      if (ownMessageIds.length > 0) {
        const [readsRes, delivRes] = await Promise.all([
          (supabase.from('chat_message_reads') as any)
            .select('message_id, user_id, read_at')
            .in('message_id', ownMessageIds)
            .neq('user_id', user.id),
          (supabase.from('chat_message_deliveries') as any)
            .select('message_id, user_id, delivered_at')
            .in('message_id', ownMessageIds)
            .neq('user_id', user.id),
        ]);

        const readRows = (readsRes.data || []) as Array<{ message_id: string; user_id: string; read_at: string }>;
        const delivRows = (delivRes.data || []) as Array<{ message_id: string; user_id: string; delivered_at: string }>;

        const uniqueUserIds = Array.from(new Set([
          ...readRows.map(r => r.user_id),
          ...delivRows.map(d => d.user_id),
        ]));
        const nameMap: Record<string, string> = {};
        await Promise.all(uniqueUserIds.map(async (uid) => {
          const { data: displayName } = await supabase.rpc('get_user_display_name', {
            target_user_id: uid,
          });
          nameMap[uid] = (displayName as string) || 'Unknown User';
        }));
        for (const r of readRows) {
          (readsByMessage[r.message_id] ||= []).push({
            user_id: r.user_id,
            read_at: r.read_at,
            reader_name: nameMap[r.user_id],
          });
        }
        for (const d of delivRows) {
          (deliveriesByMessage[d.message_id] ||= []).push({
            user_id: d.user_id,
            delivered_at: d.delivered_at,
            recipient_name: nameMap[d.user_id],
          });
        }
      }

      // Fetch attachments for all messages
      const allIds = rawMessages.map((m: any) => m.id);
      let attachmentsByMessage: Record<string, ChatAttachment[]> = {};
      if (allIds.length > 0) {
        const { data: attRows } = await (supabase.from('chat_attachments') as any)
          .select('id, message_id, file_name, file_path, content_type, file_size')
          .in('message_id', allIds);
        for (const r of (attRows || []) as ChatAttachment[]) {
          (attachmentsByMessage[r.message_id] ||= []).push(r);
        }
      }

      // Get sender names
      const messagesWithSender = await Promise.all(rawMessages.map(async (msg: any) => {
        const { data: displayName } = await supabase.rpc('get_user_display_name', {
          target_user_id: msg.sender_id
        });

        return {
          ...msg,
          sender: {
            id: msg.sender_id,
            name: displayName || 'Unknown User'
          },
          reads: readsByMessage[msg.id] || [],
          deliveries: deliveriesByMessage[msg.id] || [],
          attachments: attachmentsByMessage[msg.id] || [],
        };
      }));

      setMessagesMap(prev => ({ ...prev, [roomId]: messagesWithSender }));
    } catch (error) {
      console.error('Error loading messages:', error);
      toast({
        title: 'Error',
        description: 'Failed to load messages',
        variant: 'destructive'
      });
    } finally {
      setLoadingMap(prev => ({ ...prev, [roomId]: false }));
    }
  }, [user]);

  // Send a message (optionally with attachments)
  const sendMessage = useCallback(async (
    content: string,
    filesOrUploaded?: File[] | { preUploaded: import('@/lib/chatUpload').UploadedAttachment[] }
  ) => {
    if (!user || !activeRoom) return;
    const hasText = content.trim().length > 0;
    const preUploaded = filesOrUploaded && !Array.isArray(filesOrUploaded) ? filesOrUploaded.preUploaded : undefined;
    const files = Array.isArray(filesOrUploaded) ? filesOrUploaded : undefined;
    const hasFiles = (!!files && files.length > 0) || (!!preUploaded && preUploaded.length > 0);
    if (!hasText && !hasFiles) return;

    const roomId = activeRoom.id;
    const trimmed = content.trim();
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { data: { session } } = await supabase.auth.getSession();
    const { data: displayName } = await supabase.rpc('get_user_display_name', { target_user_id: user.id });
    const senderName =
      (displayName as string | null) ||
      (session?.user?.user_metadata as any)?.full_name ||
      (session?.user?.user_metadata as any)?.name ||
      'You';

    // Optimistic message — show immediately in the sender's view
    const optimisticMessage: any = {
      id: tempId,
      room_id: roomId,
      sender_id: user.id,
      content: trimmed,
      created_at: new Date().toISOString(),
      pending: true,
      sender: { id: user.id, name: senderName },
      attachments: [],
    };
    setMessagesMap(prev => ({
      ...prev,
      [roomId]: [...(prev[roomId] || []), optimisticMessage],
    }));

    try {
      setSending(true);

      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          room_id: roomId,
          sender_id: user.id,
          content: trimmed,
        })
        .select()
        .single();

      if (error) throw error;

      // Insert attachment rows — either from pre-uploaded paths or by uploading now.
      const uploadedAttachments: ChatAttachment[] = [];

      const insertAttRow = async (meta: { path: string; file_name: string; content_type: string | null; file_size: number; }) => {
        const { data: attRow, error: attErr } = await (supabase
          .from('chat_attachments') as any)
          .insert({
            message_id: data.id,
            room_id: roomId,
            uploaded_by: user.id,
            file_name: meta.file_name,
            file_path: meta.path,
            content_type: meta.content_type,
            file_size: meta.file_size,
          })
          .select('id, message_id, file_name, file_path, content_type, file_size')
          .single();
        if (attErr) {
          console.error('Attachment insert failed:', attErr);
          await supabase.storage.from('chat-attachments').remove([meta.path]);
          return;
        }
        uploadedAttachments.push(attRow as ChatAttachment);
      };

      if (preUploaded && preUploaded.length > 0) {
        for (const meta of preUploaded) await insertAttRow(meta);
      } else if (files) {
        for (const file of files) {
          const safeNameStr = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const path = `${roomId}/${data.id}/${Date.now()}_${safeNameStr}`;
          const { error: upErr } = await supabase.storage
            .from('chat-attachments')
            .upload(path, file, { contentType: file.type || undefined });
          if (upErr) {
            console.error('Attachment upload failed:', upErr);
            toast({ title: 'Upload failed', description: `${file.name}: ${upErr.message}`, variant: 'destructive' });
            continue;
          }
          await insertAttRow({ path, file_name: file.name, content_type: file.type || null, file_size: file.size });
        }
      }

      // Replace the optimistic message with the real one
      setMessagesMap(prev => {
        const list = prev[roomId] || [];
        const withoutTemp = list.filter(m => m.id !== tempId && m.id !== data.id);
        return {
          ...prev,
          [roomId]: [...withoutTemp, { ...data, sender: { id: user.id, name: senderName }, attachments: uploadedAttachments }],
        };
      });
    } catch (error) {
      console.error('Error sending message:', error);
      // Roll back optimistic message
      setMessagesMap(prev => ({
        ...prev,
        [roomId]: (prev[roomId] || []).filter(m => m.id !== tempId),
      }));
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  }, [user, activeRoom]);

  // Create or find existing DM room using the server-side function
  const createOrFindDMRoom = useCallback(async (otherUserId: string) => {
    if (!user || otherUserId === user.id) return null;

    try {
      // Use the server-side function to safely create/find DM room
      const { data: roomId, error } = await supabase.rpc('create_direct_message_room', {
        target_user_id: otherUserId
      });

      if (error) throw error;

      // Reload rooms to get the updated list (including the new/found room)
      await loadRooms();
      
      // Find the room in our local state and select it
      const room = rooms.find(r => r.id === roomId) || await new Promise<ChatRoom | null>((resolve) => {
        // If room not immediately found, wait a bit for state update
        setTimeout(() => {
          const foundRoom = rooms.find(r => r.id === roomId);
          resolve(foundRoom || null);
        }, 100);
      });

      if (room) {
        setActiveRoom(room);
        await loadMessages(roomId);
        return room;
      }

      return null;
    } catch (error) {
      console.error('Error creating/finding DM room:', error);
      toast({
        title: 'Error',
        description: 'Failed to create direct message',
        variant: 'destructive'
      });
      return null;
    }
  }, [user, rooms, loadRooms, loadMessages]);

  // Mark room as read
  const markAsRead = useCallback(async (roomId: string) => {
    if (!user || !roomId) return;

    try {
      // Mark all unread messages in this room as read
      const { data: unreadMessages } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('room_id', roomId)
        .neq('sender_id', user.id);

      if (unreadMessages && unreadMessages.length > 0) {
        const reads = unreadMessages.map(msg => ({
          message_id: msg.id,
          user_id: user.id,
        }));
        const { error } = await (supabase
          .from('chat_message_reads') as any)
          .upsert(reads, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
        if (error) throw error;
      }
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  }, [user]);

  // Reconcile missing delivery/read rows for own messages currently in cache.
  // Acts as a safety net for dropped realtime events / reconnects.
  const reconcileReceipts = useCallback(async () => {
    if (!user) return;
    setReconcilingReceipts(true);
    try {
      // Gather own message IDs across all cached rooms
      const ownIds: string[] = [];
      const ownMessagesIndex: Record<string, { roomId: string }> = {};
      for (const [roomId, msgs] of Object.entries(messagesMapRef.current) as Array<[string, ChatMessage[]]>) {
        for (const m of msgs) {
          if (m.sender_id === user.id) {
            ownIds.push(m.id);
            ownMessagesIndex[m.id] = { roomId };
          }
        }
      }
      if (ownIds.length === 0) return;

      const [readsRes, delivRes] = await Promise.all([
        (supabase.from('chat_message_reads') as any)
          .select('message_id, user_id, read_at')
          .in('message_id', ownIds)
          .neq('user_id', user.id),
        (supabase.from('chat_message_deliveries') as any)
          .select('message_id, user_id, delivered_at')
          .in('message_id', ownIds)
          .neq('user_id', user.id),
      ]);

      const readRows = (readsRes.data || []) as Array<{ message_id: string; user_id: string; read_at: string }>;
      const delivRows = (delivRes.data || []) as Array<{ message_id: string; user_id: string; delivered_at: string }>;

      // Determine which rows are new vs what's already cached
      const newReadsByMsg: Record<string, typeof readRows> = {};
      const newDelivByMsg: Record<string, typeof delivRows> = {};
      const map = messagesMapRef.current;
      for (const r of readRows) {
        const info = ownMessagesIndex[r.message_id];
        if (!info) continue;
        const msg = (map[info.roomId] || []).find(m => m.id === r.message_id);
        if (msg?.reads?.some(x => x.user_id === r.user_id)) continue;
        (newReadsByMsg[r.message_id] ||= []).push(r);
      }
      for (const d of delivRows) {
        const info = ownMessagesIndex[d.message_id];
        if (!info) continue;
        const msg = (map[info.roomId] || []).find(m => m.id === d.message_id);
        if (msg?.deliveries?.some(x => x.user_id === d.user_id)) continue;
        (newDelivByMsg[d.message_id] ||= []).push(d);
      }

      const userIds = Array.from(new Set([
        ...Object.values(newReadsByMsg).flat().map(r => r.user_id),
        ...Object.values(newDelivByMsg).flat().map(d => d.user_id),
      ]));
      if (userIds.length === 0 && Object.keys(newReadsByMsg).length === 0 && Object.keys(newDelivByMsg).length === 0) {
        return;
      }
      const nameMap: Record<string, string> = {};
      await Promise.all(userIds.map(async (uid) => {
        const { data: displayName } = await supabase.rpc('get_user_display_name', { target_user_id: uid });
        nameMap[uid] = (displayName as string) || 'Unknown User';
      }));

      // Also reconcile inbound deliveries: for messages from others currently cached,
      // ensure we've recorded our own delivery row (in case realtime missed them).
      const inboundIds: string[] = [];
      for (const msgs of Object.values(messagesMapRef.current) as ChatMessage[][]) {
        for (const m of msgs) {
          if (m.sender_id !== user.id) inboundIds.push(m.id);
        }
      }
      if (inboundIds.length > 0) {
        void (supabase.from('chat_message_deliveries') as any).upsert(
          inboundIds.map(id => ({ message_id: id, user_id: user.id })),
          { onConflict: 'message_id,user_id', ignoreDuplicates: true }
        );
      }

      setMessagesMap(prev => {
        const next: typeof prev = { ...prev };
        for (const [roomId, msgs] of Object.entries(prev)) {
          let touched = false;
          const updated = msgs.map(m => {
            const nr = newReadsByMsg[m.id];
            const nd = newDelivByMsg[m.id];
            if (!nr && !nd) return m;
            touched = true;
            return {
              ...m,
              reads: [
                ...(m.reads || []),
                ...(nr || []).map(r => ({ user_id: r.user_id, read_at: r.read_at, reader_name: nameMap[r.user_id] })),
              ],
              deliveries: [
                ...(m.deliveries || []),
                ...(nd || []).map(d => ({ user_id: d.user_id, delivered_at: d.delivered_at, recipient_name: nameMap[d.user_id] })),
              ],
            };
          });
          if (touched) next[roomId] = updated;
        }
        return next;
      });
    } catch (err) {
      console.error('Error reconciling receipts:', err);
    } finally {
      setReconcilingReceipts(false);
    }
  }, [user]);

  // Set active room and load messages
  const selectRoom = useCallback(async (room: ChatRoom) => {
    setActiveRoom(room);
    // If we already have cached messages for this room, they'll show instantly
    // while we refresh in the background
    await loadMessages(room.id);
    await markAsRead(room.id);
  }, [loadMessages, markAsRead]);

  // Setup realtime subscriptions
  useEffect(() => {
    if (!user) return;

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Subscribe to new messages
    channelRef.current = supabase
      .channel(`chat-messages-${user.id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages'
      }, async (payload) => {
        const newMessage = payload.new as any;
        
        // Get sender info
        const { data: displayName } = await supabase.rpc('get_user_display_name', {
          target_user_id: newMessage.sender_id
        });

        const messageWithSender = {
          ...newMessage,
          sender: {
            id: newMessage.sender_id,
            name: displayName || 'Unknown User'
          }
        };

        // Add to the appropriate room's message cache (dedupe by id, replace any
        // optimistic temp message from the same sender with identical content).
        setMessagesMap(prev => {
          const roomMessages = prev[newMessage.room_id] || [];
          if (roomMessages.some(m => m.id === newMessage.id)) {
            return prev;
          }
          const filtered = roomMessages.filter(m =>
            !(typeof m.id === 'string' && m.id.startsWith('temp-') &&
              m.sender_id === newMessage.sender_id &&
              m.content === newMessage.content)
          );
          return {
            ...prev,
            [newMessage.room_id]: [...filtered, messageWithSender]
          };
        });

        // If this room isn't in our local list yet (e.g. someone just created a brand-new
        // DM with us), refresh the rooms list so the conversation appears in the sidebar.
        const knownRoom = roomsRef.current.find(r => r.id === newMessage.room_id);
        if (!knownRoom) {
          void loadRooms();
        }

        // Record delivery confirmation for messages from others
        if (newMessage.sender_id !== user.id) {
          void (supabase.from('chat_message_deliveries') as any).upsert(
            [{ message_id: newMessage.id, user_id: user.id }],
            { onConflict: 'message_id,user_id', ignoreDuplicates: true }
          );
        }

        // If this is for the active room, mark as read
        if (activeRoomRef.current && newMessage.room_id === activeRoomRef.current.id) {
          await markAsRead(newMessage.room_id);
        } else if (knownRoom && newMessage.sender_id !== user.id) {
          // Show toast for background rooms we already know about
          toast({
            title: `${messageWithSender.sender.name} \u2192 ${knownRoom.name}`,
            description: newMessage.content.substring(0, 100)
          });
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages'
      }, (payload) => {
        const oldMsg = payload.old as { id: string; room_id?: string };
        setMessagesMap(prev => {
          const next: typeof prev = {};
          let touched = false;
          for (const [roomId, msgs] of Object.entries(prev)) {
            const filtered = msgs.filter(m => m.id !== oldMsg.id);
            if (filtered.length !== msgs.length) touched = true;
            next[roomId] = filtered;
          }
          return touched ? next : prev;
        });
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_attachments'
      }, (payload) => {
        const att = payload.new as ChatAttachment & { room_id: string };
        setMessagesMap(prev => {
          const list = prev[att.room_id];
          if (!list) return prev;
          let touched = false;
          const updated = list.map(m => {
            if (m.id !== att.message_id) return m;
            const existing = m.attachments || [];
            if (existing.some(a => a.id === att.id)) return m;
            touched = true;
            return { ...m, attachments: [...existing, att] };
          });
          if (!touched) return prev;
          return { ...prev, [att.room_id]: updated };
        });
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_room_members',
        filter: `user_id=eq.${user.id}`
      }, () => {
        // We've just been added to a new chat room — refresh the rooms list.
        void loadRooms();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_message_deliveries'
      }, async (payload) => {
        const deliv = payload.new as { message_id: string; user_id: string; delivered_at: string };
        if (deliv.user_id === user.id) return;
        const { data: displayName } = await supabase.rpc('get_user_display_name', {
          target_user_id: deliv.user_id,
        });
        const recipientName = (displayName as string) || 'Unknown User';
        setMessagesMap(prev => {
          const next: typeof prev = { ...prev };
          for (const [roomId, msgs] of Object.entries(prev)) {
            let touched = false;
            const updated = msgs.map(m => {
              if (m.id !== deliv.message_id) return m;
              if (m.sender_id !== user.id) return m;
              const existing = m.deliveries || [];
              if (existing.some(d => d.user_id === deliv.user_id)) return m;
              touched = true;
              return {
                ...m,
                deliveries: [...existing, { user_id: deliv.user_id, delivered_at: deliv.delivered_at, recipient_name: recipientName }],
              };
            });
            if (touched) next[roomId] = updated;
          }
          return next;
        });
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_message_reads'
      }, async (payload) => {
        const read = payload.new as { message_id: string; user_id: string; read_at: string };
        if (read.user_id === user.id) return; // own read receipts don't matter for ticks

        // Resolve reader name
        const { data: displayName } = await supabase.rpc('get_user_display_name', {
          target_user_id: read.user_id,
        });
        const readerName = (displayName as string) || 'Unknown User';

        // Attach to whichever own message it belongs to
        setMessagesMap(prev => {
          const next: typeof prev = { ...prev };
          for (const [roomId, msgs] of Object.entries(prev)) {
            let touched = false;
            const updated = msgs.map(m => {
              if (m.id !== read.message_id) return m;
              if (m.sender_id !== user.id) return m;
              const existing = m.reads || [];
              if (existing.some(r => r.user_id === read.user_id)) return m;
              touched = true;
              return {
                ...m,
                reads: [...existing, { user_id: read.user_id, read_at: read.read_at, reader_name: readerName }],
              };
            });
            if (touched) next[roomId] = updated;
          }
          return next;
        });
      })
      .subscribe((status) => {
        // On (re)connect, run a reconciliation pass to catch anything missed while offline
        if (status === 'SUBSCRIBED') {
          void loadRooms();
          if (activeRoomRef.current?.id) {
            void loadMessages(activeRoomRef.current.id);
          }
          void reconcileReceipts();
        }
      });

    // Periodic reconciliation as a safety net for unstable realtime
    const intervalId = window.setInterval(() => {
      void reconcileReceipts();
    }, 30000);

    // Reconcile on focus / network recovery
    const onFocus = () => { void reconcileReceipts(); };
    const onOnline = () => { void reconcileReceipts(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void reconcileReceipts();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, markAsRead, reconcileReceipts, loadRooms, loadMessages]);

  // Load initial data
  useEffect(() => {
    if (user) {
      loadRooms();
    }
  }, [user, loadRooms]);

  // Clear all messages in a room (keeps the room itself)
  const clearRoom = useCallback(async (roomId: string) => {
    if (!user || !roomId) return false;
    try {
      const { error } = await supabase.rpc('clear_chat_room' as any, { p_room_id: roomId });
      if (error) throw error;
      setMessagesMap(prev => ({ ...prev, [roomId]: [] }));
      toast({ title: 'Chat cleared', description: 'All messages have been removed.' });
      return true;
    } catch (error: any) {
      console.error('Error clearing chat:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to clear chat', variant: 'destructive' });
      return false;
    }
  }, [user]);

  // Delete a chat room entirely
  const deleteRoom = useCallback(async (roomId: string) => {
    if (!user || !roomId) return false;
    try {
      const { error } = await supabase.rpc('delete_chat_room' as any, { p_room_id: roomId });
      if (error) throw error;
      setMessagesMap(prev => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
      setRooms(prev => prev.filter(r => r.id !== roomId));
      if (activeRoomRef.current?.id === roomId) {
        setActiveRoom(null);
      }
      toast({ title: 'Chat deleted', description: 'The conversation has been removed.' });
      return true;
    } catch (error: any) {
      console.error('Error deleting chat:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to delete chat', variant: 'destructive' });
      return false;
    }
  }, [user]);

  // Create a private channel with selected members (Admin/Super-Admin only on the server)
  const createChannel = useCallback(async (name: string, memberIds: string[]) => {
    if (!user) return null;
    try {
      const { data, error } = await supabase.rpc('create_private_channel' as any, {
        p_name: name,
        p_member_ids: memberIds,
      });
      if (error) throw error;
      await loadRooms();
      toast({ title: 'Channel created', description: `# ${name}` });
      return data as string;
    } catch (error: any) {
      console.error('Error creating channel:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to create channel', variant: 'destructive' });
      return null;
    }
  }, [user, loadRooms]);

  // Replace the member list of an existing channel
  const updateChannelMembers = useCallback(async (roomId: string, memberIds: string[]) => {
    if (!user) return false;
    try {
      const { error } = await supabase.rpc('update_channel_members' as any, {
        p_room_id: roomId,
        p_member_ids: memberIds,
      });
      if (error) throw error;
      await loadRooms();
      toast({ title: 'Members updated' });
      return true;
    } catch (error: any) {
      console.error('Error updating channel members:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to update members', variant: 'destructive' });
      return false;
    }
  }, [user, loadRooms]);

  return {
    rooms,
    activeRoom,
    messages,
    loading,
    sending,
    reconcilingReceipts,
    loadRooms,
    loadMessages,
    sendMessage,
    createOrFindDMRoom,
    selectRoom,
    markAsRead,
    clearRoom,
    deleteRoom,
    createChannel,
    updateChannelMembers,
  };
};
