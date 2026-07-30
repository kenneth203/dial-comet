import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { calculateTaskCost } from '@/lib/taskBilling';

export type TMStatus = "new_task" | "pending" | "in_progress" | "completed";
export type TMPriority = "high" | "medium" | "low";
export type TMTask = {
  id: string;
  title: string;
  assigneeId: string;
  customerId: string;
  status: TMStatus;
  priority?: TMPriority | null;
  startTime?: number;
  endTime?: number;
  totalTime?: number;
  billableTime?: number;
  isTimerRunning?: boolean;
  cost?: number;
  notes?: string;
  isInternal?: boolean;
  serviceCategory?: 'VA' | 'DT';
  invoicedAt?: string;
  invoicedPeriod?: string;
};

interface TasksContextType {
  tasks: TMTask[];
  addTask: (task: Omit<TMTask, 'id'>) => Promise<string | null>;
  updateTaskStatus: (id: string, status: TMStatus) => void;
  updateTaskAssignee: (id: string, assigneeId: string) => void;
  updateTaskCustomer: (id: string, customerId: string, hourlyRate?: number) => void;
  updateTaskTitle: (id: string, title: string) => void;
  updateTaskPriority: (id: string, priority: TMPriority | null) => void;
  removeTask: (id: string) => void;
  startTimer: (id: string) => void;
  stopTimer: (id: string, hourlyRate: number) => void;
  updateTaskTimer: (id: string, data: Partial<Pick<TMTask, 'startTime' | 'endTime' | 'totalTime' | 'isTimerRunning' | 'cost'>>) => void;
  updateTaskNotes: (id: string, notes: string) => void;
  updateTaskTime: (id: string, totalTime: number, billableTime: number, hourlyRate?: number) => void;
  updateTaskServiceCategory: (id: string, category: 'VA' | 'DT') => void;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

const RUNNING_TIMERS_STORAGE_KEY = 'va-team-running-task-timers';

// Helper to access the project_tasks table (not yet in generated types)
const projectTasksTable = () => supabase.from('project_tasks' as any);

const readRunningTimers = (): Record<string, { startTime: number }> => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(RUNNING_TIMERS_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeRunningTimers = (timers: Record<string, { startTime: number }>) => {
  if (typeof window === 'undefined') return;

  if (Object.keys(timers).length === 0) {
    window.localStorage.removeItem(RUNNING_TIMERS_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(RUNNING_TIMERS_STORAGE_KEY, JSON.stringify(timers));
};

const setRunningTimer = (taskId: string, startTime: number) => {
  const timers = readRunningTimers();
  timers[taskId] = { startTime };
  writeRunningTimers(timers);
};

const clearRunningTimer = (taskId: string) => {
  const timers = readRunningTimers();
  delete timers[taskId];
  writeRunningTimers(timers);
};

const normalizeTaskStatus = (status: string): TMStatus => {
  if (status === 'new_task' || status === 'pending' || status === 'in_progress' || status === 'completed') {
    return status;
  }

  return 'pending';
};

// Map DB row to TMTask
function rowToTask(row: any, runningTimers: Record<string, { startTime: number }> = {}): TMTask {
  const persistedTimer = runningTimers[row.id];
  const totalTime = row.time_spent !== null && row.time_spent !== undefined ? Number(row.time_spent) : 0;
  const customerId = row.customer_id ?? '';
  const isInternal = Boolean(row.is_internal) && !customerId;

  return {
    id: row.id,
    title: row.title,
    assigneeId: row.assignee_id ?? '',
    customerId,
    status: normalizeTaskStatus(row.status),
    priority: (row.priority === 'high' || row.priority === 'medium' || row.priority === 'low') ? row.priority : null,
    startTime: persistedTimer?.startTime,
    totalTime,
    billableTime: totalTime,
    isTimerRunning: Boolean(persistedTimer),
    notes: Array.isArray(row.comments)
      ? row.comments.map((entry: any) => (typeof entry === 'string' ? entry : entry?.text || '')).filter(Boolean).join('\n')
      : undefined,
    isInternal,
    serviceCategory: (row.service_category === 'DT' ? 'DT' : 'VA'),
    invoicedAt: row.invoiced_at ?? undefined,
    invoicedPeriod: row.invoiced_period ?? undefined,
  };
}

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<TMTask[]>([]);
  const { user } = useAuth();

  const commentsFromNotes = (notes?: string | null) => {
    if (!notes?.trim()) return [];
    return notes
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(text => ({ text, createdAt: new Date().toISOString() }));
  };

  const loadTasks = useCallback(async () => {
    const { data, error } = await projectTasksTable()
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const runningTimers = readRunningTimers();
      const validTaskIds = new Set((data as any[]).map(row => row.id));
      const filteredTimers = Object.fromEntries(
        Object.entries(runningTimers).filter(([taskId]) => validTaskIds.has(taskId))
      );

      if (Object.keys(filteredTimers).length !== Object.keys(runningTimers).length) {
        writeRunningTimers(filteredTimers);
      }

      setTasks((data as any[]).map(row => rowToTask(row, filteredTimers)));
    } else if (error) {
      console.error('Error loading tasks:', error);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadTasks();

    const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`project_tasks_changes-${user.id}-${uniqueId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_tasks' }, (payload) => {
        const runningTimers = readRunningTimers();
        const newTask = rowToTask(payload.new, runningTimers);
        setTasks(prev => prev.some(t => t.id === newTask.id) ? prev : [newTask, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'project_tasks' }, (payload) => {
        const runningTimers = readRunningTimers();
        const updated = rowToTask(payload.new, runningTimers);
        setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated, startTime: t.startTime ?? updated.startTime, isTimerRunning: t.isTimerRunning || updated.isTimerRunning } : t));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'project_tasks' }, (payload) => {
        const removedId = (payload.old as any)?.id;
        if (!removedId) return;
        setTasks(prev => prev.filter(t => t.id !== removedId));
      })
      .subscribe();

    const onVisible = () => { if (document.visibilityState === 'visible') loadTasks(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', loadTasks);
    const poll = window.setInterval(loadTasks, 45000);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', loadTasks);
      window.clearInterval(poll);
    };
  }, [user, loadTasks]);

  const addTask = async (taskData: Omit<TMTask, 'id'>): Promise<string | null> => {
    if (!user) return null;
    const insertData: any = {
      title: taskData.title,
      assignee_id: taskData.assigneeId,
      status: taskData.status,
      is_internal: taskData.isInternal ?? false,
      service_category: taskData.serviceCategory === 'DT' ? 'DT' : 'VA',
      comments: commentsFromNotes(taskData.notes),
      created_by: user.id,
    };
    if (taskData.priority) {
      insertData.priority = taskData.priority;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (taskData.customerId && uuidRegex.test(taskData.customerId)) {
      insertData.customer_id = taskData.customerId;
    }

    // Optimistic: insert a temporary row so the UI feels instant
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticTask: TMTask = { ...(taskData as TMTask), id: tempId };
    setTasks(prev => [optimisticTask, ...prev]);

    const { data, error } = await projectTasksTable().insert(insertData).select();
    if (error) {
      console.error('Error adding task:', error);
      setTasks(prev => prev.filter(t => t.id !== tempId));
      return null;
    }
    if (data && data.length > 0) {
      const newTask = rowToTask(data[0], readRunningTimers());
      setTasks(prev => {
        const withoutTemp = prev.filter(t => t.id !== tempId);
        return withoutTemp.some(t => t.id === newTask.id) ? withoutTemp : [newTask, ...withoutTemp];
      });
      return newTask.id;
    }
    setTasks(prev => prev.filter(t => t.id !== tempId));
    return null;
  };

  const updateTaskStatus = async (id: string, status: TMStatus) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    const { error } = await projectTasksTable().update({ status }).eq('id', id);
    if (error) {
      console.error('Error updating task status:', error);
      loadTasks();
      throw error;
    }
  };

  const updateTaskAssignee = async (id: string, assigneeId: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, assigneeId } : t));
    const { error } = await projectTasksTable().update({ assignee_id: assigneeId }).eq('id', id);
    if (error) { console.error('Error updating assignee:', error); loadTasks(); return; }

    try {
      const task = tasks.find(t => t.id === id);
      const { data: assigneeData } = await supabase
        .from('comprehensive_users')
        .select('email, name')
        .eq('id', assigneeId)
        .maybeSingle();

      let assignerName = 'Someone';
      if (user) {
        const { data: assignerData } = await supabase
          .from('comprehensive_users')
          .select('name')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (assignerData?.name) assignerName = assignerData.name;
      }

      let customerName = '';
      if (task?.customerId) {
        const { data: directory } = await (supabase.rpc('get_customer_directory' as any) as any);
        const customerData = ((directory ?? []) as any[]).find((c) => c.id === task.customerId);
        if (customerData?.name) customerName = customerData.name;
      }

      if (assigneeData?.email) {
        await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'task-assigned',
            recipientEmail: assigneeData.email,
            idempotencyKey: `task-assigned-${id}-${assigneeId}-${Date.now()}`,
            templateData: {
              taskTitle: task?.title || 'Untitled Task',
              customerName: customerName || undefined,
              assignedBy: assignerName,
            },
          },
        });
      }
    } catch (emailError) {
      console.error('Failed to send task assignment email:', emailError);
    }
  };

  const updateTaskCustomer = async (id: string, customerId: string) => {
    const safeCustomerId = customerId || null;
    setTasks(prev => prev.map(t => t.id === id ? {
      ...t,
      customerId: safeCustomerId ?? '',
      isInternal: safeCustomerId ? false : t.isInternal,
    } : t));

    const updates: Record<string, unknown> = { customer_id: safeCustomerId };
    if (safeCustomerId) {
      updates.is_internal = false;
    }

    const { error } = await projectTasksTable().update(updates).eq('id', id);
    if (error) { console.error('Error updating customer:', error); loadTasks(); }
  };

  const updateTaskTitle = async (id: string, title: string) => {
    const { error } = await projectTasksTable().update({ title }).eq('id', id);
    if (error) console.error('Error updating title:', error);
  };

  const updateTaskPriority = async (id: string, priority: TMPriority | null) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, priority } : t));
    const { error } = await projectTasksTable().update({ priority }).eq('id', id);
    if (error) { console.error('Error updating priority:', error); loadTasks(); }
  };

  const removeTask = async (id: string) => {
    clearRunningTimer(id);
    // Optimistic removal so the UI updates instantly
    const prevTasks = tasks;
    setTasks(prev => prev.filter(t => t.id !== id));
    const { error, count } = await projectTasksTable().delete({ count: 'exact' }).eq('id', id);
    if (error || count === 0) {
      if (error) console.error('Error removing task:', error);
      setTasks(prevTasks); // revert on failure or when RLS blocked the delete
      try {
        const { toast } = await import('sonner');
        toast.error("You don't have permission to delete this task.");
      } catch {}
    }
  };

  const startTimer = async (id: string) => {
    const now = Date.now();
    setRunningTimer(id, now);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, isTimerRunning: true, startTime: now, status: 'in_progress' as TMStatus } : t));

    const { error } = await projectTasksTable().update({ status: 'in_progress' }).eq('id', id);
    if (error) {
      clearRunningTimer(id);
      console.error('Error starting timer:', error);
      loadTasks();
    }
  };

  const stopTimer = async (id: string, hourlyRate: number) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const persistedTimers = readRunningTimers();
    const startTime = task.startTime ?? persistedTimers[id]?.startTime;
    const elapsed = startTime ? Math.max(0, Math.floor((Date.now() - startTime) / 1000)) : 0;
    const newTotalTime = Math.max(0, (task.totalTime || 0) + elapsed);
    const billableTime = newTotalTime;
    const cost = calculateTaskCost(billableTime, hourlyRate);

    clearRunningTimer(id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, totalTime: newTotalTime, billableTime, cost, isTimerRunning: false, startTime: undefined } : t));

    const { error } = await projectTasksTable().update({ time_spent: newTotalTime }).eq('id', id);
    if (error) {
      if (startTime) setRunningTimer(id, startTime);
      console.error('Error stopping timer:', error);
      loadTasks();
    }
  };

  const updateTaskTimer = async (id: string, data: Partial<Pick<TMTask, 'startTime' | 'endTime' | 'totalTime' | 'isTimerRunning' | 'cost'>>) => {
    if (data.isTimerRunning && data.startTime) {
      setRunningTimer(id, data.startTime);
    }

    if (data.isTimerRunning === false) {
      clearRunningTimer(id);
    }

    if (data.totalTime === undefined) return;
    const { error } = await projectTasksTable().update({ time_spent: data.totalTime }).eq('id', id);
    if (error) console.error('Error updating timer:', error);
  };

  const updateTaskNotes = async (id: string, notes: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, notes } : t));
    const { error } = await projectTasksTable().update({ comments: commentsFromNotes(notes) }).eq('id', id);
    if (error) { console.error('Error updating notes:', error); loadTasks(); }
  };

  const updateTaskTime = async (id: string, totalTime: number, billableTime: number, hourlyRate: number = 50) => {
    const cost = calculateTaskCost(billableTime, hourlyRate);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, totalTime, billableTime, cost } : t));
    const { error } = await projectTasksTable().update({ time_spent: totalTime }).eq('id', id);
    if (error) console.error('Error updating time:', error);
  };

  const updateTaskServiceCategory = async (id: string, category: 'VA' | 'DT') => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, serviceCategory: category } : t));
    const { error } = await projectTasksTable().update({ service_category: category }).eq('id', id);
    if (error) { console.error('Error updating service category:', error); loadTasks(); }
  };

  return (
    <TasksContext.Provider value={{
      tasks,
      addTask,
      updateTaskStatus,
      updateTaskAssignee,
      updateTaskCustomer,
      updateTaskTitle,
      updateTaskPriority,
      removeTask,
      startTimer,
      stopTimer,
      updateTaskTimer,
      updateTaskNotes,
      updateTaskTime,
      updateTaskServiceCategory,
    }}>

      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TasksProvider');
  }
  return context;
}
