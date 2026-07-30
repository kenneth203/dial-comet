import { useEffect, useMemo, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { ChatMessage } from '@/hooks/useChat';
import { MessageItem } from './MessageItem';
import { useMessageReactions } from '@/hooks/useMessageReactions';


interface MessagesListProps {
  messages: ChatMessage[];
  loading: boolean;
  onReachBottom?: () => void;
}

export function MessagesList({ messages, loading, onReachBottom }: MessagesListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messageIds = useMemo(
    () => messages.filter(m => !String(m.id).startsWith('temp-')).map(m => m.id),
    [messages]
  );
  const { reactions, toggleReaction } = useMessageReactions(messageIds);

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
