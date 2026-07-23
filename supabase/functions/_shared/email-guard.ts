// Phase 0.5 Development Safety Hardening — outbound email guard.
// Fail-closed allowlist. DEV_EMAIL_ALLOWLIST accepts EXACT addresses only.
// Whole-domain entries are rejected at parse time and treated as empty.

import { isDevEnvironment } from './env-guard.ts';

const BLOCKLIST_EXACT = new Set(['kenneth@thevateam.co.uk']);
const BLOCKLIST_DOMAIN_SUFFIXES = ['@thevateam.co.uk'];

export interface EmailAddressBundle {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  reply_to?: string | string[];
}

export interface EmailGuardResult {
  allowed: boolean;
  reason?: string;
  blocked?: string[];
}

function normaliseList(v: unknown): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
    .map((e) => e.trim().toLowerCase());
}

function parseAllowlist(): string[] {
  const raw = Deno.env.get('DEV_EMAIL_ALLOWLIST');
  if (!raw) return [];
  const parts = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const rejected: string[] = [];
  const valid: string[] = [];
  for (const p of parts) {
    // Reject domain-only / wildcard entries. Exact addresses only.
    if (p.startsWith('@') || p.startsWith('*') || !p.includes('@') || p.split('@').length !== 2 || !p.split('@')[0]) {
      rejected.push(p);
      continue;
    }
    valid.push(p);
  }
  if (rejected.length > 0) {
    console.warn('[email-guard] DEV_EMAIL_ALLOWLIST rejected non-exact entries', { rejected });
  }
  return valid;
}

function isBlocked(addr: string): boolean {
  if (BLOCKLIST_EXACT.has(addr)) return true;
  return BLOCKLIST_DOMAIN_SUFFIXES.some((s) => addr.endsWith(s));
}

export function assertEmailAllowed(bundle: EmailAddressBundle): EmailGuardResult {
  if (!isDevEnvironment()) {
    return { allowed: false, reason: 'environment_misconfigured' };
  }
  const candidates = [
    ...normaliseList(bundle.to),
    ...normaliseList(bundle.cc),
    ...normaliseList(bundle.bcc),
    ...normaliseList(bundle.reply_to),
  ];
  if (candidates.length === 0) {
    return { allowed: false, reason: 'no_recipients' };
  }
  const allowlist = parseAllowlist();
  const blocked: string[] = [];
  for (const addr of candidates) {
    if (isBlocked(addr)) {
      blocked.push(addr);
      continue;
    }
    if (!allowlist.includes(addr)) {
      blocked.push(addr);
    }
  }
  if (blocked.length > 0) {
    return { allowed: false, reason: 'email_blocked_dev_environment', blocked };
  }
  return { allowed: true };
}

export function decorateDevSubject(subject: string): string {
  return subject.startsWith('[DEV]') ? subject : `[DEV] ${subject}`;
}

export function devFooterHtml(): string {
  return '<hr style="margin:24px 0;border:none;border-top:1px solid #ddd" /><p style="font-size:12px;color:#666;font-family:Arial,sans-serif">Sent from the DEVELOPMENT environment. Not a production email.</p>';
}
