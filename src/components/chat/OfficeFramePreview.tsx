import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  src: string;
  title: string;
  fallbackUrl?: string;
  timeoutMs?: number;
}

export function OfficeFramePreview({ src, title, fallbackUrl, timeoutMs = 25000 }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setLoading(true);
    setError(null);
    timerRef.current = window.setTimeout(() => {
      const msg = "The document viewer is taking too long to load. It may be temporarily unavailable.";
      setError(msg);
      setLoading(false);
      toast.error('Document preview timed out', {
        description: 'Try Open in new tab or download the file.',
      });
    }, timeoutMs);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [src, reloadKey, timeoutMs]);

  const openInNewTab = () => {
    window.open(src, '_blank', 'noopener,noreferrer');
    toast.message('Opening document viewer in a new tab');
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <p className="text-sm text-destructive max-w-md">{error}</p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </Button>
          <Button size="sm" variant="default" onClick={openInNewTab}>
            <ExternalLink className="h-4 w-4 mr-1" /> Open viewer in new tab
          </Button>
          {fallbackUrl && (
            <Button size="sm" variant="outline" asChild>
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => toast.message('Opening original file in a new tab')}
              >
                <ExternalLink className="h-4 w-4 mr-1" /> Open original file
              </a>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={openInNewTab}>
          <ExternalLink className="h-4 w-4 mr-1" /> Open in new tab
        </Button>
      </div>
      <div className="relative w-full h-[78vh] rounded-md border border-border bg-white overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading document preview…</p>
          </div>
        )}
        <iframe
          key={reloadKey}
          src={src}
          title={title}
          className="w-full h-full"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
            setLoading(false);
          }}
          onError={() => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
            setError('Failed to load the document preview.');
            setLoading(false);
            toast.error('Document preview failed to load');
          }}
        />
      </div>
    </div>
  );
}
