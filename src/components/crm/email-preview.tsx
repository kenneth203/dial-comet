import * as React from "react";
import DOMPurify from "dompurify";

/**
 * Mirror of the server-side `sanitizeEmailHtml` in
 * `supabase/functions/_shared/transactional-email-templates/lead-introduction.tsx`.
 * Uses DOMPurify (browser HTML parser) so attribute-boundary bypasses like
 * `<img/onerror=...>` are correctly stripped.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return "";

  // First, convert Quill bullet-style <ol> wrappers to <ul> before sanitisation
  // (DOMPurify will strip the data-list attribute we use to detect bullets).
  const preprocessed = html.replace(
    /<ol([^>]*)>([\s\S]*?)<\/ol>/gi,
    (_m, attrs, inner) => {
      const isBullet = /<li[^>]*data-list\s*=\s*"bullet"/i.test(inner);
      const cleaned = inner.replace(/\sdata-list\s*=\s*"[^"]*"/gi, "");
      return isBullet
        ? `<ul${attrs}>${cleaned}</ul>`
        : `<ol${attrs}>${cleaned}</ol>`;
    },
  );

  return DOMPurify.sanitize(preprocessed, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "a", "span", "div",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "code", "pre",
      "img", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    ],
    ALLOWED_ATTR: [
      "class", "style", "href", "target", "rel",
      "src", "alt", "width", "height",
      "colspan", "rowspan", "align", "valign",
    ],
    FORBID_TAGS: [
      "script", "style", "iframe", "object", "embed", "form",
      "svg", "math", "link", "meta", "base",
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    KEEP_CONTENT: true,
    SANITIZE_DOM: true,
  });
}

export function looksLikeHtml(input: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(input);
}

/**
 * Inline CSS that matches the rendered email's typography exactly:
 * - same font family / size / colour / line-height as `text` + `htmlBodyWrap`
 * - paragraphs spaced `0 0 15px` (same `Text` margin)
 * - links use the brand navy underlined (`linkStyle`)
 * - bullet / numbered lists render with proper markers and indentation
 *   (Tailwind Preflight zeroes these out; the preview lives outside `prose`).
 */
const EMAIL_PREVIEW_CSS = `
.email-preview-body {
  font-family: 'Segoe UI', Arial, sans-serif;
  font-size: 14px;
  color: #55575d;
  line-height: 1.6;
}
.email-preview-body p {
  margin: 0 0 15px;
}
.email-preview-body p:last-child { margin-bottom: 0; }
.email-preview-body a {
  color: #1c477a;
  text-decoration: underline;
}
.email-preview-body strong, .email-preview-body b { font-weight: 600; }
.email-preview-body em, .email-preview-body i { font-style: italic; }
.email-preview-body u { text-decoration: underline; }
.email-preview-body s { text-decoration: line-through; }
.email-preview-body ul,
.email-preview-body ol {
  margin: 0 0 15px;
  padding-left: 24px;
}
.email-preview-body ul { list-style: disc; }
.email-preview-body ol { list-style: decimal; }
.email-preview-body li { margin: 0 0 4px; }
.email-preview-body h1,
.email-preview-body h2,
.email-preview-body h3,
.email-preview-body h4,
.email-preview-body h5,
.email-preview-body h6 {
  color: #1c477a;
  font-weight: 600;
  margin: 0 0 12px;
  line-height: 1.3;
}
.email-preview-body h1 { font-size: 22px; }
.email-preview-body h2 { font-size: 19px; }
.email-preview-body h3 { font-size: 17px; }
.email-preview-body h4 { font-size: 15px; }
.email-preview-body h5,
.email-preview-body h6 { font-size: 14px; }
.email-preview-body blockquote {
  margin: 0 0 15px;
  padding: 8px 14px;
  border-left: 3px solid #1c477a;
  background: #f5f7fa;
  color: #1c477a;
  font-style: italic;
}
.email-preview-body img {
  max-width: 100%;
  height: auto;
}
.email-preview-body .ql-align-center { text-align: center; }
.email-preview-body .ql-align-right  { text-align: right; }
.email-preview-body .ql-align-justify{ text-align: justify; }
.email-preview-body .ql-indent-1 { padding-left: 3em; }
.email-preview-body .ql-indent-2 { padding-left: 6em; }
.email-preview-body .ql-indent-3 { padding-left: 9em; }
.email-preview-body .ql-indent-4 { padding-left: 12em; }
.email-preview-body .ql-indent-5 { padding-left: 15em; }
.email-preview-body .ql-indent-6 { padding-left: 18em; }
.email-preview-body .ql-indent-7 { padding-left: 21em; }
.email-preview-body .ql-indent-8 { padding-left: 24em; }
.email-preview-body .nb-button {
  display: inline-block;
  padding: 10px 24px;
  background: linear-gradient(135deg, #b73235, #1c477a);
  color: #ffffff !important;
  font-weight: 600;
  font-size: 14px;
  border-radius: 8px;
  text-decoration: none !important;
  box-shadow: 0 4px 14px -4px rgba(183, 50, 53, 0.4);
}
`;

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-email-preview", "true");
  style.textContent = EMAIL_PREVIEW_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

interface EmailHtmlPreviewProps {
  html: string;
  className?: string;
}

/**
 * Render rich-text body HTML so it visually matches the sent email
 * (typography, list markers, link colours, blockquote, alignment, indent).
 */
export function EmailHtmlPreview({ html, className }: EmailHtmlPreviewProps) {
  React.useEffect(() => {
    ensureStyles();
  }, []);
  const safe = React.useMemo(() => sanitizeEmailHtml(html ?? ""), [html]);
  return (
    <div
      className={`email-preview-body ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
