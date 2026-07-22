import { useState } from 'react';
import { Smile } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Reaction, REACTION_EMOJIS } from '@/hooks/useMessageReactions';

interface MessageReactionsProps {
  messageId: string;
  reactions: Reaction[];
  onToggle: (messageId: string, emoji: string) => void;
  align?: 'start' | 'end';
}

export function MessageReactions({ messageId, reactions, onToggle, align = 'start' }: MessageReactionsProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Group by emoji
  const groups = reactions.reduce<Record<string, Reaction[]>>((acc, r) => {
    (acc[r.emoji] ||= []).push(r);
    return acc;
  }, {});
  const grouped = Object.entries(groups);

  const handlePick = (emoji: string) => {
    onToggle(messageId, emoji);
    setOpen(false);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1 mt-1', align === 'end' && 'justify-end')}>
      {grouped.map(([emoji, list]) => {
        const mine = list.some(r => r.user_id === user?.id);
        const names = list.map(r => r.user_name || 'User').join(', ');
        return (
          <TooltipProvider key={emoji} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onToggle(messageId, emoji)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs leading-none transition-colors hover:bg-accent',
                    mine ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border bg-background text-foreground'
                  )}
                >
                  <span className="text-sm leading-none">{emoji}</span>
                  <span className="tabular-nums">{list.length}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{names}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add reaction"
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground',
              grouped.length === 0 && 'opacity-0 group-hover:opacity-100 focus:opacity-100'
            )}
          >
            <Smile className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align={align} className="w-auto p-1.5">
          <div className="flex gap-1">
            {REACTION_EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => handlePick(emoji)}
                className="text-lg leading-none rounded-md p-1 transition-transform hover:scale-125 hover:bg-accent"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
