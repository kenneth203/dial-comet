import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Send, Paperclip, X, FileIcon, RotateCcw, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { validateFile } from '@/lib/uploadValidation';
import {
  uploadChatAttachment,
  removeChatAttachment,
  type UploadedAttachment,
} from '@/lib/chatUpload';
import { cn } from '@/lib/utils';

type UploadStatus = 'queued' | 'uploading' | 'success' | 'failed' | 'cancelled';

interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  uploaded?: UploadedAttachment;
  previewUrl?: string;
  controller?: AbortController;
}

interface MessageComposerProps {
  roomId: string;
  onSend: (content: string, files?: File[] | { preUploaded: UploadedAttachment[] }) => void;
  disabled?: boolean;
}

const MAX_FILES = 5;

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MessageComposer({ roomId, onSend, disabled = false }: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<UploadItem[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<UploadItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      itemsRef.current.forEach(it => {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        it.controller?.abort();
      });
    };
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const startUpload = useCallback(async (id: string, file: File) => {
    const controller = new AbortController();
    updateItem(id, { status: 'uploading', progress: 0, error: undefined, controller });
    try {
      const uploaded = await uploadChatAttachment(roomId, file, {
        signal: controller.signal,
        onProgress: (pct) => updateItem(id, { progress: pct }),
      });
      updateItem(id, { status: 'success', progress: 100, uploaded, controller: undefined });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        updateItem(id, { status: 'cancelled', error: 'Cancelled', controller: undefined });
      } else {
        updateItem(id, {
          status: 'failed',
          error: err?.message || 'Upload failed',
          controller: undefined,
        });
      }
    }
  }, [roomId, updateItem]);

  const addFiles = useCallback((incoming: File[]) => {
    const room = MAX_FILES - itemsRef.current.length;
    if (room <= 0) {
      toast({ title: 'Attachment limit', description: `Up to ${MAX_FILES} files per message.`, variant: 'destructive' });
      return;
    }
    const next: UploadItem[] = [];
    for (const f of incoming.slice(0, room)) {
      const r = validateFile(f);
      if (!r.ok) {
        toast({ title: 'File rejected', description: r.error, variant: 'destructive' });
        continue;
      }
      const id = makeId();
      next.push({
        id,
        file: f,
        status: 'queued',
        progress: 0,
        previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      });
    }
    if (!next.length) return;
    setItems(prev => [...prev, ...next]);
    // Kick off uploads
    next.forEach(it => startUpload(it.id, it.file));
  }, [startUpload]);

  const removeItem = useCallback((id: string) => {
    const item = itemsRef.current.find(i => i.id === id);
    if (!item) return;
    item.controller?.abort();
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    if (item.status === 'success' && item.uploaded) {
      // Clean up the orphaned upload from storage
      removeChatAttachment(item.uploaded.path);
    }
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const retryItem = useCallback((id: string) => {
    const item = itemsRef.current.find(i => i.id === id);
    if (!item) return;
    startUpload(id, item.file);
  }, [startUpload]);

  const handleSend = () => {
    if (disabled) return;
    const hasText = message.trim().length > 0;
    const succeeded = items.filter(i => i.status === 'success' && i.uploaded);
    const uploading = items.some(i => i.status === 'uploading' || i.status === 'queued');
    if (uploading) {
      toast({ title: 'Please wait', description: 'Attachments are still uploading.' });
      return;
    }
    const failed = items.filter(i => i.status === 'failed');
    if (failed.length) {
      toast({
        title: 'Attachments failed',
        description: 'Retry or remove failed uploads before sending.',
        variant: 'destructive',
      });
      return;
    }
    if (!hasText && succeeded.length === 0) return;

    if (succeeded.length > 0) {
      onSend(message.trim(), { preUploaded: succeeded.map(s => s.uploaded!) });
    } else {
      onSend(message.trim());
    }

    // Clear local state but DON'T remove from storage — they belong to the sent message now.
    items.forEach(i => {
      if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
    });
    setMessage('');
    setItems([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData?.files;
    if (pasted && pasted.length > 0) {
      e.preventDefault();
      addFiles(Array.from(pasted));
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const target = e.target;
    setMessage(target.value);
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 120) + 'px';
  };

  const uploading = items.some(i => i.status === 'uploading' || i.status === 'queued');
  const hasFailed = items.some(i => i.status === 'failed');
  const successCount = items.filter(i => i.status === 'success').length;
  const sendDisabled =
    disabled ||
    uploading ||
    hasFailed ||
    (!message.trim() && successCount === 0);

  return (
    <div className="flex flex-col gap-2 p-4">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map(it => {
            const isImg = !!it.previewUrl;
            const statusColor =
              it.status === 'failed' ? 'border-destructive' :
              it.status === 'success' ? 'border-emerald-500/60' :
              'border-border';
            return (
              <div
                key={it.id}
                className={cn(
                  'relative rounded-md border bg-muted px-2 py-1.5 flex items-center gap-2 w-[230px]',
                  statusColor,
                )}
              >
                {isImg ? (
                  <img src={it.previewUrl} alt={it.file.name} className="h-10 w-10 object-cover rounded shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded bg-background flex items-center justify-center shrink-0">
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs truncate flex-1" title={it.file.name}>{it.file.name}</span>
                    {it.status === 'uploading' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
                    {it.status === 'success' && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                    {it.status === 'failed' && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
                  </div>
                  {(it.status === 'uploading' || it.status === 'queued') && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <Progress value={it.progress} className="h-1 flex-1" />
                      <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">{it.progress}%</span>
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        className="text-[10px] inline-flex items-center gap-0.5 text-destructive hover:underline shrink-0"
                        aria-label={`Cancel upload of ${it.file.name}`}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {it.status === 'cancelled' && (
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground flex-1">Cancelled</span>
                      <button
                        type="button"
                        onClick={() => retryItem(it.id)}
                        className="text-[10px] inline-flex items-center gap-0.5 text-primary hover:underline shrink-0"
                      >
                        <RotateCcw className="h-2.5 w-2.5" /> Retry
                      </button>
                    </div>
                  )}
                  {it.status === 'failed' && (
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className="text-[10px] text-destructive truncate flex-1" title={it.error}>{it.error}</span>
                      <button
                        type="button"
                        onClick={() => retryItem(it.id)}
                        className="text-[10px] inline-flex items-center gap-0.5 text-primary hover:underline shrink-0"
                      >
                        <RotateCcw className="h-2.5 w-2.5" /> Retry
                      </button>
                    </div>
                  )}
                  {it.status === 'success' && (
                    <div className="text-[10px] text-muted-foreground">Ready to send</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  className="ml-1 rounded-full hover:bg-background p-0.5 shrink-0"
                  aria-label={it.status === 'uploading' || it.status === 'queued' ? 'Cancel and remove' : 'Remove attachment'}
                  title={it.status === 'uploading' || it.status === 'queued' ? 'Cancel upload' : 'Remove'}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-end gap-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const f = e.target.files;
            if (f) addFiles(Array.from(f));
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-10 p-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || items.length >= MAX_FILES}
          aria-label="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type a message... (Shift+Enter for new line, paste to attach)"
            disabled={disabled}
            className="min-h-[2.5rem] max-h-[120px] resize-none"
            style={{ height: 'auto' }}
          />
        </div>
        <Button
          onClick={handleSend}
          disabled={sendDisabled}
          size="sm"
          className="h-10 w-10 p-0"
          title={uploading ? 'Uploading…' : hasFailed ? 'Retry or remove failed uploads' : 'Send'}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
