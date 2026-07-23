/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailSignature } from './_signature.tsx'

const SITE_NAME = 'The VA Team'
const PORTAL_URL = Deno.env.get('APP_PUBLIC_URL') ?? 'https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app'

interface ProposalLinkProps {
  clientName?: string
  serviceLabel?: string
  proposalUrl?: string
  expiresAt?: string
  personalMessage?: string
}

const ProposalLinkEmail = ({
  clientName,
  serviceLabel,
  proposalUrl,
  expiresAt,
  personalMessage,
}: ProposalLinkProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {serviceLabel || 'service'} proposal from {SITE_NAME}</Preview>
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
          Thank you for contacting us. We are so pleased you have chosen {SITE_NAME} to
          send you a proposal for your virtual reception / assistant requirements.
        </Text>

        <Text style={text}>
          After our conversation, I'm pleased to say that we can assist you with your
          requirements. We would be honoured to work with you. As discussed, here is the
          link to our proposal for you to review.
        </Text>

        {personalMessage ? (
          <Section style={noteWrap}>
            <Text style={noteText}>{personalMessage}</Text>
          </Section>
        ) : null}

        <Section style={btnWrap}>
          <Button href={proposalUrl} style={btn}>
            View Your Proposal
          </Button>
        </Section>

        <Text style={textSmall}>
          Or copy and paste this link into your browser:<br />
          <a href={proposalUrl} style={link}>{proposalUrl}</a>
        </Text>

        {expiresAt ? (
          <Text style={textSmall}>
            This link will expire on{' '}
            {new Date(expiresAt).toLocaleDateString('en-GB', {
              day: '2-digit', month: 'long', year: 'numeric',
            })}.
          </Text>
        ) : null}

        <Text style={text}>
          If you would like to proceed with signing up but have any questions, you are
          welcome to email me. We can have a FREE 30-minute Discovery Call to discuss your
          requirements and see how we can best help you and your business.{' '}
          <a href="https://calendar.app.google/YrNFetLnzNej3P5q9" style={link}>
            Book a Discovery Call
          </a>.
        </Text>

        <Text style={text}>
          Alternatively, if you are happy after reviewing our proposal and you are happy
          to proceed, select your preferred package, scroll down and click{' '}
          <strong>"Submit and Next,"</strong> review and complete the agreement, and
          scroll down and click <strong>"Agree and Submit."</strong> Once we receive the
          signed agreement, payment, and script information, we can arrange a call to
          discuss the next step.
        </Text>

        <Text style={text}>
          We look forward to making the virtually impossible, possible virtually for you
          today!
        </Text>

        <EmailSignature />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ProposalLinkEmail,
  subject: (d: Record<string, any>) =>
    `Your ${d.serviceLabel || 'service'} proposal from ${SITE_NAME}`,
  displayName: 'Proposal link to customer',
  previewData: {
    clientName: 'Jane Smith',
    serviceLabel: 'Virtual Assistant',
    proposalUrl: 'https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app/proposal/abc123',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    personalMessage: 'As discussed on our call earlier today.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '600px' }
const logo = { marginBottom: '24px' }
const h2 = { fontSize: '18px', fontWeight: 'bold' as const, color: '#1c477a', margin: '0 0 15px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 15px' }
const textSmall = { fontSize: '12px', color: '#55575d', lineHeight: '1.5', margin: '0 0 20px' }
const noteWrap = { backgroundColor: '#f5f7fa', borderLeft: '3px solid #1c477a', padding: '12px 16px', margin: '0 0 20px' }
const noteText = { fontSize: '14px', color: '#1c477a', lineHeight: '1.6', margin: '0', fontStyle: 'italic' as const }
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
