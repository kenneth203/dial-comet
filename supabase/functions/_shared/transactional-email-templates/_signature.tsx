/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Hr, Section, Text } from 'npm:@react-email/components@0.0.22'

export const EmailSignature = () => (
  <Section style={wrap}>
    <Hr style={hr} />
    <Text style={sig}>Yours sincerely,</Text>
    <Text style={sigName}>Kenneth Pote</Text>
    <Text style={sigCompany}>The VA Team Limited</Text>
    <Text style={sigLine}>Phone: 0203 474 0859</Text>
    <Text style={sigLine}>
      Email: <a href="mailto:info@thevateam.co.uk" style={link}>info@thevateam.co.uk</a>
    </Text>
    <Text style={sigLine}>
      Website: <a href="https://www.thevateam.co.uk" style={link}>https://www.thevateam.co.uk</a>
    </Text>
    <Hr style={hr} />
    <Text style={disclaimer}>
      IMPORTANT: The contents of this email and any attachments are confidential. They are
      intended for the named recipient(s) only. If you have received this email by mistake,
      please notify the sender immediately and do not disclose the contents to anyone or
      make copies thereof.
    </Text>
  </Section>
)

const wrap = { margin: '32px 0 0' }
const hr = { borderColor: '#e5e7eb', margin: '16px 0' }
const sig = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 4px' }
const sigName = { fontSize: '14px', color: '#1c477a', fontWeight: 'bold' as const, lineHeight: '1.5', margin: '0' }
const sigCompany = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 8px' }
const sigLine = { fontSize: '13px', color: '#55575d', lineHeight: '1.5', margin: '0' }
const link = { color: '#1c477a', textDecoration: 'none' }
const disclaimer = { fontSize: '11px', color: '#999999', lineHeight: '1.5', margin: '8px 0 0', fontStyle: 'italic' as const }
