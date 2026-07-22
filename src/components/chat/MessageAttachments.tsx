import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Download, ExternalLink, FileIcon, FileText, ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PdfPreview } from './PdfPreview';
import { OfficeFramePreview } from './OfficeFramePreview';
import { toast } from 'sonner';

export interface ChatAttachment {
  id: string;
  message_id: string;
  file_name: string;
  file_path: string;
  content_type: string | null;
  file_size: number | null;
}

interface Props {
  attachments: ChatAttachment[];
  align?: 'start' | 'end';
}

type PreviewKind = 'image' | 'pdf' | 'text' | 'office' | 'email' | 'video' | 'audio' | 'other';

const OFFICE_EXTS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pps', 'ppsx', 'odt', 'ods', 'odp'];
const EMAIL_EXTS = ['msg', 'eml'];

function getExt(name: string) {
  const m = /\.([^.]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function getKind(att: ChatAttachment): PreviewKind {
  const ct = (att.content_type || '').toLowerCase();
  const ext = getExt(att.file_name);
  if (ct.startsWith('image/')) return 'image';
  if (ct === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ct.startsWith('video/')) return 'video';
  if (ct.startsWith('audio/')) return 'audio';
  if (EMAIL_EXTS.includes(ext) || ct === 'message/rfc822' || ct === 'application/vnd.ms-outlook') return 'email';
  if (
    ct.startsWith('text/') ||
    ct.includes('json') ||
    ct.includes('xml') ||
    ['txt', 'md', 'csv', 'log', 'json', 'xml', 'yml', 'yaml', 'ts', 'tsx', 'js', 'jsx', 'css', 'html'].includes(ext)
  ) return 'text';
  if (OFFICE_EXTS.includes(ext)) return 'office';
  return 'other';
}

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TextPreview({ url }: { url: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setContent(null); setError(null);
    fetch(url, { referrerPolicy: 'no-referrer', credentials: 'omit' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load');
        const text = await r.text();
        if (!cancelled) setContent(text.slice(0, 500_000));
      })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load'); });
    return () => { cancelled = true; };
  }, [url]);
  if (error) return <div className="p-4 text-sm text-destructive">{error}</div>;
  if (content === null) return (
    <div className="h-[60vh] flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
  return (
    <pre className="max-h-[78vh] overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
      {content}
    </pre>
  );
}

export function MessageAttachments({ attachments, align = 'start' }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [openAtt, setOpenAtt] = useState<ChatAttachment | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const next: Record<string, string> = {};
      await Promise.all(
        attachments.map(async (att) => {
          const { data } = await supabase.storage
            .from('chat-attachments')
            .createSignedUrl(att.file_path, 60 * 60);
          if (data?.signedUrl) next[att.id] = data.signedUrl;
        })
      );
      if (!cancelled) setUrls(next);
    }
    if (attachments.length) load();
    return () => { cancelled = true; };
  }, [attachments]);

  const [dlState, setDlState] = useState<{ id?: string; status: 'idle' | 'progress' | 'done' | 'error'; pct: number }>({
    status: 'idle',
    pct: 0,
  });

  const download = async (att: ChatAttachment) => {
    setDlState({ id: att.id, status: 'progress', pct: 0 });
    const toastId = `dl-${att.id}`;
    toast.loading(`Downloading ${att.file_name}…`, { id: toastId });
    try {
      const { data: signed, error: signErr } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(att.file_path, 60);
      if (signErr || !signed?.signedUrl) throw new Error(signErr?.message || 'Could not get download URL');

      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', signed.signedUrl);
        xhr.responseType = 'blob';
        xhr.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setDlState({ id: att.id, status: 'progress', pct });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as Blob);
          else reject(new Error(`Download failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error during download'));
        xhr.send();
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDlState({ id: att.id, status: 'done', pct: 100 });
      toast.success(`Downloaded ${att.file_name}`, { id: toastId });
      setTimeout(() => {
        setDlState((s) => (s.id === att.id ? { status: 'idle', pct: 0 } : s));
      }, 2000);
    } catch (e: any) {
      setDlState({ id: att.id, status: 'error', pct: 0 });
      toast.error(`Download failed: ${e?.message || 'Unknown error'}`, { id: toastId });
    }
  };

  const openKind = useMemo(() => (openAtt ? getKind(openAtt) : 'other'), [openAtt]);
  const openUrl = openAtt ? urls[openAtt.id] : undefined;
  const officeViewer = openUrl
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(openUrl)}`
    : undefined;

  if (!attachments.length) return null;

  return (
    <>
      <div className={cn('mt-2 flex flex-wrap gap-2', align === 'end' && 'justify-end')}>
        {attachments.map((att) => {
          const url = urls[att.id];
          const kind = getKind(att);
          if (kind === 'image') {
            return (
              <button
                key={att.id}
                type="button"
                onClick={() => setOpenAtt(att)}
                className="block overflow-hidden rounded-md border border-border bg-muted hover:opacity-90"
                title={att.file_name}
              >
                {url ? (
                  <img src={url} alt={att.file_name} className="h-32 w-32 object-cover" loading="lazy" />
                ) : (
                  <div className="h-32 w-32 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </button>
            );
          }
          const Icon = kind === 'pdf' || kind === 'text' || kind === 'office' || kind === 'email' ? FileText : FileIcon;
          return (
            <button
              key={att.id}
              type="button"
              onClick={() => setOpenAtt(att)}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-xs hover:bg-muted max-w-[260px]"
              title={att.file_name}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{att.file_name}</span>
              <span className="ml-auto text-muted-foreground">{formatSize(att.file_size)}</span>
            </button>
          );
        })}
      </div>

      <Dialog open={!!openAtt} onOpenChange={(o) => !o && setOpenAtt(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] max-h-[95vh] p-3 sm:p-4">
          {openAtt && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 pr-8">
                <div className="flex items-center gap-2 text-sm font-medium truncate">
                  {openKind === 'image' ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="truncate">{openAtt.file_name}</span>
                  {openAtt.file_size && (
                    <span className="text-xs text-muted-foreground">({formatSize(openAtt.file_size)})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {openUrl && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={openUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-1" /> Open
                      </a>
                    </Button>
                  )}
                  {(() => {
                    const active = dlState.id === openAtt.id ? dlState : { status: 'idle' as const, pct: 0 };
                    const isProgress = active.status === 'progress';
                    const isDone = active.status === 'done';
                    const isError = active.status === 'error';
                    return (
                      <Button
                        size="sm"
                        variant={isError ? 'destructive' : 'outline'}
                        onClick={() => download(openAtt)}
                        disabled={isProgress}
                        className="min-w-[150px] justify-center"
                      >
                        {isProgress ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Downloading {active.pct}%
                          </>
                        ) : isDone ? (
                          <>
                            <Check className="h-4 w-4 mr-1 text-green-600" /> Downloaded
                          </>
                        ) : isError ? (
                          <>
                            <Download className="h-4 w-4 mr-1" /> Retry download
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-1" /> Download
                          </>
                        )}
                      </Button>
                    );
                  })()}
                </div>
              </div>

              {dlState.id === openAtt.id && dlState.status === 'progress' && (
                <div className="h-1 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${dlState.pct}%` }}
                  />
                </div>
              )}

              {!openUrl ? (
                <div className="h-[60vh] flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : openKind === 'image' ? (
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center bg-muted/40 rounded-md overflow-hidden"
                  title="Open original in a new tab"
                >
                  <img
                    src={openUrl}
                    alt={openAtt.file_name}
                    className="max-h-[82vh] max-w-full w-auto h-auto object-contain"
                  />
                </a>
              ) : openKind === 'pdf' ? (
                <PdfPreview url={openUrl} fileName={openAtt.file_name} />
              ) : openKind === 'video' ? (
                <video src={openUrl} controls className="w-full max-h-[82vh] rounded-md bg-black" />
              ) : openKind === 'audio' ? (
                <audio src={openUrl} controls className="w-full" />
              ) : openKind === 'text' ? (
                <TextPreview url={openUrl} />
              ) : openKind === 'office' && officeViewer ? (
                <OfficeFramePreview src={officeViewer} title={openAtt.file_name} fallbackUrl={openUrl} />
              ) : openKind === 'email' ? (
                (() => {
                  const ext = getExt(openAtt.file_name);
                  if (ext === 'eml') {
                    return <TextPreview url={openUrl} />;
                  }
                  return (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <FileIcon className="h-10 w-10 text-muted-foreground" />
                      <p className="text-sm font-medium">Outlook message (.msg)</p>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        In-browser preview isn't supported for Outlook .msg files. Open the original in a new
                        tab (your browser will download it to open in Outlook), or ask the sender to forward
                        it as .eml or .pdf for inline preview.
                      </p>
                      {openUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                          onClick={() => toast.message('Opening .msg in a new tab', { description: 'It will download so Outlook can open it.' })}
                        >
                          <a href={openUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" /> Open in new tab
                          </a>
                        </Button>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <FileIcon className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Preview isn't available for this file type. Use Open or Download.
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Attachments are deleted after 30 days.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
