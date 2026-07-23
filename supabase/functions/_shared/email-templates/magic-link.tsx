/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your login link for The VA Team Portal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png" alt="The VA Team" height="40" style={logo} />
        <Heading style={h1}>Your login link</Heading>
        <Text style={text}>Click the button below to log in to The VA Team Portal. This link will expire shortly.</Text>
        <Button style={button} href={confirmationUrl}>Log In</Button>
        <Text style={footer}>If you didn't request this link, you can safely ignore this email.</Text>
              <Text style={{fontSize:"11px",color:"#999999",borderTop:"1px solid #eeeeee",paddingTop:"15px",margin:"25px 0 0",textAlign:"center" as const}}>Please do not reply to this email. For any assistance, contact us at <a href="mailto:info@thevateam.co.uk" style={{color:"#b73235",textDecoration:"underline"}}>info@thevateam.co.uk</a>.</Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 25px' }
const button = { backgroundColor: '#b73235', color: '#ffffff', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
