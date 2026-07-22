import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sanitizeHtml } from "@/lib/sanitize";

interface ScriptPreviewProps {
  html: string;
  className?: string;
  maxHeight?: string;
  /** Debounce delay in ms before re-sanitizing/rendering. Defaults to 250ms. */
  debounceMs?: number;
  /** Top-level blocks per virtualised chunk. Defaults to 8. */
  chunkSize?: number;
  /** Chunks rendered synchronously on the first paint. Defaults to 3. */
  initialChunks?: number;
}

const SMALL_DOC_BLOCK_THRESHOLD = 24;

/** Split sanitized HTML into top-level block chunks for incremental rendering. */
function splitIntoChunks(html: string, chunkSize: number): string[] {
  if (typeof window === "undefined" || !html) return [html];
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    const nodes = Array.from(doc.body.childNodes);
    if (nodes.length <= SMALL_DOC_BLOCK_THRESHOLD) return [html];

    const chunks: string[] = [];
    for (let i = 0; i < nodes.length; i += chunkSize) {
      const slice = nodes.slice(i, i + chunkSize);
      const tmp = doc.createElement("div");
      slice.forEach((n) => tmp.appendChild(n.cloneNode(true)));
      chunks.push(tmp.innerHTML);
    }
    return chunks;
  } catch {
    return [html];
  }
}

/**
 * Renders sanitized script HTML using the exact same styling operators see
 * in the CustomerScriptModal. Use this for "what operators will see" previews.
 *
 * Performance:
 *   1. Sanitization is debounced so typing stays fluid.
 *   2. The sanitized output is memoised.
 *   3. Long scripts are split into top-level chunks. The first `initialChunks`
 *      render immediately; the rest are appended via requestIdleCallback so
 *      the main thread is never blocked.
 *   4. Each chunk uses `content-visibility: auto`, letting the browser skip
 *      layout and paint for off-screen sections (native virtualisation).
 */
export function ScriptPreview({
  html,
  className,
  maxHeight = "55vh",
  debounceMs = 250,
  chunkSize = 8,
  initialChunks = 3,
}: ScriptPreviewProps) {
  const [debouncedHtml, setDebouncedHtml] = useState(html);

  useEffect(() => {
    if (!html) {
      setDebouncedHtml("");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedHtml(html), debounceMs);
    return () => window.clearTimeout(timer);
  }, [html, debounceMs]);

  const sanitized = useMemo(() => sanitizeHtml(debouncedHtml), [debouncedHtml]);
  const chunks = useMemo(() => splitIntoChunks(sanitized, chunkSize), [sanitized, chunkSize]);

  // Progressive mount: render initialChunks immediately, then more as the
  // browser is idle. Resets whenever the chunk list identity changes.
  const [visibleCount, setVisibleCount] = useState(() => Math.min(chunks.length, initialChunks));
  const cancelRef = useRef<number | null>(null);

  useEffect(() => {
    setVisibleCount(Math.min(chunks.length, initialChunks));
  }, [chunks, initialChunks]);

  useEffect(() => {
    if (visibleCount >= chunks.length) return;

    const ric: (cb: () => void) => number =
      (window as any).requestIdleCallback?.bind(window) ??
      ((cb: () => void) => window.setTimeout(cb, 16));
    const cic: (id: number) => void =
      (window as any).cancelIdleCallback?.bind(window) ?? window.clearTimeout.bind(window);

    cancelRef.current = ric(() => {
      setVisibleCount((c) => Math.min(chunks.length, c + initialChunks));
    });

    return () => {
      if (cancelRef.current != null) cic(cancelRef.current);
    };
  }, [visibleCount, chunks.length, initialChunks]);

  if (!debouncedHtml || debouncedHtml === "<p><br></p>") {
    return (
      <div className="bg-muted/30 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
        <p className="text-muted-foreground">Nothing to preview yet.</p>
        <p className="text-xs text-muted-foreground mt-2">
          Start writing in the editor above to see how operators will view this script.
        </p>
      </div>
    );
  }

  const visibleChunks = chunks.slice(0, visibleCount);
  const isVirtualised = chunks.length > 1;

  return (
    <ScrollArea className={`w-full border rounded-lg ${className ?? ""}`} style={{ height: maxHeight }}>
      <div className="bg-background p-6">
        <style dangerouslySetInnerHTML={{
          __html: `
            .script-preview-content {
              font-family: ui-sans-serif, system-ui, sans-serif;
              line-height: 1.4;
            }
            .script-preview-chunk {
              content-visibility: auto;
              contain-intrinsic-size: auto 400px;
            }
            .script-preview-content h1,
            .script-preview-content h2,
            .script-preview-content h3,
            .script-preview-content h4,
            .script-preview-content h5,
            .script-preview-content h6 {
              margin-top: 0.75em;
              margin-bottom: 0.25em;
              font-weight: 600;
              color: hsl(var(--foreground));
            }
            .script-preview-content h1:first-child,
            .script-preview-content h2:first-child,
            .script-preview-content h3:first-child,
            .script-preview-content h4:first-child,
            .script-preview-content h5:first-child,
            .script-preview-content h6:first-child,
            .script-preview-content p:first-child {
              margin-top: 0;
            }
            .script-preview-content p {
              margin-bottom: 0.25em;
              color: hsl(var(--foreground));
            }
            .script-preview-content strong { font-weight: 600; }
            .script-preview-content ul {
              margin-bottom: 0.5em;
              padding-left: 1.5em;
              list-style-type: disc;
            }
            .script-preview-content ol {
              margin-bottom: 0.5em;
              padding-left: 1.5em;
              list-style-type: decimal;
            }
            .script-preview-content li { margin-bottom: 0.1em; display: list-item; }
            .script-preview-content li[data-list="bullet"] { list-style-type: disc; }
            .script-preview-content li[data-list="ordered"] { list-style-type: decimal; }
            .script-preview-content .ql-indent-1 { padding-left: 1.5em; }
            .script-preview-content .ql-indent-2 { padding-left: 3em; }
            .script-preview-content a {
              color: hsl(var(--primary));
              text-decoration: underline;
            }
            .script-preview-content table {
              width: 100%;
              border-collapse: collapse;
              margin: 0.75em 0;
              font-size: 0.95em;
              table-layout: auto;
            }
            .script-preview-content thead { background-color: hsl(var(--muted)); }
            .script-preview-content th,
            .script-preview-content td {
              border: 1px solid hsl(var(--border));
              padding: 0.5em 0.75em;
              text-align: left;
              vertical-align: top;
              color: hsl(var(--foreground));
            }
            .script-preview-content th {
              font-weight: 600;
              background-color: hsl(var(--muted));
            }
            .script-preview-content tbody tr:nth-child(even) {
              background-color: hsl(var(--muted) / 0.3);
            }
            .script-preview-content table p { margin: 0; }
            .script-preview-content img {
              max-width: 100%;
              height: auto;
            }
            .script-preview-content mark.script-uncertain {
              background-color: hsl(48 96% 82%);
              color: hsl(var(--foreground));
              padding: 0 0.15em;
              border-radius: 2px;
              box-shadow: inset 0 -1px 0 hsl(38 92% 55%);
            }
          `
        }} />
        <div className="prose prose-sm max-w-none script-preview-content">
          {isVirtualised ? (
            <>
              {visibleChunks.map((chunkHtml, i) => (
                <div
                  key={i}
                  className="script-preview-chunk"
                  dangerouslySetInnerHTML={{ __html: chunkHtml }}
                />
              ))}
              {visibleCount < chunks.length && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Rendering remaining sections… ({visibleCount}/{chunks.length})
                </div>
              )}
            </>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: sanitized }} />
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
