/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailSignature } from './_signature.tsx'

const SITE_NAME = 'The VA Team'
const PORTAL_URL = Deno.env.get('APP_PUBLIC_URL') ?? 'https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app'

interface FormSubmittedInternalProps {
  customerName?: string
  formName?: string
  submittedAt?: string
  reviewUrl?: string
}

const FormSubmittedInternalEmail = ({
  customerName, formName, submittedAt, reviewUrl,
}: FormSubmittedInternalProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New form submission from {customerName || 'a customer'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New form submission received</Heading>
        <Text style={text}>Hi Kenneth,</Text>
        <Text style={text}>
          A new form has just been completed and submitted via the portal.
        </Text>
        <Section style={card}>
          <Text style={row}><strong>Customer:</strong> {customerName || '—'}</Text>
          <Text style={row}><strong>Form:</strong> {formName || '—'}</Text>
          <Text style={row}><strong>Submitted:</strong> {submittedAt || '—'}</Text>
        </Section>
        {reviewUrl && (
          <Section style={btnWrap}>
            <Button href={reviewUrl} style={btn}>Review submission</Button>
          </Section>
        )}
        <Text style={text}>
          You can view the responses and download a PDF from the customer's Forms tab in the portal.
        </Text>
        <EmailSignature />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: FormSubmittedInternalEmail,
  subject: (d: Record<string, any>) =>
    `New form submission: ${d.formName || 'Form'} — ${d.customerName || 'Customer'}`,
  displayName: 'Form submitted (internal notification)',
  previewData: {
    customerName: 'Jane Smith',
    formName: 'VR Client Onboarding Questionnaire',
    submittedAt: '28/05/2026 14:32',
    reviewUrl: `${PORTAL_URL}/customers`,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1c477a', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 15px' }
const card = {
  backgroundColor: '#f6f7f9',
  borderLeft: '4px solid #b73235',
  padding: '14px 18px',
  margin: '18px 0',
  borderRadius: '4px',
}
const row = { fontSize: '14px', color: '#1c477a', margin: '4px 0', lineHeight: '1.5' }
const btnWrap = { textAlign: 'center' as const, margin: '24px 0' }
const btn = {
  backgroundColor: '#b73235',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  display: 'inline-block',
}
