/**
 * Helpers for importing customer scripts from various sources
 * (form submissions, .docx, .pdf, pasted text) and for building
 * a fixed-layout template that mirrors the TA Physiotherapy style.
 */
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — Vite worker import
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface CustomerContextForScript {
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  postcode?: string;
  contacts?: Array<{
    firstName?: string;
    lastName?: string;
    email?: string;
    telephone?: string;
    role?: string;
  }>;
  locations?: Array<{
    name?: string;
    google_maps_url?: string;
    notes?: string;
  }>;
}

const escapeHtml = (s: string): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/** Extract plain text (with structure) from a .docx file. */
export async function extractDocxText(file: File, opts: { signal?: AbortSignal } = {}): Promise<string> {
  throwIfAborted(opts.signal);
  const arrayBuffer = await file.arrayBuffer();
  throwIfAborted(opts.signal);
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result.value || '').trim();
}

/** Extract plain text from a PDF using pdfjs (embedded text only, no OCR). */
export async function extractPdfText(file: File, opts: { signal?: AbortSignal } = {}): Promise<string> {
  throwIfAborted(opts.signal);
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const chunks: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    throwIfAborted(opts.signal);
    const page = await pdf.getPage(i);
    const txt = await page.getTextContent();
    const pageText = (txt.items as any[])
      .map((it) => (typeof it.str === 'string' ? it.str : ''))
      .join(' ');
    chunks.push(pageText);
    await yieldToBrowser();
  }
  return chunks.join('\n\n').trim();
}

/* --------------------------------------------------------------------------
 * OCR — for scanned PDFs and images. Lazy-loads tesseract.js so the main
 * bundle stays small; only paid when the user actually imports a scan.
 * Tesseract runs OCR in its own web-worker; pdfjs parses in its own worker.
 * The only main-thread work is canvas rasterization, which we chunk with
 * `yieldToBrowser()` so the UI stays responsive.
 * ------------------------------------------------------------------------ */

export type OcrMode = 'auto' | 'force' | 'off';

export interface ExtractResult {
  text: string;
  ocrUsed: boolean;
  /** Average tesseract word confidence (0-100). Undefined when OCR wasn't used. */
  avgConfidence?: number;
  /** Distinct low-confidence tokens (confidence < 70) — flag for operator review. */
  uncertainTerms?: string[];
  /** Number of pages processed (PDFs) or 1 for images / plain docx. */
  pagesProcessed?: number;
}

export interface OcrProgress {
  stage: 'reading' | 'init' | 'rasterizing' | 'recognizing' | 'done';
  page?: number;
  totalPages?: number;
  /** 0..1 progress within the current stage. */
  progress?: number;
  /** OCR confidence 0..100 for the current page, when available. */
  confidence?: number;
}

export class ImportAbortError extends Error {
  constructor() {
    super('Import cancelled');
    this.name = 'ImportAbortError';
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new ImportAbortError();
}

/** Yield a macrotask so the browser can paint / handle events between heavy steps. */
function yieldToBrowser(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

const OCR_MIN_TEXT_CHARS = 80;
const LOW_CONF_THRESHOLD = 70;
const NORMALISE_TOKEN = (t: string) => t.replace(/[^\p{L}\p{N}£$@.\-']+/gu, '').trim();

async function rasterizePage(page: any, scale = 2): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

async function ocrCanvases(
  canvases: HTMLCanvasElement[],
  onProgress?: (p: OcrProgress) => void,
  signal?: AbortSignal,
): Promise<{ text: string; avgConfidence: number; uncertainTerms: string[] }> {
  onProgress?.({ stage: 'init', progress: 0 });
  throwIfAborted(signal);
  const { createWorker } = await import('tesseract.js');
  const worker: any = await createWorker('eng');
  const chunks: string[] = [];
  const uncertain = new Set<string>();
  let totalConf = 0;
  let totalWords = 0;
  try {
    for (let i = 0; i < canvases.length; i++) {
      throwIfAborted(signal);
      onProgress?.({
        stage: 'recognizing',
        page: i + 1,
        totalPages: canvases.length,
        progress: i / canvases.length,
      });
      const { data } = await worker.recognize(canvases[i]);
      chunks.push(String(data?.text || ''));
      const words: any[] = Array.isArray(data?.words) ? data.words : [];
      for (const w of words) {
        const t = NORMALISE_TOKEN(String(w?.text || ''));
        if (!t || t.length < 2) continue;
        const c = Number(w?.confidence ?? 0);
        totalConf += c;
        totalWords += 1;
        if (c < LOW_CONF_THRESHOLD) uncertain.add(t);
      }
      await yieldToBrowser();
    }
  } finally {
    try { await worker.terminate(); } catch { /* ignore */ }
  }
  onProgress?.({ stage: 'done', progress: 1 });
  return {
    text: chunks.join('\n\n').trim(),
    avgConfidence: totalWords ? totalConf / totalWords : 0,
    uncertainTerms: Array.from(uncertain).slice(0, 200),
  };
}

/**
 * Smart PDF extraction with optional OCR fallback for scanned documents.
 *  - `auto` (default): try embedded text first; if it's too short, rasterize pages and OCR.
 *  - `force`: always OCR (useful when embedded text is garbled).
 *  - `off`: never OCR (embedded text only).
 */
export async function extractPdfSmart(
  file: File,
  opts: { mode?: OcrMode; onProgress?: (p: OcrProgress) => void; signal?: AbortSignal } = {},
): Promise<ExtractResult> {
  const mode = opts.mode ?? 'auto';
  opts.onProgress?.({ stage: 'reading', progress: 0 });
  throwIfAborted(opts.signal);
  const arrayBuffer = await file.arrayBuffer();
  throwIfAborted(opts.signal);
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Embedded text pass
  let embedded = '';
  if (mode !== 'force') {
    const chunks: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      throwIfAborted(opts.signal);
      const page = await pdf.getPage(i);
      const txt = await page.getTextContent();
      chunks.push((txt.items as any[]).map((it) => (typeof it.str === 'string' ? it.str : '')).join(' '));
      await yieldToBrowser();
    }
    embedded = chunks.join('\n\n').trim();
    if (mode === 'off' || embedded.length >= OCR_MIN_TEXT_CHARS) {
      opts.onProgress?.({ stage: 'done', progress: 1 });
      return { text: embedded, ocrUsed: false, pagesProcessed: pdf.numPages };
    }
  }

  // OCR pass
  opts.onProgress?.({ stage: 'rasterizing', progress: 0, totalPages: pdf.numPages });
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    throwIfAborted(opts.signal);
    opts.onProgress?.({
      stage: 'rasterizing',
      page: i,
      totalPages: pdf.numPages,
      progress: (i - 1) / pdf.numPages,
    });
    const page = await pdf.getPage(i);
    canvases.push(await rasterizePage(page, 2));
    await yieldToBrowser();
  }
  const ocr = await ocrCanvases(canvases, opts.onProgress, opts.signal);
  return {
    text: ocr.text || embedded,
    ocrUsed: true,
    avgConfidence: ocr.avgConfidence,
    uncertainTerms: ocr.uncertainTerms,
    pagesProcessed: pdf.numPages,
  };
}

/** Extract text from an image file (jpg/png/webp) via OCR. */
export async function extractImageSmart(
  file: File,
  opts: { onProgress?: (p: OcrProgress) => void; signal?: AbortSignal } = {},
): Promise<ExtractResult> {
  opts.onProgress?.({ stage: 'reading', progress: 0 });
  throwIfAborted(opts.signal);
  const bitmap = await createImageBitmap(file);
  throwIfAborted(opts.signal);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  const ocr = await ocrCanvases([canvas], opts.onProgress, opts.signal);
  return {
    text: ocr.text,
    ocrUsed: true,
    avgConfidence: ocr.avgConfidence,
    uncertainTerms: ocr.uncertainTerms,
    pagesProcessed: 1,
  };
}


/**
 * Wrap whole-word occurrences of low-confidence OCR tokens in <mark> tags
 * inside generated script HTML, so operators can visually verify them.
 * Runs on text nodes only — never touches tag names or attribute values.
 */
export function highlightUncertainInHtml(html: string, terms: string[] | undefined): string {
  if (!html || !terms || terms.length === 0) return html;
  const cleaned = Array.from(
    new Set(
      terms
        .map((t) => (t || '').trim())
        .filter((t) => t.length >= 2 && t.length <= 40),
    ),
  );
  if (cleaned.length === 0) return html;
  const escaped = cleaned
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  const rx = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'giu');

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  let n: Node | null = walker.nextNode();
  while (n) {
    targets.push(n as Text);
    n = walker.nextNode();
  }
  for (const node of targets) {
    const value = node.nodeValue || '';
    if (!rx.test(value)) { rx.lastIndex = 0; continue; }
    rx.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = rx.exec(value)) !== null) {
      if (match.index > last) frag.appendChild(doc.createTextNode(value.slice(last, match.index)));
      const mark = doc.createElement('mark');
      mark.className = 'script-uncertain';
      mark.title = 'Low OCR confidence — please verify';
      mark.textContent = match[0];
      frag.appendChild(mark);
      last = match.index + match[0].length;
    }
    if (last < value.length) frag.appendChild(doc.createTextNode(value.slice(last)));
    node.parentNode?.replaceChild(frag, node);
  }
  return doc.body.innerHTML;
}

/** Turn a form-submission responses map (id -> value) into a labelled Q/A text block. */
export function formResponsesToText(
  responses: Record<string, any>,
  labelResolver: (id: string) => string,
): string {
  const lines: string[] = [];
  for (const [id, value] of Object.entries(responses || {})) {
    if (value === null || value === undefined || value === '') continue;
    const label = labelResolver(id) || id;
    let v: string;
    if (Array.isArray(value)) v = value.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
    else if (typeof value === 'object') v = JSON.stringify(value);
    else if (typeof value === 'boolean') v = value ? 'Yes' : 'No';
    else v = String(value);
    lines.push(`Q: ${label}\nA: ${v}`);
  }
  return lines.join('\n\n');
}

/**
 * Build a fixed TA Physio-style HTML script directly from the source text +
 * customer context — no AI needed. Emits headings, a quick-reference table,
 * and a Q&A section for anything that looks like Q: / A: pairs.
 */
export function buildTemplateScript(
  content: string,
  customer: CustomerContextForScript,
): string {
  const parts: string[] = [];
  const name = customer.name || 'the business';

  // Greeting
  parts.push(
    `<h2>Greeting</h2><p>Thank you for calling <strong>${escapeHtml(name)}</strong>, this is [operator name] speaking — how can I help you today?</p>`,
  );

  // Quick reference table from customer context
  const rows: Array<[string, string]> = [];
  if (customer.phone) rows.push(['Main phone', customer.phone]);
  if (customer.email) rows.push(['Email', customer.email]);
  if (customer.website) rows.push(['Website', customer.website]);
  const address = [customer.address_line1, customer.address_line2, customer.city, customer.postcode]
    .filter(Boolean)
    .join(', ');
  if (address) rows.push(['Address', address]);

  if (customer.contacts && customer.contacts.length > 0) {
    const contactLines = customer.contacts
      .map((c) => {
        const nm = [c.firstName, c.lastName].filter(Boolean).join(' ');
        const bits = [nm || 'Contact', c.role, c.telephone, c.email].filter(Boolean).join(' · ');
        return bits;
      })
      .filter(Boolean);
    if (contactLines.length) rows.push(['Key contacts', contactLines.join('<br>')]);
  }

  if (customer.locations && customer.locations.length > 0) {
    const locLines = customer.locations
      .map((l) => {
        const nm = escapeHtml(l.name || 'Location');
        const url = l.google_maps_url;
        const link = url
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open in maps</a>`
          : '';
        const notes = l.notes ? ` — ${escapeHtml(l.notes)}` : '';
        return `${nm}${link ? ` (${link})` : ''}${notes}`;
      })
      .filter(Boolean);
    if (locLines.length) rows.push(['Locations', locLines.join('<br>')]);
  }

  if (rows.length > 0) {
    parts.push('<h2>Quick reference</h2>');
    parts.push('<table><thead><tr><th>Item</th><th>Details</th></tr></thead><tbody>');
    for (const [k, v] of rows) {
      // v may already contain safe HTML we generated (links, <br>); do not escape twice for those.
      const alreadyHtml = /<a |<br>/.test(v);
      parts.push(`<tr><td><strong>${escapeHtml(k)}</strong></td><td>${alreadyHtml ? v : escapeHtml(v)}</td></tr>`);
    }
    parts.push('</tbody></table>');
  }

  // Parse Q: / A: pairs from source content
  const qaPairs: Array<{ q: string; a: string }> = [];
  const qaRegex = /Q:\s*([\s\S]*?)\nA:\s*([\s\S]*?)(?=\n\s*Q:|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = qaRegex.exec(content)) !== null) {
    qaPairs.push({ q: m[1].trim(), a: m[2].trim() });
  }

  if (qaPairs.length > 0) {
    parts.push('<h2>Business information</h2>');
    for (const { q, a } of qaPairs) {
      parts.push(`<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a).replace(/\n/g, '<br>')}</p>`);
    }
  } else if (content.trim()) {
    // Fallback: dump the raw content as paragraphs
    parts.push('<h2>Business information</h2>');
    for (const para of content.split(/\n{2,}/)) {
      if (!para.trim()) continue;
      parts.push(`<p>${escapeHtml(para.trim()).replace(/\n/g, '<br>')}</p>`);
    }
  }

  // Handling calls (always add a stub — operator can edit)
  parts.push(
    '<h2>Handling calls</h2><ul>' +
      '<li>Greet warmly using the business name.</li>' +
      '<li>Ask the caller\'s name and how you can help.</li>' +
      '<li>Take a clear message if the request is outside your remit.</li>' +
      '<li>Transfer only to numbers listed under Quick reference.</li>' +
      '</ul>',
  );

  return parts.join('\n');
}

/* --------------------------------------------------------------------------
 * Per-client mapping — controls where each form field's answer ends up
 * (a script section, a quick-reference table row, or a customer record field).
 * ------------------------------------------------------------------------ */

export type CustomerFieldKey =
  | 'name'
  | 'email'
  | 'phone'
  | 'website'
  | 'address_line1'
  | 'address_line2'
  | 'city'
  | 'postcode';

export const CUSTOMER_FIELD_LABELS: Record<CustomerFieldKey, string> = {
  name: 'Business name',
  email: 'Email',
  phone: 'Phone',
  website: 'Website',
  address_line1: 'Address line 1',
  address_line2: 'Address line 2',
  city: 'City',
  postcode: 'Postcode',
};

export type FieldTarget =
  | { kind: 'ignore' }
  | { kind: 'script_section'; sectionId: string }
  | { kind: 'quick_ref'; label?: string }
  | { kind: 'customer_field'; field: CustomerFieldKey };

export interface ScriptSection {
  id: string;
  title: string;
  order: number;
  /** Fixed sections are always emitted with built-in content even if empty. */
  fixed?: 'greeting' | 'quick_ref' | 'handling_calls';
}

export interface ScriptMappingConfig {
  sections: ScriptSection[];
  fields: Record<string, FieldTarget>;
}

export const DEFAULT_SECTIONS: ScriptSection[] = [
  { id: 'greeting', title: 'Greeting', order: 0, fixed: 'greeting' },
  { id: 'quick_ref', title: 'Quick reference', order: 1, fixed: 'quick_ref' },
  { id: 'business_info', title: 'Business information', order: 2 },
  { id: 'handling_calls', title: 'Handling calls', order: 3, fixed: 'handling_calls' },
];

const RX = (s: string) => new RegExp(s, 'i');

const CUSTOMER_FIELD_HEURISTICS: Array<[RegExp, CustomerFieldKey]> = [
  [RX('e-?mail'), 'email'],
  [RX('post ?code|zip'), 'postcode'],
  [RX('address ?line ?2|address 2|line 2'), 'address_line2'],
  [RX('address ?line ?1|address 1|line 1|street|building'), 'address_line1'],
  [RX('city|town'), 'city'],
  [RX('web ?site|url|domain'), 'website'],
  [RX('phone|telephone|mobile|contact number'), 'phone'],
  [RX('company|business name|trading name|clinic name'), 'name'],
];

const QUICK_REF_HEURISTICS: Array<[RegExp, string]> = [
  [RX('opening|hours|open time|business hours'), 'Opening hours'],
  [RX('price|cost|fee|rate'), 'Pricing'],
  [RX('emergency'), 'Emergency contact'],
  [RX('parking|access'), 'Parking / access'],
  [RX('booking|appointment'), 'Booking info'],
];

function inferTarget(label: string): FieldTarget {
  const l = (label || '').trim();
  if (!l) return { kind: 'script_section', sectionId: 'business_info' };
  for (const [rx, field] of CUSTOMER_FIELD_HEURISTICS) {
    if (rx.test(l)) return { kind: 'customer_field', field };
  }
  for (const [rx, quickLabel] of QUICK_REF_HEURISTICS) {
    if (rx.test(l)) return { kind: 'quick_ref', label: quickLabel };
  }
  return { kind: 'script_section', sectionId: 'business_info' };
}

export interface DetectedCustomerField {
  field: CustomerFieldKey;
  label: string;
  value: string;
  confidence: 'high' | 'low';
  reason?: string;
}

/** Extract "Label: value" style pairs from free text (OCR-friendly). */
export function extractLabelValuePairs(text: string): Array<{ label: string; value: string; line: string }> {
  const out: Array<{ label: string; value: string; line: string }> = [];
  const lines = (text || '').split(/\r?\n/);
  const sep = /^\s*([A-Za-z][A-Za-z0-9 /&()'\-]{1,60}?)\s*[:\-–—]\s*(.+?)\s*$/;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(sep);
    if (!m) continue;
    const label = m[1].trim();
    const value = m[2].trim();
    if (!label || !value) continue;
    if (value.length > 200) continue;
    out.push({ label, value, line });
  }
  return out;
}

const EMAIL_RX = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i;
const URL_RX = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.(?:co\.uk|com|net|org|io|shop|store|uk))/i;
const PHONE_RX = /(?:\+?\d[\d\s\-().]{7,}\d)/;
const UK_POSTCODE_RX = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

/**
 * Detect customer-field values from free text using label heuristics and
 * value-shape fallbacks (email/phone/postcode/url). Flags values as low
 * confidence when they overlap with OCR uncertain terms.
 */
export function inferCustomerFieldsFromText(
  text: string,
  uncertainTerms: string[] = [],
): DetectedCustomerField[] {
  const found = new Map<CustomerFieldKey, DetectedCustomerField>();
  const uncertain = new Set((uncertainTerms || []).map((t) => t.toLowerCase()));

  const markConfidence = (value: string): 'high' | 'low' => {
    if (!uncertain.size) return 'high';
    const tokens = value.toLowerCase().split(/[\s,;/]+/).filter(Boolean);
    return tokens.some((t) => uncertain.has(t)) ? 'low' : 'high';
  };

  const put = (field: CustomerFieldKey, label: string, value: string, reason?: string) => {
    if (found.has(field)) return;
    if (!value.trim()) return;
    found.set(field, {
      field,
      label,
      value: value.trim(),
      confidence: markConfidence(value),
      reason,
    });
  };

  // 1) Label:value pairs → heuristics
  for (const { label, value } of extractLabelValuePairs(text)) {
    for (const [rx, field] of CUSTOMER_FIELD_HEURISTICS) {
      if (rx.test(label)) {
        put(field, label, value, `Label match: "${label}"`);
        break;
      }
    }
  }

  // 2) Value-shape fallbacks anywhere in text
  if (!found.has('email')) {
    const m = text.match(EMAIL_RX);
    if (m) put('email', 'Email (detected)', m[0], 'Email shape');
  }
  if (!found.has('postcode')) {
    const m = text.match(UK_POSTCODE_RX);
    if (m) put('postcode', 'Postcode (detected)', m[0].toUpperCase().replace(/\s+/g, ' '), 'UK postcode shape');
  }
  if (!found.has('phone')) {
    const m = text.match(PHONE_RX);
    if (m) put('phone', 'Phone (detected)', m[0].replace(/\s{2,}/g, ' '), 'Phone shape');
  }
  if (!found.has('website')) {
    const m = text.match(URL_RX);
    if (m) put('website', 'Website (detected)', m[0], 'URL shape');
  }

  return Array.from(found.values());
}



/** Walk a form template's elements and return all {id, label} pairs. */
export function flattenFormFields(elements: any[]): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  const walk = (list: any[]) => {
    for (const el of list || []) {
      if (!el) continue;
      if (el.id && (el.label || el.type)) {
        out.push({ id: el.id, label: el.label || el.groupTitle || el.content || el.id });
      }
      if (el.elements) walk(el.elements);
    }
  };
  walk(elements || []);
  return out;
}

/** Build a fresh mapping by inferring targets from field labels. */
export function inferMappingFromForm(
  elements: any[],
  base?: Partial<ScriptMappingConfig>,
): ScriptMappingConfig {
  const fields: Record<string, FieldTarget> = { ...(base?.fields || {}) };
  for (const { id, label } of flattenFormFields(elements)) {
    if (!fields[id]) fields[id] = inferTarget(label);
  }
  return {
    sections: (base?.sections && base.sections.length ? base.sections : DEFAULT_SECTIONS).map((s) => ({ ...s })),
    fields,
  };
}

/** Deep-merge: override wins over base, base wins over fallback. */
export function mergeMapping(
  fallback: ScriptMappingConfig,
  base?: Partial<ScriptMappingConfig> | null,
  override?: Partial<ScriptMappingConfig> | null,
): ScriptMappingConfig {
  const sections =
    (override?.sections && override.sections.length ? override.sections : null) ??
    (base?.sections && base.sections.length ? base.sections : null) ??
    fallback.sections;
  return {
    sections: sections.map((s) => ({ ...s })),
    fields: { ...fallback.fields, ...(base?.fields || {}), ...(override?.fields || {}) },
  };
}

const isEmpty = (v: any) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

const stringifyValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

export interface QuickRefRow {
  label: string;
  value: string;
}

export interface BuildFromMappingResult {
  html: string;
  /** Values to write back to the customer record — only fields empty on the customer. */
  customerFieldUpdates: Partial<Record<CustomerFieldKey, string>>;
  /** Fields discovered on the form but missing from the mapping (auto-inferred). */
  addedFieldIds: string[];
  /** Quick-reference rows produced from mapped answers (excludes customer-context rows). */
  extraQuickRefRows: QuickRefRow[];
  /** Per-section Q&A blocks routed to non-fixed sections. */
  sectionQA: Record<string, Array<{ q: string; a: string }>>;
  /** Sorted sections used for rendering — pass back into renderScript. */
  sortedSections: ScriptSection[];
}

export interface RenderScriptInput {
  sortedSections: ScriptSection[];
  customer: CustomerContextForScript;
  extraQuickRefRows: QuickRefRow[];
  sectionQA: Record<string, Array<{ q: string; a: string }>>;
}

/** Render the script HTML from already-collected parts. Pure — no mapping / responses. */
export function renderScript(input: RenderScriptInput): string {
  const { sortedSections, customer, extraQuickRefRows, sectionQA } = input;
  const name = customer.name || 'the business';
  const parts: string[] = [];
  for (const section of sortedSections) {
    if (section.fixed === 'greeting') {
      parts.push(
        `<h2>${escapeHtml(section.title)}</h2><p>Thank you for calling <strong>${escapeHtml(name)}</strong>, this is [operator name] speaking — how can I help you today?</p>`,
      );
      continue;
    }
    if (section.fixed === 'quick_ref') {
      const rows: Array<[string, string]> = [];
      if (customer.phone) rows.push(['Main phone', customer.phone]);
      if (customer.email) rows.push(['Email', customer.email]);
      if (customer.website) rows.push(['Website', customer.website]);
      const address = [customer.address_line1, customer.address_line2, customer.city, customer.postcode]
        .filter(Boolean)
        .join(', ');
      if (address) rows.push(['Address', address]);
      for (const r of extraQuickRefRows) {
        if (!r.label?.trim() && !r.value?.trim()) continue;
        rows.push([r.label || '', r.value || '']);
      }
      if (customer.contacts && customer.contacts.length > 0) {
        const contactLines = customer.contacts
          .map((c) => {
            const nm = [c.firstName, c.lastName].filter(Boolean).join(' ');
            return [nm || 'Contact', c.role, c.telephone, c.email].filter(Boolean).join(' · ');
          })
          .filter(Boolean);
        if (contactLines.length) rows.push(['Key contacts', contactLines.join('<br>')]);
      }
      if (customer.locations && customer.locations.length > 0) {
        const locLines = customer.locations
          .map((l) => {
            const nm = escapeHtml(l.name || 'Location');
            const url = l.google_maps_url;
            const link = url
              ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open in maps</a>`
              : '';
            const notes = l.notes ? ` — ${escapeHtml(l.notes)}` : '';
            return `${nm}${link ? ` (${link})` : ''}${notes}`;
          })
          .filter(Boolean);
        if (locLines.length) rows.push(['Locations', locLines.join('<br>')]);
      }
      if (rows.length === 0) continue;
      parts.push(`<h2>${escapeHtml(section.title)}</h2>`);
      parts.push('<table><thead><tr><th>Item</th><th>Details</th></tr></thead><tbody>');
      for (const [k, v] of rows) {
        const alreadyHtml = /<a |<br>/.test(v);
        parts.push(
          `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${alreadyHtml ? v : escapeHtml(v)}</td></tr>`,
        );
      }
      parts.push('</tbody></table>');
      continue;
    }
    if (section.fixed === 'handling_calls') {
      parts.push(
        `<h2>${escapeHtml(section.title)}</h2><ul>` +
          '<li>Greet warmly using the business name.</li>' +
          "<li>Ask the caller's name and how you can help.</li>" +
          '<li>Take a clear message if the request is outside your remit.</li>' +
          '<li>Transfer only to numbers listed under Quick reference.</li>' +
          '</ul>',
      );
      continue;
    }
    const qas = sectionQA[section.id] || [];
    if (qas.length === 0) continue;
    parts.push(`<h2>${escapeHtml(section.title)}</h2>`);
    for (const { q, a } of qas) {
      parts.push(`<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a).replace(/\n/g, '<br>')}</p>`);
    }
  }
  return parts.join('\n');
}

/** Merge customer-field edits into a customer context (used by review step). */
export function applyCustomerOverrides(
  customer: CustomerContextForScript,
  overrides: Partial<Record<CustomerFieldKey, string>>,
): CustomerContextForScript {
  const merged: CustomerContextForScript = { ...customer };
  const addressKeys: CustomerFieldKey[] = ['address_line1', 'address_line2', 'city', 'postcode'];
  for (const [k, v] of Object.entries(overrides)) {
    if (v == null) continue;
    const key = k as CustomerFieldKey;
    if (key === 'name' || key === 'email' || key === 'phone' || key === 'website' || addressKeys.includes(key)) {
      (merged as any)[key] = v;
    }
  }
  return merged;
}

/**
 * Build a fully-mapped script from a form submission's responses.
 * Uses the provided mapping to route each answer to a script section, the
 * quick-reference table, a customer field, or nowhere.
 */
export function buildScriptFromMapping(
  responses: Record<string, any>,
  labelResolver: (id: string) => string,
  mapping: ScriptMappingConfig,
  customer: CustomerContextForScript,
): BuildFromMappingResult {
  const sortedSections = [...mapping.sections].sort((a, b) => a.order - b.order);
  const sectionQA: Record<string, Array<{ q: string; a: string }>> = {};
  const extraQuickRefRows: QuickRefRow[] = [];
  const customerFieldUpdates: Partial<Record<CustomerFieldKey, string>> = {};
  const addedFieldIds: string[] = [];

  for (const [id, raw] of Object.entries(responses || {})) {
    if (isEmpty(raw)) continue;
    const value = stringifyValue(raw);
    if (!value.trim()) continue;
    const label = labelResolver(id) || id;
    let target = mapping.fields[id];
    if (!target) {
      target = inferTarget(label);
      mapping.fields[id] = target;
      addedFieldIds.push(id);
    }
    if (target.kind === 'ignore') continue;
    if (target.kind === 'customer_field') {
      const current = (customer as any)[target.field];
      if (isEmpty(current) && !customerFieldUpdates[target.field]) {
        customerFieldUpdates[target.field] = value;
      }
      extraQuickRefRows.push({ label: CUSTOMER_FIELD_LABELS[target.field], value });
      continue;
    }
    if (target.kind === 'quick_ref') {
      extraQuickRefRows.push({ label: target.label || label, value });
      continue;
    }
    if (target.kind === 'script_section') {
      const sid = target.sectionId || 'business_info';
      (sectionQA[sid] ||= []).push({ q: label, a: value });
    }
  }

  const html = renderScript({ sortedSections, customer, extraQuickRefRows, sectionQA });
  return { html, customerFieldUpdates, addedFieldIds, extraQuickRefRows, sectionQA, sortedSections };
}

