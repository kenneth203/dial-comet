import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { toast } from 'sonner';


export interface TaskNotification {
  id: string;
  user_id: string;
  task_id: string | null;
  related_id?: string | null;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcCaller = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;
type NotificationPayload = Partial<TaskNotification>;

const isHolidayDecisionNotification = (notification: Pick<TaskNotification, 'type' | 'message'>) => {
  const type = (notification.type || '').toLowerCase();
  const message = (notification.message || '').toLowerCase();
  return type === 'holiday_approved' || type === 'holiday_declined' ||
    message.startsWith('holiday approved') || message.startsWith('holiday declined');
};

const CLOSED_CHECKLIST_STATUSES = new Set(['completed', 'skipped', 'not_applicable']);

const hasChecklistDueTimePassed = (row: { task_date?: string | null; due_time?: string | null }) => {
  if (!row.task_date || !row.due_time) return false;
  const dueAt = new Date(`${row.task_date}T${row.due_time}`);
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() <= Date.now();
};

async function findStaleNotificationIds(notifications: TaskNotification[]) {
  const checks = await Promise.all(
    notifications.map(async (n) => {
      const type = (n.type || '').toLowerCase();

      if (n.related_id) {
        const { data } = await supabase
          .from('checklist_instances')
          .select('id,status,task_date,due_time')
          .eq('id', n.related_id)
          .maybeSingle();

        if (!data) return type === 'checklist_reminder' ? n.id : null;
        const checklist = data as any;
        if (CLOSED_CHECKLIST_STATUSES.has(String(checklist.status))) return n.id;
        if (type === 'checklist_reminder' && hasChecklistDueTimePassed(checklist)) return n.id;
      }

      if (!n.task_id) return null;

      const [{ data: projectTask }, { data: todo }, { data: checklist }] = await Promise.all([
        supabase.from('project_tasks').select('id,status').eq('id', n.task_id).maybeSingle(),
        supabase.from('todos').select('id,completed').eq('id', n.task_id).maybeSingle(),
        supabase.from('checklist_instances').select('id,status,task_date,due_time').eq('id', n.task_id).maybeSingle(),
      ]);

      if ((projectTask as any)?.status === 'completed') return n.id;
      if ((todo as any)?.completed === true) return n.id;
      if (checklist) {
        const checklistRow = checklist as any;
        if (CLOSED_CHECKLIST_STATUSES.has(String(checklistRow.status))) return n.id;
        if (type === 'checklist_reminder' && hasChecklistDueTimePassed(checklistRow)) return n.id;
      }

      return null;
    }),
  );

  return checks.filter((id): id is string => Boolean(id));
}

export function useTaskNotifications() {
  const auth = useAuth();
  const user = auth?.user ?? null;
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      let typed = (data || []) as unknown as TaskNotification[];

      // Auto-cleanup stale holiday approval notifications: if there are no
      // pending holiday requests visible to this user, mark any unread
      // "holiday_approval" notifications as read so they don't linger after
      // the underlying request was deleted, approved, or declined elsewhere.
      const staleApprovals = typed.filter(
        n => !n.is_read && (n.type === 'holiday_approval' ||
          (n.message || '').toLowerCase().includes('holiday approval required'))
      );
      if (staleApprovals.length > 0) {
        const { count } = await supabase
          .from('holiday_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        if ((count ?? 0) === 0) {
          const staleIds = staleApprovals.map(n => n.id);
          await supabase
            .from('task_notifications')
            .update({ is_read: true })
            .in('id', staleIds);
          typed = typed.map(n => staleIds.includes(n.id) ? { ...n, is_read: true } : n);
        }
      }

      const staleIds = await findStaleNotificationIds(typed.filter(n => !n.is_read));
      if (staleIds.length > 0) {
        await supabase
          .from('task_notifications')
          .update({ is_read: true })
          .in('id', staleIds)
          .eq('user_id', user.id);
        typed = typed.map(n => staleIds.includes(n.id) ? { ...n, is_read: true } : n);
      }

      const visible = typed.filter(n => !n.is_read || !isHolidayDecisionNotification(n));
      setNotifications(visible);
      setUnreadCount(visible.filter(n => !n.is_read).length);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const markAsRead = useCallback(async (notificationId: string) => {
    const { error } = await supabase
      .from('task_notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (!error) {
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from('task_notifications')
      .update({ is_read: true })
      .in('id', unreadIds);

    if (!error) {
      setNotifications(prev =>
        prev.map(n => !n.is_read ? { ...n, is_read: true } : n)
      );
      setUnreadCount(0);
    }
  }, [user, notifications]);

  const createNotification = useCallback(async (params: {
    taskTitle: string;
    taskId: string;
    customerName?: string;
    assigneeName?: string;
    assigneeSystemUserId?: string;
  }) => {
    if (!user) return;
    if (!params.assigneeSystemUserId) return;

    // Resolve the assignee + insert the notification server-side. RLS on
    // system_users / comprehensive_users blocks non-admin assigners from
    // looking up the recipient on the client, which previously caused the
    // notification to be silently skipped. The RPC is SECURITY DEFINER.
    const rpc = supabase.rpc as unknown as RpcCaller;
    const { error } = await rpc('notify_task_assignment', {
      p_assignee_id: params.assigneeSystemUserId,
      p_task_id: params.taskId,
      p_message: params.taskTitle,
      p_type: 'task_assigned',
    });

    if (error) {
      console.error('Error creating task assignment notification:', error);
      toast.error('Could not notify the assignee — please try again.');
    } else {
      fetchNotifications();
    }
  }, [user, fetchNotifications]);


  // Initial load — realtime subscription below keeps us in sync after that
  useEffect(() => {
    if (!user) return;
    fetchNotifications();
  }, [user, fetchNotifications]);

  // Safety-net refresh on tab focus / interval (in case realtime drops)
  useAutoRefresh(() => { fetchNotifications(); });



  // Listen for realtime inserts
  useEffect(() => {
    if (!user) return;

    const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channelName = `task-notifs-${user.id}-${uniqueId}`;
    let isMounted = true;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          void (async () => {
            if (!isMounted) return;
            const newNotif = payload.new as NotificationPayload;
            if (newNotif.user_id !== user.id) return;
            if (!newNotif.id || !newNotif.user_id || !newNotif.created_at) return;
            const mapped: TaskNotification = {
              id: newNotif.id,
              user_id: newNotif.user_id,
              task_id: newNotif.task_id ?? null,
              related_id: (newNotif as any).related_id ?? null,
              message: newNotif.message ?? '',
              type: newNotif.type ?? '',
              is_read: Boolean(newNotif.is_read),
              created_at: newNotif.created_at,
            };
            if (mapped.is_read && isHolidayDecisionNotification(mapped)) return;
            const staleIds = await findStaleNotificationIds([mapped]);
            if (staleIds.length > 0) {
              await supabase
                .from('task_notifications')
                .update({ is_read: true })
                .eq('id', mapped.id)
                .eq('user_id', user.id);
              return;
            }
            setNotifications(prev => {
              if (prev.some(n => n.id === mapped.id)) return prev;
              return [mapped, ...prev];
            });
            setUnreadCount(prev => prev + 1);
          })();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'task_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!isMounted) return;
          const updated = payload.new as NotificationPayload;
          if (!updated.id) return;
          setNotifications(prev => {
            const next = prev.map(n => {
              if (n.id !== updated.id) return n;
              const updatedNotification = { ...n, is_read: Boolean(updated.is_read) };
              return updatedNotification.is_read && isHolidayDecisionNotification(updatedNotification) ? null : updatedNotification;
            }).filter((n): n is TaskNotification => n !== null);
            const unread = next.filter(n => !n.is_read).length;
            setUnreadCount(unread);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const createMentionNotifications = useCallback(async (params: {
    taskTitle: string;
    taskId: string;
    customerName?: string;
    mentionedSystemUserIds: string[];
  }) => {
    if (!user) return;

    for (const systemUserId of params.mentionedSystemUserIds) {
      let recipientAuthId: string | null = null;
      const { data: sysUser } = await supabase
        .from('system_users')
        .select('user_id')
        .eq('id', systemUserId)
        .maybeSingle();
      const systemUser = sysUser as { user_id?: string | null } | null;
      if (systemUser?.user_id) {
        recipientAuthId = systemUser.user_id;
      } else {
        const { data: userData } = await supabase
          .from('comprehensive_users')
          .select('auth_user_id')
          .eq('id', systemUserId)
          .maybeSingle();
        recipientAuthId = userData?.auth_user_id ?? null;
      }

      if (!recipientAuthId) continue;
      if (recipientAuthId === user.id) continue;

      const rpc = supabase.rpc as unknown as RpcCaller;
      await rpc('create_task_notification', {
        p_recipient_id: recipientAuthId,
        p_task_id: params.taskId,
        p_message: `You were mentioned in: ${params.taskTitle}`,
        p_type: 'mention',
      });
    }
  }, [user]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    createNotification,
    createMentionNotifications,
    refetch: fetchNotifications,
  };
}
