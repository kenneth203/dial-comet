/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailSignature } from './_signature.tsx'

const SITE_NAME = 'The VA Team'
const PORTAL_URL = Deno.env.get('APP_PUBLIC_URL') ?? 'https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app'

interface ProposalSignedInternalProps {
  clientName?: string
  companyName?: string
  serviceType?: string
  packageName?: string
  invoiceNumber?: string
  subtotal?: number
  vatAmount?: number
  total?: number
  signedAt?: string
  clientEmail?: string
  clientAddress?: string
  heardAbout?: string
}

const fmt = (n?: number) => `£${Number(n || 0).toFixed(2)}`
const fmtDate = (d?: string) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleString('en-GB') } catch { return d }
}

const ProposalSignedInternalEmail = (p: ProposalSignedInternalProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New sign-up: {p.clientName || 'A client'} signed the {p.serviceType} proposal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src={`${PORTAL_URL}/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png`}
          alt={SITE_NAME}
          height="40"
          style={logo}
        />
        <Heading style={h1}>🎉 New customer sign-up</Heading>
        <Text style={text}>Hi Kenneth,</Text>
        <Text style={text}>
          {p.clientName || 'A new client'}{p.companyName ? ` (${p.companyName})` : ''} has just
          signed their {p.serviceType} proposal and selected the <strong>{p.packageName}</strong> package.
          Invoice <strong>{p.invoiceNumber}</strong> has been raised and emailed to the customer.
        </Text>

        <Section style={card}>
          <Text style={row}><strong>Client:</strong> {p.clientName}</Text>
          {p.companyName && <Text style={row}><strong>Company:</strong> {p.companyName}</Text>}
          {p.clientEmail && <Text style={row}><strong>Email:</strong> {p.clientEmail}</Text>}
          {p.clientAddress && <Text style={row}><strong>Address:</strong> {p.clientAddress}</Text>}
          {p.heardAbout && <Text style={row}><strong>Heard about us:</strong> {p.heardAbout}</Text>}
          <Hr style={hr} />
          <Text style={row}><strong>Service:</strong> {p.serviceType}</Text>
          <Text style={row}><strong>Package:</strong> {p.packageName}</Text>
          <Text style={row}><strong>Signed:</strong> {fmtDate(p.signedAt)}</Text>
          <Hr style={hr} />
          <Text style={row}><strong>Invoice #:</strong> {p.invoiceNumber}</Text>
          <Text style={row}><strong>Subtotal:</strong> {fmt(p.subtotal)}</Text>
          <Text style={row}><strong>VAT (20%):</strong> {fmt(p.vatAmount)}</Text>
          <Text style={totalRow}><strong>Total:</strong> {fmt(p.total)}</Text>
        </Section>

        <Text style={text}>
          <strong>Next steps:</strong> please send the customer the new onboarding
          questionnaire and a copy of their invoice ({p.invoiceNumber}).
        </Text>

        <Text style={footer}>
          This is an internal notification from the {SITE_NAME} portal.
        </Text>
        <EmailSignature />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ProposalSignedInternalEmail,
  subject: (d: Record<string, any>) =>
    `🎉 New sign-up: ${d.clientName || 'A client'} — ${d.serviceType || ''} ${d.packageName || ''}`.trim(),
  to: 'dev-test-recipient@example.invalid',
  displayName: 'Proposal signed (internal)',
  previewData: {
    clientName: 'Jane Smith',
    companyName: 'Acme Ltd',
    clientEmail: 'jane@acme.com',
    clientAddress: '1 High Street, London',
    heardAbout: 'Referrals by Client',
    serviceType: 'VR',
    packageName: 'Growth',
    invoiceNumber: 'INV-000123',
    subtotal: 129,
    vatAmount: 25.8,
    total: 154.8,
    signedAt: new Date().toISOString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '600px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1c477a', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 15px' }
const card = {
  padding: '20px',
  backgroundColor: '#f8f9fb',
  borderRadius: '8px',
  borderLeft: '4px solid #b73235',
  margin: '20px 0',
}
const row = { fontSize: '14px', color: '#1a1a1a', margin: '4px 0', lineHeight: '1.5' }
const totalRow = { fontSize: '16px', color: '#b73235', margin: '8px 0 0', lineHeight: '1.5' }
const hr = { borderColor: '#e5e7eb', margin: '12px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
