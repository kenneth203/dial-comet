import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - worker as URL
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker;

interface Props {
  url: string;
  fileName?: string;
}

export function PdfPreview({ url }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    setLoading(true);
    setError(null);
    setPage(1);
    setLoadProgress(0);
    const loadTask = (pdfjsLib as any).getDocument({ url });
    loadTask.onProgress = (p: { loaded: number; total: number }) => {
      if (cancelled || !p?.total) return;
      setLoadProgress(Math.min(100, Math.round((p.loaded / p.total) * 100)));
    };
    timeoutId = window.setTimeout(() => {
      if (!cancelled && !docRef.current) {
        try { loadTask.destroy?.(); } catch {}
        setError('Taking too long to load this PDF. Check your connection and try again.');
        setLoading(false);
      }
    }, 30000);
    (async () => {
      try {
        const doc = await loadTask.promise;
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load PDF');
      } finally {
        if (!cancelled) {
          setLoading(false);
          if (timeoutId) window.clearTimeout(timeoutId);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      try { renderTaskRef.current?.cancel?.(); } catch {}
      try { docRef.current?.destroy?.(); } catch {}
      docRef.current = null;
    };
  }, [url, reloadKey]);

  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    let cancelled = false;
    let timeoutId: number | undefined;
    setRendering(true);
    timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        try { renderTaskRef.current?.cancel?.(); } catch {}
        setError('Rendering this page is taking too long. Try a lower zoom or download the file.');
        setRendering(false);
      }
    }, 20000);
    (async () => {
      try {
        const p = await doc.getPage(page);
        if (cancelled) return;
        const viewport = p.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
        canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`;
        try { renderTaskRef.current?.cancel?.(); } catch {}
        const task = p.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException' && !cancelled) {
          setError(e?.message || 'Failed to render page');
        }
      } finally {
        if (!cancelled) {
          setRendering(false);
          if (timeoutId) window.clearTimeout(timeoutId);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [page, scale, numPages]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <p className="text-sm text-destructive max-w-md">{error}</p>
        <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <span className="text-xs text-muted-foreground min-w-[90px] text-center">
          Page {page} of {numPages || '–'}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage((p) => Math.min(numPages, p + 1))}
          disabled={page >= numPages || loading}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="mx-2 h-5 w-px bg-border" />
        <Button size="sm" variant="outline" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
        <Button size="sm" variant="outline" onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)))}>
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>
      <div className="relative w-full max-h-[78vh] overflow-auto rounded-md border border-border bg-muted/30 flex items-start justify-center p-3">
        {(loading || rendering) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              {loading
                ? loadProgress > 0
                  ? `Loading PDF… ${loadProgress}%`
                  : 'Loading PDF…'
                : `Rendering page ${page}…`}
            </p>
          </div>
        )}
        <canvas ref={canvasRef} className="shadow-sm bg-white" />
      </div>
    </div>
  );
}
