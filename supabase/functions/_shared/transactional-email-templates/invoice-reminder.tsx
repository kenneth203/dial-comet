/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailSignature } from './_signature.tsx'

const SITE_NAME = 'The VA Team'
const PORTAL_URL = 'https://portal.thevateam.co.uk'

type ReminderType = 'due_today' | 'overdue_3' | 'overdue_5' | 'overdue_7'

interface InvoiceReminderProps {
  invoiceNumber?: string
  clientName?: string
  companyName?: string
  total?: number
  issuedAt?: string
  dueAt?: string
  pdfUrl?: string
  reminderType?: ReminderType
  daysOverdue?: number
}

const fmt = (n?: number) => `£${Number(n || 0).toFixed(2)}`
const fmtDate = (d?: string) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB') } catch { return d }
}

const headingFor = (t?: ReminderType, days?: number) => {
  switch (t) {
    case 'due_today': return 'Friendly reminder — invoice due today'
    case 'overdue_3': return 'Payment reminder — invoice 3 days overdue'
    case 'overdue_5': return 'Second reminder — invoice 5 days overdue'
    case 'overdue_7': return 'Final reminder — invoice 7 days overdue'
    default: return days && days > 0 ? `Payment reminder — ${days} days overdue` : 'Invoice reminder'
  }
}

const introFor = (t?: ReminderType) => {
  switch (t) {
    case 'due_today':
      return 'This is a friendly reminder that the invoice below is due today. If payment has already been made, please disregard this message.'
    case 'overdue_3':
      return 'Our records show the invoice below is now 3 days overdue. Please arrange payment at your earliest convenience.'
    case 'overdue_5':
      return 'The invoice below is now 5 days overdue. Please settle this invoice to avoid any service interruption.'
    case 'overdue_7':
      return 'This is our final reminder — the invoice below is now 7 days overdue. Please note services may be suspended until payment is received, per our terms.'
    default:
      return 'Please find your outstanding invoice details below.'
  }
}

const InvoiceReminderEmail = (p: InvoiceReminderProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reminder: Invoice {p.invoiceNumber || ''} from {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src={`${PORTAL_URL}/lovable-uploads/va-team-logo.png`}
          alt={SITE_NAME}
          height="60"
          style={logo}
        />
        <Heading style={h1}>{headingFor(p.reminderType, p.daysOverdue)}</Heading>
        <Text style={text}>Hi {p.clientName || 'there'},</Text>
        <Text style={text}>{introFor(p.reminderType)}</Text>

        <Section style={card}>
          <Text style={row}><strong>Invoice #:</strong> {p.invoiceNumber}</Text>
          <Text style={row}><strong>Issued:</strong> {fmtDate(p.issuedAt)}</Text>
          <Text style={row}><strong>Due:</strong> {fmtDate(p.dueAt)}</Text>
          {p.companyName && <Text style={row}><strong>Company:</strong> {p.companyName}</Text>}
          <Hr style={hr} />
          <Text style={totalRow}><strong>Amount Due:</strong> {fmt(p.total)}</Text>
        </Section>

        <Text style={text}>
          <strong>Our banking details:</strong><br />
          Account Name: The VA Team Limited<br />
          Account: 93528582<br />
          Sort code: 51-81-22<br />
          Reference: {p.invoiceNumber}
        </Text>

        {p.pdfUrl && (
          <Button style={button} href={p.pdfUrl}>Download Invoice</Button>
        )}

        <Text style={footer}>
          If payment has already been made or you have any questions, please email
          info@thevateam.co.uk. — The {SITE_NAME} Team
        </Text>
        <Text style={{fontSize:"11px",color:"#999999",borderTop:"1px solid #eeeeee",paddingTop:"15px",margin:"25px 0 0",textAlign:"center" as const}}>Please do not reply to this email. For any assistance, contact us at <a href="mailto:info@thevateam.co.uk" style={{color:"#b73235",textDecoration:"underline"}}>info@thevateam.co.uk</a>.</Text>
        <EmailSignature />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InvoiceReminderEmail,
  subject: (d: Record<string, any>) => {
    const num = d.invoiceNumber || ''
    switch (d.reminderType) {
      case 'due_today': return `Reminder: Invoice ${num} is due today`
      case 'overdue_3': return `Payment reminder: Invoice ${num} is 3 days overdue`
      case 'overdue_5': return `Second reminder: Invoice ${num} is 5 days overdue`
      case 'overdue_7': return `Final reminder: Invoice ${num} is 7 days overdue`
      default: return `Invoice ${num} reminder`
    }
  },
  displayName: 'Invoice reminder',
  previewData: {
    invoiceNumber: 'INV-000123',
    clientName: 'Jane Smith',
    companyName: 'Acme Ltd',
    total: 154.8,
    issuedAt: new Date().toISOString(),
    dueAt: new Date().toISOString(),
    reminderType: 'overdue_3',
    daysOverdue: 3,
    pdfUrl: 'https://example.com/invoice.pdf',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '600px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#b73235', margin: '0 0 20px' }
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
const button = {
  backgroundColor: '#1c477a', color: '#ffffff', fontSize: '14px',
  borderRadius: '6px', padding: '12px 24px', textDecoration: 'none',
  fontWeight: 'bold' as const, marginTop: '10px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
