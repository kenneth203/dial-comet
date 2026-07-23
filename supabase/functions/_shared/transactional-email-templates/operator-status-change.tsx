/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailSignature } from './_signature.tsx'

const SITE_NAME = 'The VA Team'
const PORTAL_URL = Deno.env.get('APP_PUBLIC_URL') ?? 'https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app'

interface OperatorStatusChangeProps {
  operatorName?: string
  operatorEmail?: string
  transition?: 'online_to_offline' | 'offline_to_online'
  changedAt?: string
  lastSeenAt?: string | null
}

const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleString('en-GB') } catch { return d }
}

const OperatorStatusChangeEmail = (p: OperatorStatusChangeProps) => {
  const wentOffline = p.transition === 'online_to_offline'
  const headline = wentOffline ? '⚠️ Operator went offline' : '✅ Operator back online'
  const accent = wentOffline ? '#b73235' : '#1c477a'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{p.operatorName || 'An operator'} is now {wentOffline ? 'offline' : 'online'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src={`${PORTAL_URL}/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png`}
            alt={SITE_NAME}
            height="40"
            style={logo}
          />
          <Heading style={{ ...h1, color: accent }}>{headline}</Heading>
          <Text style={text}>Hi Kenneth,</Text>
          <Text style={text}>
            <strong>{p.operatorName || 'An operator'}</strong>
            {p.operatorEmail ? ` (${p.operatorEmail})` : ''} has just changed presence
            on the {SITE_NAME} portal.
          </Text>

          <Section style={{ ...card, borderLeftColor: accent }}>
            <Text style={row}><strong>Operator:</strong> {p.operatorName || '—'}</Text>
            {p.operatorEmail && <Text style={row}><strong>Email:</strong> {p.operatorEmail}</Text>}
            <Text style={row}>
              <strong>New status:</strong> {wentOffline ? 'Offline ⛔' : 'Online 🟢'}
            </Text>
            <Text style={row}><strong>Changed at:</strong> {fmtDate(p.changedAt)}</Text>
            {wentOffline && (
              <Text style={row}><strong>Last seen:</strong> {fmtDate(p.lastSeenAt)}</Text>
            )}
          </Section>

          <Text style={footer}>
            This is an automatic presence alert from the {SITE_NAME} portal.
          </Text>
          <EmailSignature />
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OperatorStatusChangeEmail,
  subject: (d: Record<string, any>) => {
    const went = d.transition === 'online_to_offline' ? 'OFFLINE' : 'ONLINE'
    return `[Presence] ${d.operatorName || 'Operator'} is now ${went}`
  },
  to: 'dev-test-recipient@example.invalid',
  displayName: 'Operator status change (internal)',
  previewData: {
    operatorName: 'Jane Smith',
    operatorEmail: 'jane@thevateam.co.uk',
    transition: 'online_to_offline',
    changedAt: new Date().toISOString(),
    lastSeenAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '600px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 15px' }
const card = {
  padding: '20px',
  backgroundColor: '#f8f9fb',
  borderRadius: '8px',
  borderLeft: '4px solid #b73235',
  margin: '20px 0',
}
const row = { fontSize: '14px', color: '#1a1a1a', margin: '4px 0', lineHeight: '1.5' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
