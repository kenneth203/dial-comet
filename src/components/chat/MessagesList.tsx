import { useEffect, useMemo, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { ChatMessage } from '@/hooks/useChat';
import { MessageItem } from './MessageItem';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useMessageReactions } from '@/hooks/useMessageReactions';


interface MessagesListProps {
  messages: ChatMessage[];
  loading: boolean;
  onReachBottom?: () => void;
}

export function MessagesList({ messages, loading, onReachBottom }: MessagesListProps) {
  const { user } = useAuth();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const messageIds = useMemo(
    () => messages.filter(m => !String(m.id).startsWith('temp-')).map(m => m.id),
    [messages]
  );
  const { reactions, toggleReaction } = useMessageReactions(messageIds);


  // Track which messages we've already marked as read locally to avoid duplicate inserts
  const markedRef = useRef<Set<string>>(new Set());
  // Pending IDs to flush in a batch
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Sentinel-based "reached bottom" callback (kept as a safety net)
  useEffect(() => {
    const el = messagesEndRef.current;
    if (!el || !onReachBottom) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onReachBottom();
        }
      },
      { root: null, threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onReachBottom, messages.length]);

  // Per-message read receipts: observe each message and mark as read when it scrolls into view
  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    const flush = async () => {
      flushTimerRef.current = null;
      if (pendingRef.current.size === 0) return;
      const ids = Array.from(pendingRef.current);
      pendingRef.current.clear();
      const rows = ids.map((message_id) => ({ message_id, user_id: userId }));
      try {
        await (supabase.from('chat_message_reads') as any).upsert(rows, {
          onConflict: 'message_id,user_id',
          ignoreDuplicates: true,
        });
      } catch (err) {
        // Roll back so we retry next time those messages are observed
        for (const id of ids) markedRef.current.delete(id);
        console.error('Failed to record message read receipts:', err);
      }
    };

    const scheduleFlush = () => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(flush, 400);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const messageId = el.dataset.messageId;
          const senderId = el.dataset.senderId;
          if (!messageId || !senderId) continue;
          if (senderId === userId) continue; // don't mark own messages
          if (markedRef.current.has(messageId)) continue;
          markedRef.current.add(messageId);
          pendingRef.current.add(messageId);
          scheduleFlush();
        }
      },
      { root: null, threshold: 0.6 }
    );

    for (const el of messageRefs.current.values()) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      // Flush any remaining IDs synchronously-ish
      if (pendingRef.current.size > 0) {
        const ids = Array.from(pendingRef.current);
        pendingRef.current.clear();
        const rows = ids.map((message_id) => ({ message_id, user_id: userId }));
        void (supabase.from('chat_message_reads') as any).upsert(rows, {
          onConflict: 'message_id,user_id',
          ignoreDuplicates: true,
        });
      }
    };
  }, [user, messages.length]);

  const setMessageRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      messageRefs.current.set(id, el);
    } else {
      messageRefs.current.delete(id);
    }
  };

  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center">
        <div>
          <p className="text-muted-foreground mb-2">No messages yet</p>
          <p className="text-sm text-muted-foreground">
            Be the first to send a message!
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full" ref={scrollAreaRef}>
      <div className="p-4 space-y-4">
        {messages.map((message, index) => {
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const showSender = !prevMessage ||
            prevMessage.sender_id !== message.sender_id ||
            new Date(message.created_at).getTime() - new Date(prevMessage.created_at).getTime() > 300000; // 5 minutes

          return (
            <div
              key={message.id}
              ref={setMessageRef(message.id)}
              data-message-id={message.id}
              data-sender-id={message.sender_id}
            >
              <MessageItem
                message={message}
                showSender={showSender}
                reactions={reactions[message.id] || []}
                onToggleReaction={toggleReaction}
              />

            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
