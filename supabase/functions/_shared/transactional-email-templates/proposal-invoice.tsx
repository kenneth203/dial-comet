/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailSignature } from './_signature.tsx'

const SITE_NAME = 'The VA Team'
const PORTAL_URL = 'https://portal.thevateam.co.uk'

interface ProposalInvoiceProps {
  invoiceNumber?: string
  clientName?: string
  companyName?: string
  serviceType?: string
  packageName?: string
  subtotal?: number
  vatAmount?: number
  total?: number
  issuedAt?: string
  dueAt?: string
  notes?: string
  pdfUrl?: string
}

const fmt = (n?: number) => `£${Number(n || 0).toFixed(2)}`
const fmtDate = (d?: string) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB') } catch { return d }
}

const ProposalInvoiceEmail = (p: ProposalInvoiceProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Invoice {p.invoiceNumber || ''} from {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src={`${PORTAL_URL}/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png`}
          alt={SITE_NAME}
          height="40"
          style={logo}
        />
        <Heading style={h1}>Invoice {p.invoiceNumber}</Heading>
        <Text style={text}>
          Hi {p.clientName || 'there'},
        </Text>
        <Text style={text}>
          Please find your invoice details below from {SITE_NAME}.
        </Text>

        <Section style={card}>
          <Text style={row}><strong>Invoice #:</strong> {p.invoiceNumber}</Text>
          <Text style={row}><strong>Issued:</strong> {fmtDate(p.issuedAt)}</Text>
          <Text style={row}><strong>Due:</strong> {fmtDate(p.dueAt)}</Text>
          {p.companyName && <Text style={row}><strong>Company:</strong> {p.companyName}</Text>}
          <Hr style={hr} />
          <Text style={row}><strong>Service:</strong> {p.serviceType}</Text>
          <Text style={row}><strong>Package:</strong> {p.packageName}</Text>
          <Hr style={hr} />
          <Text style={row}><strong>Subtotal:</strong> {fmt(p.subtotal)}</Text>
          <Text style={row}><strong>VAT (20%):</strong> {fmt(p.vatAmount)}</Text>
          <Text style={totalRow}><strong>Total Due:</strong> {fmt(p.total)}</Text>
        </Section>

        {p.notes && <Text style={text}><em>{p.notes}</em></Text>}

        {p.pdfUrl && (
          <Button style={button} href={p.pdfUrl}>Download Invoice</Button>
        )}

        <Text style={footer}>
          Thank you for your business. If you have any questions about this invoice,
          please reply to this email. — The {SITE_NAME} Team
        </Text>
              <Text style={{fontSize:"11px",color:"#999999",borderTop:"1px solid #eeeeee",paddingTop:"15px",margin:"25px 0 0",textAlign:"center" as const}}>Please do not reply to this email. For any assistance, contact us at <a href="mailto:info@thevateam.co.uk" style={{color:"#b73235",textDecoration:"underline"}}>info@thevateam.co.uk</a>.</Text>
        <EmailSignature />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ProposalInvoiceEmail,
  subject: (d: Record<string, any>) =>
    `Invoice ${d.invoiceNumber || ''} from ${SITE_NAME}`.trim(),
  displayName: 'Proposal invoice',
  previewData: {
    invoiceNumber: 'INV-000123',
    clientName: 'Jane Smith',
    companyName: 'Acme Ltd',
    serviceType: 'VR',
    packageName: 'Growth',
    subtotal: 129,
    vatAmount: 25.8,
    total: 154.8,
    issuedAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    pdfUrl: 'https://example.com/invoice.pdf',
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
  borderLeft: '4px solid #1c477a',
  margin: '20px 0',
}
const row = { fontSize: '14px', color: '#1a1a1a', margin: '4px 0', lineHeight: '1.5' }
const totalRow = { fontSize: '16px', color: '#b73235', margin: '8px 0 0', lineHeight: '1.5' }
const hr = { borderColor: '#e5e7eb', margin: '12px 0' }
const button = {
  backgroundColor: '#b73235', color: '#ffffff', fontSize: '14px',
  borderRadius: '6px', padding: '12px 24px', textDecoration: 'none',
  fontWeight: 'bold' as const, marginTop: '10px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
