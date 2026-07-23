/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailSignature } from './_signature.tsx'

const SITE_NAME = 'The VA Team'
const PORTAL_URL = Deno.env.get('APP_PUBLIC_URL') ?? 'https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app'

const DEFAULT_BODY = [
  "I hope you're well.",
  `I wanted to introduce ${SITE_NAME}. We are not your normal call answering service. We provide tailored customer service, call handling, diary support and admin solutions built around the way your business works.`,
  'Whether you need help answering calls, booking appointments, managing enquiries, supporting your team during busy periods, or making sure no opportunity is missed, we create a service that fits your business rather than forcing you into a standard package.',
  'For clinics, our first three booking packages are:\n- Starter 25: 25 calls from £99 + VAT per month\n- Business 40: 40 calls from £150 + VAT per month\n- Professional 60: 60 calls from £195 + VAT per month',
  'Packages are fully scalable, so we can increase or adjust your support as your business grows or your call volume changes.',
  `Would you be open to a short [discovery call](https://calendar.app.google/YrNFetLnzNej3P5q9)? It would be a chance to understand your business, your current challenges and how ${SITE_NAME} could support you.`,
  'You can reply directly to this email at info@thevateam.co.uk and one of our team will come straight back to you.',
].join('\n\n')

interface LeadIntroductionProps {
  clientName?: string
  personalMessage?: string
  bodyText?: string
  signatureText?: string
}

// ---- Legacy plain-text + markdown-link rendering ---------------------------

function toParagraphs(input: string): string[] {
  return input
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const tokenRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  let idx = 0
  while ((match = tokenRe.exec(line)) !== null) {
    if (match.index > lastIndex) nodes.push(line.slice(lastIndex, match.index))
    const [, mdLabel, mdHref, bareUrl, email] = match
    if (mdLabel && mdHref) {
      nodes.push(<a key={`${keyPrefix}-l-${idx}`} href={mdHref} style={linkStyle}>{mdLabel}</a>)
    } else if (bareUrl) {
      nodes.push(<a key={`${keyPrefix}-l-${idx}`} href={bareUrl} style={linkStyle}>{bareUrl}</a>)
    } else if (email) {
      nodes.push(<a key={`${keyPrefix}-l-${idx}`} href={`mailto:${email}`} style={linkStyle}>{email}</a>)
    }
    idx += 1
    lastIndex = tokenRe.lastIndex
  }
  if (lastIndex < line.length) nodes.push(line.slice(lastIndex))
  return nodes
}

function renderLines(paragraph: string, keyPrefix: string) {
  const lines = paragraph.split('\n')
  return lines.map((line, i) => (
    <React.Fragment key={`${keyPrefix}-${i}`}>
      {i > 0 ? <br /> : null}
      {renderInline(line, `${keyPrefix}-${i}`)}
    </React.Fragment>
  ))
}

// ---- HTML rich-text support (Quill output) --------------------------------

// Crude but safe: the content is authored by Super-Admin users only and is
// stripped of scripts, event handlers, javascript: URLs, and a small set of
// dangerous tags before being emitted into the email markup.
function sanitizeEmailHtml(html: string): string {
  let out = html
  // Drop entire <script>/<style>/<iframe>/etc blocks (with their contents).
  out = out.replace(
    /<(script|style|iframe|object|embed|form|svg|math|link|meta|base)\b[\s\S]*?<\/\1>/gi,
    '',
  )
  // Drop self-closing variants of those same tags.
  out = out.replace(
    /<(script|style|iframe|object|embed|form|svg|math|link|meta|base)\b[^>]*\/?>/gi,
    '',
  )
  // Strip inline event handlers (onclick="…", onload='…', onfoo=bar).
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
  // Neutralise javascript:/vbscript:/data: URLs in href/src.
  out = out.replace(/((?:href|src|xlink:href)\s*=\s*["'])\s*(?:javascript|vbscript|data)\s*:/gi, '$1#')
  // Quill 2 renders bullet lists as <ol><li data-list="bullet">…</li></ol>.
  // Most email clients ignore the data-list attribute and render numbers.
  // Convert any <ol> whose first <li> carries data-list="bullet" into a <ul>
  // and strip the data-list attribute everywhere so bullets render correctly.
  out = out.replace(/<ol([^>]*)>([\s\S]*?)<\/ol>/gi, (_m, attrs, inner) => {
    const isBullet = /<li[^>]*data-list\s*=\s*"bullet"/i.test(inner)
    const cleaned = inner.replace(/\sdata-list\s*=\s*"[^"]*"/gi, '')
    return isBullet ? `<ul${attrs}>${cleaned}</ul>` : `<ol${attrs}>${cleaned}</ol>`
  })
  return out
}

function looksLikeHtml(input: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(input)
}

// ---- Component -------------------------------------------------------------

const LeadIntroductionEmail = ({
  clientName,
  personalMessage,
  bodyText,
  signatureText,
}: LeadIntroductionProps) => {
  const rawBody = (bodyText && bodyText.trim()) ? bodyText : DEFAULT_BODY
  const bodyIsHtml = looksLikeHtml(rawBody)
  const paragraphs = bodyIsHtml ? [] : toParagraphs(rawBody)
  const sanitizedBodyHtml = bodyIsHtml ? sanitizeEmailHtml(rawBody) : ''

  const signatureParagraphs = signatureText && signatureText.trim()
    ? toParagraphs(signatureText)
    : null

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>An introduction to {SITE_NAME} — tailored call answering & admin support</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src={`${PORTAL_URL}/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png`}
            alt={SITE_NAME}
            height="40"
            style={logo}
          />

          <Text style={text}>Dear {clientName || 'there'},</Text>

          {personalMessage ? (
            <Section style={noteWrap}>
              <Text style={noteText}>{personalMessage}</Text>
            </Section>
          ) : null}

          {bodyIsHtml ? (
            <div
              style={htmlBodyWrap}
              // Admin-authored, sanitized above. Keeps Word-style bold/colour/lists.
              dangerouslySetInnerHTML={{ __html: sanitizedBodyHtml }}
            />
          ) : (
            paragraphs.map((p, i) => (
              <Text style={text} key={`body-${i}`}>{renderLines(p, `body-${i}`)}</Text>
            ))
          )}

          {signatureParagraphs ? (
            <Section style={{ marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              {signatureParagraphs.map((p, i) => (
                <Text style={sigLine} key={`sig-${i}`}>{renderLines(p, `sig-${i}`)}</Text>
              ))}
            </Section>
          ) : (
            <EmailSignature />
          )}
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: LeadIntroductionEmail,
  subject: (d: Record<string, any>) =>
    (typeof d?.subjectOverride === 'string' && d.subjectOverride.trim())
      ? d.subjectOverride
      : `An introduction to ${SITE_NAME} — tailored call answering & admin support`,
  displayName: 'Lead introduction',
  previewData: {
    clientName: 'Jane Smith',
    personalMessage: 'Lovely to speak earlier — here is a quick overview as promised.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '600px' }
const logo = { marginBottom: '24px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 15px' }
const sigLine = { fontSize: '13px', color: '#55575d', lineHeight: '1.5', margin: '0 0 4px' }
const noteWrap = { backgroundColor: '#f5f7fa', borderLeft: '3px solid #1c477a', padding: '12px 16px', margin: '0 0 20px' }
const noteText = { fontSize: '14px', color: '#1c477a', lineHeight: '1.6', margin: '0', fontStyle: 'italic' as const }
const linkStyle = { color: '#1c477a', textDecoration: 'underline' }
const htmlBodyWrap = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.6',
  margin: '0 0 15px',
}
