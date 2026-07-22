import DOMPurify from 'dompurify';

/**
 * Enhanced HTML sanitization to prevent XSS attacks
 * @param html - The HTML content to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  
  // Enhanced DOMPurify configuration with balanced security and functionality
  return DOMPurify.sanitize(html, {
    // Allowed tags for rich text content formatting
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'span', 'div', 'a', 'img', 'mark',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col'
    ],
    // Safe attributes for formatting and links
    ALLOWED_ATTR: [
      'class', 'id', 'href', 'target', 'rel', 'style',
      'src', 'alt', 'width', 'height',
      'colspan', 'rowspan', 'align', 'valign', 'scope'
    ],
    // Security hardening
    ALLOW_DATA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOW_SELF_CLOSE_IN_ATTR: false,
    // Forbid all potentially dangerous elements
    FORBID_TAGS: [
      'script', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button',
      'iframe', 'frame', 'frameset', 'applet', 'base', 'basefont', 'bgsound',
      'link', 'meta', 'style', 'title', 'svg', 'math', 'details', 'summary'
    ],
    // Forbid all event handlers and dangerous attributes
    FORBID_ATTR: [
      'onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur',
      'onabort', 'onafterprint', 'onbeforeprint', 'onbeforeunload', 'oncanplay',
      'oncanplaythrough', 'onchange', 'oncontextmenu', 'oncopy', 'oncut',
      'ondblclick', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave',
      'ondragover', 'ondragstart', 'ondrop', 'ondurationchange', 'onemptied',
      'onended', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup',
      'onloadeddata', 'onloadedmetadata', 'onloadstart', 'onmousedown',
      'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup', 'onmousewheel',
      'onoffline', 'ononline', 'onpagehide', 'onpageshow', 'onpaste', 'onpause',
      'onplay', 'onplaying', 'onpopstate', 'onprogress', 'onratechange',
      'onreset', 'onresize', 'onscroll', 'onsearch', 'onseeked', 'onseeking',
      'onselect', 'onstalled', 'onstorage', 'onsubmit', 'onsuspend', 'ontimeupdate',
      'ontoggle', 'onunload', 'onvolumechange', 'onwaiting', 'onwheel',
      'title', 'action', 'method',
      'enctype', 'autocomplete', 'autofocus', 'disabled', 'multiple', 'readonly',
      'required', 'selected', 'checked', 'defer', 'async', 'crossorigin',
      'integrity', 'referrerpolicy', 'sandbox', 'srcdoc', 'loading'
    ],
    // Critical: Keep content inside allowed tags
    KEEP_CONTENT: true,
    // Additional security options
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
    IN_PLACE: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false
  });
}

/**
 * Extra secure sanitization for user input that should only contain plain text
 * @param text - The text content to sanitize
 * @returns Plain text only
 */
export function sanitizeText(text: string): string {
  if (!text) return '';
  
  // Strip all HTML tags and return plain text only
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true
  });
}