/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailSignature } from './_signature.tsx'

const SITE_NAME = 'The VA Team'
const PORTAL_URL = Deno.env.get('APP_PUBLIC_URL') ?? 'https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app'

interface CustomerFormLinkProps {
  clientName?: string
  formName?: string
  formUrl?: string
}

const CustomerFormLinkEmail = ({ clientName, formName, formUrl }: CustomerFormLinkProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome onboard — please complete your {formName || 'onboarding form'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src={`${PORTAL_URL}/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png`}
          alt={SITE_NAME}
          height="40"
          style={logo}
        />

        <Text style={text}>Dear {clientName || 'there'},</Text>

        <Text style={text}>
          Welcome onboard from all of us here at {SITE_NAME}
        </Text>

        <Text style={text}>
          We are so happy you have accepted our proposal for our Virtual Assistant / Reception Service. We are all looking forward to answering your calls and helping you and your customers with their virtual requirements.
        </Text>

        <Text style={text}>
          The first step in providing an outstanding call-answering service is learning all about you, your business, and your team. Please could I kindly ask you to complete the form below so we can learn more about your business.
        </Text>

        <Heading style={h2}>{formName || 'Virtual Reception Clinic Sign-up Form'}</Heading>

        <Section style={btnWrap}>
          <Button href={formUrl} style={btn}>
            Open {formName || 'your form'}
          </Button>
        </Section>

        <Text style={textSmall}>
          Or copy and paste this link into your browser:<br />
          <a href={formUrl} style={link}>{formUrl}</a>
        </Text>

        <Text style={text}>
          Once we receive your completed form, one of our team members will enter it into our telephone system so we can answer your calls with all the information at our fingertips. If there isn't enough space on the form, please email us any additional documents we need to best answer your calls.
        </Text>

        <Text style={text}>
          Once we have received this back, we will email you the number to divert to, and we can start answering your calls.
        </Text>

        <Text style={text}>Once again, we're glad to have you on board.</Text>

        <EmailSignature />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CustomerFormLinkEmail,
  subject: (d: Record<string, any>) =>
    `Welcome onboard — please complete your ${d.formName || 'onboarding form'}`,
  displayName: 'Customer form link',
  previewData: {
    clientName: 'Jane Smith',
    formName: 'VR Client Onboarding Questionnaire',
    formUrl: 'https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app/form/00000000-0000-0000-0000-000000000000',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '600px' }
const logo = { marginBottom: '24px' }
const h2 = { fontSize: '18px', fontWeight: 'bold' as const, color: '#1c477a', margin: '0 0 15px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 15px' }
const textSmall = { fontSize: '12px', color: '#55575d', lineHeight: '1.5', margin: '0 0 20px' }
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
const link = { color: '#1c477a', wordBreak: 'break-all' as const }
