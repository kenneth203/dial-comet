/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code for The VA Team Portal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png" alt="The VA Team" height="40" style={logo} />
        <Heading style={h1}>Confirm your identity</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>This code will expire shortly. If you didn't request this, you can safely ignore this email.</Text>
              <Text style={{fontSize:"11px",color:"#999999",borderTop:"1px solid #eeeeee",paddingTop:"15px",margin:"25px 0 0",textAlign:"center" as const}}>Please do not reply to this email. For any assistance, contact us at <a href="mailto:info@thevateam.co.uk" style={{color:"#b73235",textDecoration:"underline"}}>info@thevateam.co.uk</a>.</Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 25px' }
const codeStyle = { fontFamily: 'Courier, monospace', fontSize: '28px', fontWeight: 'bold' as const, color: '#b73235', margin: '0 0 30px', letterSpacing: '4px' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
