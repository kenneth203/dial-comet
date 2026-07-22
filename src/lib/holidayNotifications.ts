import { supabase } from '@/integrations/supabase/client';

/**
 * Sends notifications to the appropriate approver groups when a holiday request is created.
 */
export async function notifyHolidayApprovers(params: {
  requestId: string;
  requesterUserId: string;
  requesterName: string;
  absenceType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
}) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', params.requesterUserId)
      .single();

    if (!profile) return;

    const requesterRole = profile.role;

    let targetRoles: Array<'Admin' | 'HR' | 'Operator' | 'Super-Admin' | 'Supervisor'> = [];
    if (requesterRole === 'Operator') {
      targetRoles = ['Supervisor', 'Super-Admin'];
    } else if (requesterRole === 'Supervisor') {
      targetRoles = ['Super-Admin'];
    } else if (requesterRole === 'Admin' || requesterRole === 'HR') {
      targetRoles = ['Super-Admin'];
    } else if (requesterRole === 'Super-Admin') {
      targetRoles = ['Super-Admin'];
    } else {
      return;
    }

    const { data: approvers } = await supabase
      .from('profiles')
      .select('user_id, name, role')
      .in('role', targetRoles)
      .neq('status', 'Suspended')
      .neq('user_id', params.requesterUserId);

    if (!approvers || approvers.length === 0) return;

    const absenceLabel = params.absenceType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    const title = `Holiday Approval Required [${requesterRole}]: ${params.requesterName} - ${absenceLabel} (${params.totalDays} day${params.totalDays !== 1 ? 's' : ''})`;

    // Use SECURITY DEFINER RPC — direct insert into task_notifications is blocked
    // by RLS for non-admin requesters (e.g. Operators notifying Super-Admins).
    const results = await Promise.all(
      approvers.map(approver =>
        (supabase.rpc as any)('create_task_notification', {
          p_recipient_id: approver.user_id,
          p_task_id: null, // holiday requests aren't project_tasks; FK would reject the insert
          p_message: title,
          p_type: 'holiday_approval',
          p_related_id: params.requestId,
        })
      )
    );

    results.forEach(({ error }) => {
      if (error) console.error('Error sending holiday approval notification:', error);
    });

  } catch (error) {
    console.error('Error in notifyHolidayApprovers:', error);
  }
}

/**
 * Notifies the requester when their holiday request has been approved or declined.
 */
export async function notifyHolidayRequester(params: {
  requesterUserId: string;
  decision: 'approved' | 'declined';
  absenceType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string;
}) {
  try {
    if (!params.requesterUserId) return;

    const absenceLabel = params.absenceType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    const verb = params.decision === 'approved' ? 'Approved' : 'Declined';
    const dayLabel = `${params.totalDays} day${params.totalDays !== 1 ? 's' : ''}`;
    const base = `Holiday ${verb}: ${absenceLabel} (${dayLabel}) ${params.startDate} → ${params.endDate}`;
    const message = params.decision === 'declined' && params.reason
      ? `${base} - Reason: ${params.reason}`
      : base;

    const { error } = await (supabase.rpc as any)('create_task_notification', {
      p_recipient_id: params.requesterUserId,
      p_task_id: null,
      p_message: message,
      p_type: params.decision === 'approved' ? 'holiday_approved' : 'holiday_declined',
    });

    if (error) console.error('Error sending holiday decision notification:', error);
  } catch (error) {
    console.error('Error in notifyHolidayRequester:', error);
  }
}
