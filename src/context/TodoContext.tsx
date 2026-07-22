import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

export type TaskPriority = 'high' | 'medium' | 'low';

export type Task = {
  id: string;
  text: string;
  done: boolean;
  assigneeId: string;
  customerId: string;
  isInternal?: boolean;
  notes?: string;
  priority?: TaskPriority | null;
  createdAt: string;
  updatedAt: string;
};

interface TodoContextType {
  tasks: Task[];
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  toggleTask: (id: string, checked: boolean) => void;
  removeTask: (id: string) => void;
  updateTask: (id: string, updates: Partial<Pick<Task, 'text' | 'notes' | 'priority' | 'assigneeId'>>) => void;
  addTaskNote: (id: string, body: string, authorName: string) => Promise<boolean>;
  updateTaskNote: (id: string, noteCreatedAt: string, body: string) => Promise<boolean>;
  isLoading: boolean;
}

const TodoContext = createContext<TodoContextType | undefined>(undefined);

const mapTodoRowToTask = (row: any): Task => ({
  id: row.id,
  text: row.text,
  done: row.completed || row.done || false,
  assigneeId: row.assignee_id || '',
  customerId: row.customer_id || '',
  isInternal: row.is_internal || false,
  notes: row.notes || '',
  priority: (row.priority as TaskPriority) || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function TodoProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const reloadTimerRef = useRef<number | null>(null);

  const loadTasks = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading tasks:', error);
        return;
      }

      setTasks((data || []).map(mapTodoRowToTask));
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const scheduleReload = useCallback((delayMs = 250) => {
    if (reloadTimerRef.current !== null) {
      window.clearTimeout(reloadTimerRef.current);
    }

    reloadTimerRef.current = window.setTimeout(() => {
      reloadTimerRef.current = null;
      void loadTasks();
    }, delayMs);
  }, [loadTasks]);

  // Load tasks from Supabase
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    loadTasks();

    const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`todos_changes-${user.id}-${uniqueId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'todos' }, (payload) => {
        const t = mapTodoRowToTask(payload.new);
        setTasks(prev => prev.some(x => x.id === t.id) ? prev : [t, ...prev]);
        scheduleReload();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'todos' }, (payload) => {
        const t = mapTodoRowToTask(payload.new);
        setTasks(prev => {
          const exists = prev.some(x => x.id === t.id);
          return exists ? prev.map(x => x.id === t.id ? t : x) : [t, ...prev];
        });
        scheduleReload();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'todos' }, (payload) => {
        const removedId = (payload.old as any)?.id;
        if (!removedId) return;
        setTasks(prev => prev.filter(x => x.id !== removedId));
        scheduleReload();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          scheduleReload(0);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleReload(1000);
        }
      })

    const onVisible = () => { if (document.visibilityState === 'visible') scheduleReload(0); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    const poll = window.setInterval(() => scheduleReload(0), 15000);

    return () => {
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      window.clearInterval(poll);
    };
  }, [user, loadTasks, scheduleReload]);

  const addTask = async (taskData: Omit<Task, 'id' | 'createdAt'>) => {
    if (!user) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nowIso = new Date().toISOString();
    const optimistic: Task = {
      id: tempId,
      text: taskData.text,
      done: taskData.done,
      assigneeId: taskData.assigneeId || '',
      customerId: taskData.customerId || '',
      isInternal: taskData.isInternal || false,
      notes: taskData.notes || '',
      priority: taskData.priority ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setTasks(prev => [optimistic, ...prev]);

    try {
      const insertData: any = {
        user_id: user.id,
        text: taskData.text,
        completed: taskData.done,
        assignee_id: taskData.assigneeId || null,
        is_internal: taskData.isInternal || false,
        notes: taskData.notes || '',
        priority: taskData.priority || null,
      };

      if (taskData.customerId && taskData.customerId.trim() !== '') {
        insertData.customer_id = taskData.customerId;
      }

      const { data, error } = await (supabase
        .from('todos') as any)
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error adding task:', error);
        setTasks(prev => prev.filter(t => t.id !== tempId));
        return;
      }

      const newTask: Task = {
        id: data.id,
        text: data.text,
        done: data.completed || false,
        assigneeId: data.assignee_id || null,
        customerId: data.customer_id || null,
        isInternal: data.is_internal || false,
        notes: data.notes || '',
        priority: (data.priority as TaskPriority) || null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      setTasks(prev => {
        const withoutTemp = prev.filter(t => t.id !== tempId);
        return withoutTemp.some(t => t.id === newTask.id) ? withoutTemp : [newTask, ...withoutTemp];
      });
    } catch (error) {
      console.error('Error adding task:', error);
      setTasks(prev => prev.filter(t => t.id !== tempId));
    }
  };

  const toggleTask = async (id: string, checked: boolean) => {
    const snapshot = tasks;
    // Optimistic update so the UI feels instant.
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, done: checked } : t)));
    try {
      // Use a SECURITY DEFINER RPC so any authenticated team member can close
      // a Daily Handover task they can see, regardless of who created or was
      // assigned. The RPC returns the updated row so we can confirm the write
      // actually persisted (PostgREST silently ignores RLS-blocked updates,
      // which previously caused the task to "flicker" then reappear after the
      // next realtime/poll refresh).
      const { data, error } = await (supabase as any).rpc('set_todo_completed', {
        p_id: id,
        p_completed: checked,
      });
      if (error || !data) {
        console.error('Error updating task:', error);
        setTasks(snapshot);
        return;
      }
      const updated = mapTodoRowToTask(data);
      setTasks(prev => prev.map(t => (t.id === id ? updated : t)));
    } catch (error) {
      console.error('Error updating task:', error);
      setTasks(snapshot);
    }
  };

  const removeTask = async (id: string) => {
    const snapshot = tasks;
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      const { error } = await supabase
        .from('todos')
        .delete()
        .eq('id', id);
      if (error) {
        console.error('Error deleting task:', error);
        setTasks(snapshot);
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      setTasks(snapshot);
    }
  };

  const updateTask = async (id: string, updates: Partial<Pick<Task, 'text' | 'notes' | 'priority' | 'assigneeId'>>) => {
    const snapshot = tasks;
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t)));
    try {
      const dbUpdates: Record<string, any> = { ...updates };
      if ('assigneeId' in updates) {
        dbUpdates.assignee_id = updates.assigneeId || null;
        delete dbUpdates.assigneeId;
      }
      const { error } = await supabase
        .from('todos')
        .update(dbUpdates as any)
        .eq('id', id);
      if (error) {
        console.error('Error updating task:', error);
        setTasks(snapshot);
      }
    } catch (error) {
      console.error('Error updating task:', error);
      setTasks(snapshot);
    }
  };

  const addTaskNote = async (id: string, body: string, authorName: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { data, error } = await (supabase as any).rpc('append_todo_note', {
        p_task_id: id,
        p_body: body,
        p_author_name: authorName,
      });
      if (error) {
        console.error('Error adding task note:', error);
        return false;
      }
      setTasks(prev => prev.map(t => t.id === id ? { ...t, notes: data || t.notes || '', updatedAt: new Date().toISOString() } : t));
      await loadTasks();
      return true;
    } catch (error) {
      console.error('Error adding task note:', error);
      return false;
    }
  };

  const updateTaskNote = async (id: string, noteCreatedAt: string, body: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { data, error } = await (supabase as any).rpc('update_todo_note_body', {
        p_task_id: id,
        p_note_created_at: noteCreatedAt,
        p_body: body,
      });
      if (error) {
        console.error('Error updating task note:', error);
        return false;
      }
      setTasks(prev => prev.map(t => t.id === id ? { ...t, notes: data || '', updatedAt: new Date().toISOString() } : t));
      await loadTasks();
      return true;
    } catch (error) {
      console.error('Error updating task note:', error);
      return false;
    }
  };

  return (
    <TodoContext.Provider value={{ tasks, addTask, toggleTask, removeTask, updateTask, addTaskNote, updateTaskNote, isLoading }}>
      {children}
    </TodoContext.Provider>
  );
}

export function useTodo() {
  const context = useContext(TodoContext);
  if (context === undefined) {
    throw new Error('useTodo must be used within a TodoProvider');
  }
  return context;
}