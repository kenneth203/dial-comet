import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChatMessage } from '@/hooks/useChat';
import { formatDistanceToNow, format } from 'date-fns';
import { enGB } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Check, CheckCheck, Trash2, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

import { MessageReactions } from './MessageReactions';
import { MessageAttachments } from './MessageAttachments';
import { Reaction } from '@/hooks/useMessageReactions';
import { getNameInitials } from '@/lib/nameUtils';

interface MessageItemProps {
  message: ChatMessage;
  showSender: boolean;
  reactions?: Reaction[];
  onToggleReaction?: (messageId: string, emoji: string) => void;
}


export function MessageItem({ message, showSender, reactions = [], onToggleReaction }: MessageItemProps) {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const isOwnMessage = message.sender_id === user?.id;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    const toastId = toast.loading('Deleting message...', {
      description: 'Please wait while the message is removed for everyone.',
    });
    const { error } = await supabase.rpc('delete_chat_message' as never, { _message_id: message.id } as never);
    setDeleting(false);
    if (error) {
      toast.error('Failed to delete message', {
        id: toastId,
        description: error.message,
        duration: 10000,
        action: {
          label: 'Retry',
          onClick: () => void handleDelete(),
        },
      });
      return;
    }
    toast.success('Message deleted', {
      id: toastId,
      description: 'The message has been removed for everyone.',
    });
    setConfirmDelete(false);
  };

  const [ownProfileName, setOwnProfileName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (isOwnMessage && !message.sender?.name && user?.id) {
      supabase.rpc('get_user_display_name' as never, { target_user_id: user.id } as never)
        .then(({ data }) => { if (!cancelled && data) setOwnProfileName(data as string); });
    }
    return () => { cancelled = true; };
  }, [isOwnMessage, message.sender?.name, user?.id]);

  const senderName =
    message.sender?.name ||
    (isOwnMessage
      ? ownProfileName ||
        (user?.user_metadata?.full_name as string) ||
        (user?.user_metadata?.name as string) ||
        'You'
      : 'User');

  const initials = getNameInitials(senderName);


  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return formatDistanceToNow(date, { addSuffix: true });
    }
  };

  const reads = message.reads ?? [];
  const deliveries = message.deliveries ?? [];
  const isRead = isOwnMessage && reads.length > 0;
  const isDelivered = isOwnMessage && !isRead && deliveries.length > 0;
  const status: 'read' | 'delivered' | 'sent' = isRead ? 'read' : isDelivered ? 'delivered' : 'sent';

  return (
    <div className={cn(
      "group flex gap-3",
      isOwnMessage && "flex-row-reverse",
      !showSender && "mt-1"
    )}>

      {showSender && (
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn(
        "flex-1 max-w-[85%] sm:max-w-[70%]",
        !showSender && (isOwnMessage ? "mr-11" : "ml-11")
      )}>
        {showSender && (
          <div className={cn(
            "flex items-baseline gap-2 mb-1",
            isOwnMessage && "flex-row-reverse"
          )}>
            <span className="font-medium text-sm">
              {senderName}{isOwnMessage ? ' (You)' : ''}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatTime(message.created_at)}
            </span>
          </div>
        )}

        <div className={cn("flex items-center gap-1.5", isOwnMessage && "flex-row-reverse")}>
        <div className={cn(
          "rounded-lg px-3 py-2 text-sm",
          isOwnMessage
            ? "bg-primary text-primary-foreground ml-auto"
            : "bg-muted"
        )}>
          <p className="whitespace-pre-wrap break-words">
            {message.content}
          </p>
          {message.attachments && message.attachments.length > 0 && (
            <MessageAttachments attachments={message.attachments} align={isOwnMessage ? 'end' : 'start'} />
          )}
          {isOwnMessage && (
            <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-primary-foreground/70">
              <span>{format(new Date(message.created_at), 'HH:mm', { locale: enGB })}</span>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "inline-flex items-center",
                        status === 'read' && "text-sky-300",
                        status === 'delivered' && "text-primary-foreground/80",
                        status === 'sent' && "text-primary-foreground/50"
                      )}
                      aria-label={status === 'read' ? 'Read' : status === 'delivered' ? 'Delivered' : 'Sent'}
                    >
                      {status === 'sent' ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCheck className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {status === 'read' ? (
                      <div className="space-y-0.5">
                        <div className="font-medium">Read</div>
                        {reads.slice(0, 5).map((r) => (
                          <div key={r.user_id} className="text-muted-foreground">
                            {r.reader_name || 'User'} · {format(new Date(r.read_at), 'dd/MM/yyyy HH:mm', { locale: enGB })}
                          </div>
                        ))}
                        {reads.length > 5 && (
                          <div className="text-muted-foreground">+{reads.length - 5} more</div>
                        )}
                      </div>
                    ) : status === 'delivered' ? (
                      <div className="space-y-0.5">
                        <div className="font-medium">Delivered</div>
                        {deliveries.slice(0, 5).map((d) => (
                          <div key={d.user_id} className="text-muted-foreground">
                            {d.recipient_name || 'User'} · {format(new Date(d.delivered_at), 'dd/MM/yyyy HH:mm', { locale: enGB })}
                          </div>
                        ))}
                        {deliveries.length > 5 && (
                          <div className="text-muted-foreground">+{deliveries.length - 5} more</div>
                        )}
                      </div>
                    ) : (
                      <span>Sent · not yet delivered</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
          {isSuperAdmin && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-70 hover:opacity-100 transition-opacity"
              title="Delete message (Super-Admin)"
              aria-label="Delete message"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {onToggleReaction && (
          <MessageReactions
            messageId={message.id}
            reactions={reactions}
            onToggle={onToggleReaction}
            align={isOwnMessage ? 'end' : 'start'}
          />
        )}
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>This will permanently delete the message below for <strong>everyone</strong> in this chat. This cannot be undone.</p>
              <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-foreground/90">
                <p className="line-clamp-3 whitespace-pre-wrap break-words font-medium italic">
                  “{message.content.trim() || 'No message content'}”
                </p>
              </div>
              {message.attachments && message.attachments.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {message.attachments.length} attachment{message.attachments.length > 1 ? 's' : ''} will also be removed.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
            >
              {deleting ? (<><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Deleting…</>) : 'Delete for everyone'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}
