/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as taskAssigned } from './task-assigned.tsx'
import { template as proposalInvoice } from './proposal-invoice.tsx'
import { template as invoiceReminder } from './invoice-reminder.tsx'
import { template as proposalSignedInternal } from './proposal-signed-internal.tsx'
import { template as customerFormLink } from './customer-form-link.tsx'
import { template as formSubmittedInternal } from './form-submitted-internal.tsx'
import { template as proposalLink } from './proposal-link.tsx'
import { template as operatorStatusChange } from './operator-status-change.tsx'
import { template as leadIntroduction } from './lead-introduction.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'task-assigned': taskAssigned,
  'proposal-invoice': proposalInvoice,
  'invoice-reminder': invoiceReminder,
  'proposal-signed-internal': proposalSignedInternal,
  'customer-form-link': customerFormLink,
  'form-submitted-internal': formSubmittedInternal,
  'proposal-link': proposalLink,
  'operator-status-change': operatorStatusChange,
  'lead-introduction': leadIntroduction,
}
