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
import type { TemplateEntry } from './registry.ts'
import { EmailSignature } from './_signature.tsx'

const SITE_NAME = 'The VA Team'
const PORTAL_URL = 'https://portal.thevateam.co.uk'

interface TaskAssignedProps {
  taskTitle?: string
  customerName?: string
  assignedBy?: string
}

const TaskAssignedEmail = ({ taskTitle, customerName, assignedBy }: TaskAssignedProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New task assigned to you{taskTitle ? `: ${taskTitle}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src={`${PORTAL_URL}/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png`}
          alt="The VA Team"
          height="40"
          style={logo}
        />
        <Heading style={h1}>New Task Assigned</Heading>
        <Text style={text}>
          {assignedBy ? `${assignedBy} has assigned` : 'You have been assigned'} a new task
          {taskTitle ? ':' : '.'}
        </Text>
        {taskTitle && <Text style={taskTitleStyle}>{taskTitle}</Text>}
        {customerName && (
          <Text style={detailText}>
            <strong>Customer:</strong> {customerName}
          </Text>
        )}
        <Button style={button} href={`${PORTAL_URL}/tasks`}>
          View Task in Portal
        </Button>
        <Text style={footer}>
          This is an automated notification from {SITE_NAME} Portal.
        </Text>
              <Text style={{fontSize:"11px",color:"#999999",borderTop:"1px solid #eeeeee",paddingTop:"15px",margin:"25px 0 0",textAlign:"center" as const}}>Please do not reply to this email. For any assistance, contact us at <a href="mailto:info@thevateam.co.uk" style={{color:"#b73235",textDecoration:"underline"}}>info@thevateam.co.uk</a>.</Text>
        <EmailSignature />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TaskAssignedEmail,
  subject: (data: Record<string, any>) =>
    data.taskTitle
      ? `Task assigned: ${data.taskTitle}`
      : 'A new task has been assigned to you',
  displayName: 'Task assigned notification',
  previewData: {
    taskTitle: 'Update website content',
    customerName: 'Acme Corp',
    assignedBy: 'Sarah',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Arial, sans-serif" }
const container = { padding: '30px 25px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 15px' }
const taskTitleStyle = {
  fontSize: '16px',
  fontWeight: 'bold' as const,
  color: '#b73235',
  margin: '0 0 15px',
  padding: '12px 16px',
  backgroundColor: '#fdf2f2',
  borderRadius: '6px',
  borderLeft: '4px solid #b73235',
}
const detailText = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 20px' }
const button = {
  backgroundColor: '#b73235',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '6px',
  padding: '12px 24px',
  textDecoration: 'none',
  fontWeight: 'bold' as const,
  marginTop: '10px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
