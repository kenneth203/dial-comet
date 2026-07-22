import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { useUsers } from "@/context/UsersContext";
import { useTodo } from "@/context/TodoContext";
import { useCustomers } from "@/context/CustomersContext";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { asPromise } from "@/lib/supabaseRpc";
import { Edit, Save, X, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const parseAssigneeIds = (raw: string | null | undefined): string[] =>
  (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);

type Priority = 'high' | 'medium' | 'low';

const getPriority = (updatedAt: string, done: boolean, manual?: Priority | null): Priority => {
  if (done) return 'low';
  if (manual === 'high' || manual === 'medium' || manual === 'low') return manual;
  const hoursAgo = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60);
  if (hoursAgo >= 48) return 'high';
  if (hoursAgo >= 24) return 'medium';
  return 'low';
};

const PRIORITY_META: Record<Priority, { label: string; text: string }> = {
  high:   { label: 'High Priority',   text: 'text-[#b73235]' },
  medium: { label: 'Medium Priority', text: 'text-amber-600' },
  low:    { label: 'Low Priority',    text: 'text-[#1c477a]' },
};

const formatDueLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(d); target.setHours(0,0,0,0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000*60*60*24));
  if (diffDays === 0) return 'Due Today';
  if (diffDays === -1) return 'Due Yesterday';
  if (diffDays === 1) return 'Due Tomorrow';
  return `Due ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
};

// ---------- Multi-author notes ----------
export type TaskNote = {
  authorId: string;
  authorName: string;
  createdAt: string;
  body: string;
};

const NOTE_HEADER_RE = /^\[\[note:([^|]*)\|([^|]*)\|([^\]]*)\]\]$/;

export function parseNotes(raw?: string): TaskNote[] {
  if (!raw || !raw.trim()) return [];
  if (!raw.includes('[[note:')) {
    return [{ authorId: '', authorName: 'Unknown', createdAt: '', body: raw.trim() }];
  }
  const lines = raw.split('\n');
  const notes: TaskNote[] = [];
  let cur: TaskNote | null = null;
  let bodyLines: string[] = [];
  const flush = () => {
    if (cur) { cur.body = bodyLines.join('\n').trim(); if (cur.body) notes.push(cur); }
  };
  for (const line of lines) {
    const m = line.match(NOTE_HEADER_RE);
    if (m) {
      flush();
      cur = { authorId: m[1], authorName: m[2], createdAt: m[3], body: '' };
      bodyLines = [];
    } else if (cur) {
      bodyLines.push(line);
    }
  }
  flush();
  return notes;
}

export function serializeNotes(notes: TaskNote[]): string {
  return notes
    .filter(n => n.body && n.body.trim())
    .map(n => `[[note:${n.authorId}|${n.authorName}|${n.createdAt}]]\n${n.body.trim()}`)
    .join('\n\n');
}

const formatNoteDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

export default function TodoList({ showAddForm = false, showDelete = true, hidePriorityFilter = false, headerTitle, hideCompletedOverride }: { showAddForm?: boolean; showDelete?: boolean; hidePriorityFilter?: boolean; headerTitle?: string; hideCompletedOverride?: boolean }) {
  const [taskText, setTaskText] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [isInternal, setIsInternal] = useState<boolean>(false);
  const [priority, setPriority] = useState<Priority>('medium');
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const { tasks, addTask, toggleTask, removeTask, updateTask, addTaskNote, updateTaskNote, isLoading } = useTodo();

  const { users } = useUsers();
  const { activeCustomers: customers } = useCustomers();
  const { user } = useAuth();
  const { isSuperAdmin, isSupervisor } = usePermissions();
  const canReassign = isSuperAdmin || isSupervisor;

  const handleReassign = async (taskId: string, ids: string[]) => {
    await updateTask(taskId, { assigneeId: ids.join(",") });
    toast({ title: "Task reassigned" });
  };

  const [currentUserName, setCurrentUserName] = useState<string>('');
  useEffect(() => {
    if (!user) { setCurrentUserName(''); return; }

    void asPromise(
      supabase
        .from('profiles')
        .select('name')
        .eq('user_id', user.id)
        .maybeSingle()
    )
      .then(({ data }) => {
        const fallback = (() => {
          const u = users.find(x => x.email && user.email && x.email.toLowerCase() === user.email!.toLowerCase());
          return u?.name || (user.email ? user.email.split('@')[0] : 'User');
        })();
        if (data?.name) setCurrentUserName(data.name);
        else setCurrentUserName(fallback);
      })
      .catch(() => {
        const u = users.find(x => x.email && user.email && x.email.toLowerCase() === user.email!.toLowerCase());
        setCurrentUserName(u?.name || (user.email ? user.email.split('@')[0] : 'User'));
      });
  }, [user, users]);


  // Show all team members as possible assignees (exclude only deactivated accounts).
  const assignees = useMemo(
    () => [...users].filter((u) => u.status !== "Inactive").sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  const handleAddTask = async () => {
    const text = taskText.trim();
    if (!text) return;
    if (assigneeIds.length === 0) { toast({ title: "Please select at least one assignee", variant: "destructive" }); return; }
    if (!isInternal && !customerId) { toast({ title: "Please select a customer", variant: "destructive" }); return; }
    await addTask({
      text,
      done: false,
      assigneeId: assigneeIds.join(","),
      customerId: isInternal ? "" : customerId,
      isInternal,
      notes: "",
      priority,
      updatedAt: new Date().toISOString(),
    });
    setTaskText("");
    setPriority('medium');
    setAssigneeIds([]);
    toast({ title: "Task added", description: `${text}` });
  };

  const getAssigneeName = (id: string) => {
    const ids = parseAssigneeIds(id);
    if (ids.length === 0) return "Unassigned";
    const names = ids.map((x) => users.find((u) => u.id === x)?.name).filter(Boolean) as string[];
    return names.length ? names.join(", ") : "Unassigned";
  };

  const getCustomerName = (id: string, isInternal?: boolean) => {
    if (isInternal) return "Internal";
    if (!id || id.trim() === "") return "Unassigned Customer";
    const customer = customers.find((c) => c.id === id);
    return customer?.name ?? "Unassigned Customer";
  };

  const handleEditTask = (task: any) => {
    setEditingTask(task.id);
    setEditText(task.text);
  };

  const handleSaveEdit = async () => {
    if (!editingTask) return;
    await updateTask(editingTask, { text: editText });
    setEditingTask(null);
    setEditText("");
    toast({ title: "Task updated" });
  };

  const handleCancelEdit = () => {
    setEditingTask(null);
    setEditText("");
  };

  // Append a new note to a task
  const handleAddNote = async (taskId: string, body: string): Promise<boolean> => {
    const text = body.trim();
    if (!text || !user) return false;
    const saved = await addTaskNote(taskId, text, currentUserName || user.email || 'User');
    toast(saved ? { title: "Note added" } : { title: "Could not save note", variant: "destructive" });
    return saved;
  };

  // Edit a specific note (author or Super-Admin only)
  const handleSaveNote = async (taskId: string, index: number, body: string): Promise<boolean> => {
    const text = body.trim();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;
    const existing = parseNotes(task.notes);
    if (!existing[index]) return false;
    const saved = await updateTaskNote(taskId, existing[index].createdAt, text);
    toast(saved ? { title: text ? "Note updated" : "Note removed" } : { title: "Could not save note", variant: "destructive" });
    return saved;
  };

  const canEditNote = (note: TaskNote) =>
    isSuperAdmin || (!!user && !!note.authorId && note.authorId === user.id);

  const groupedTasks = customers.reduce((acc, customer) => {
    const customerTasks = tasks.filter(task => task.customerId === customer.id && !task.isInternal);
    if (customerTasks.length > 0) acc[customer.id] = customerTasks;
    return acc;
  }, {} as Record<string, typeof tasks>);

  const internalTasks = tasks.filter(task => task.isInternal);
  if (internalTasks.length > 0) groupedTasks['internal'] = internalTasks;

  const ungroupedTasks = tasks.filter(task => !task.isInternal && (!task.customerId || !customers.find(c => c.id === task.customerId)));
  if (ungroupedTasks.length > 0) groupedTasks['ungrouped'] = ungroupedTasks;

  const { isLoading: usersLoading } = useUsers();

  if (isLoading || usersLoading) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {showAddForm && (
        <div id="users-section" className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Type task here..."
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
              aria-label="New task"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:min-w-[200px] justify-between font-normal"
                >
                  <span className={cn("truncate", assigneeIds.length === 0 && "text-muted-foreground")}>
                    {assigneeIds.length === 0
                      ? "Select assignee(s)..."
                      : assigneeIds
                          .map((id) => assignees.find((u) => u.id === id)?.name)
                          .filter(Boolean)
                          .join(", ")}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="max-h-64 overflow-auto space-y-1">
                  {assignees.map((u) => {
                    const checked = assigneeIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setAssigneeIds((prev) =>
                              v ? Array.from(new Set([...prev, u.id])) : prev.filter((x) => x !== u.id),
                            );
                          }}
                        />
                        <span className="truncate">{u.name}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {!isInternal && (
              <Select value={customerId || undefined} onValueChange={setCustomerId}>
                <SelectTrigger className="w-full sm:min-w-[200px]">
                  <SelectValue placeholder="Select customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger className="w-full sm:min-w-[140px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High Priority</SelectItem>
                <SelectItem value="medium">Medium Priority</SelectItem>
                <SelectItem value="low">Low Priority</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAddTask}>Add</Button>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="internal-task"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="internal-task" className="text-xs font-normal">
              Internal item (no customer)
            </label>
          </div>
        </div>
      )}

      <DailyTasksList
        showAddForm={showAddForm}
        showDelete={showDelete}
        groupedTasks={groupedTasks}
        getCustomerName={getCustomerName}
        getAssigneeName={getAssigneeName}
        toggleTask={toggleTask}
        removeTask={removeTask}
        editingTask={editingTask}
        editText={editText}
        setEditText={setEditText}
        onEdit={handleEditTask}
        onSave={handleSaveEdit}
        onCancel={handleCancelEdit}
        onAddNote={handleAddNote}
        onSaveNote={handleSaveNote}
        canEditNote={canEditNote}
        hidePriorityFilter={hidePriorityFilter}
        headerTitle={headerTitle}
        assignees={assignees}
        canReassign={canReassign}
        onReassign={handleReassign}
        hideCompletedOverride={hideCompletedOverride}
      />
    </div>
  );
}

interface DailyTasksListProps {
  showAddForm: boolean;
  showDelete: boolean;
  groupedTasks: Record<string, any[]>;
  getCustomerName: (id: string, isInternal?: boolean) => string;
  getAssigneeName: (id: string) => string;
  toggleTask: (id: string, done: boolean) => void;
  removeTask: (id: string) => void;
  editingTask: string | null;
  editText: string;
  setEditText: (v: string) => void;
  onEdit: (t: any) => void;
  onSave: () => void;
  onCancel: () => void;
  onAddNote: (taskId: string, body: string) => Promise<boolean> | boolean;
  onSaveNote: (taskId: string, index: number, body: string) => Promise<boolean> | boolean;
  canEditNote: (note: TaskNote) => boolean;
  hidePriorityFilter?: boolean;
  headerTitle?: string;
  assignees: { id: string; name: string }[];
  canReassign: boolean;
  onReassign: (taskId: string, ids: string[]) => Promise<void> | void;
  hideCompletedOverride?: boolean;
}

function DailyTasksList({
  showAddForm, showDelete, groupedTasks, getCustomerName, getAssigneeName,
  toggleTask, removeTask, editingTask, editText, setEditText,
  onEdit, onSave, onCancel, onAddNote, onSaveNote, canEditNote,
  hidePriorityFilter = false,
  headerTitle,
  assignees, canReassign, onReassign,
  hideCompletedOverride,
}: DailyTasksListProps) {
  const [filter, setFilter] = useState<'all' | Priority>('all');
  const [hideCompletedLocal, setHideCompletedLocal] = useState(true);
  const hideCompleted = hideCompletedOverride !== undefined ? hideCompletedOverride : hideCompletedLocal;
  const setHideCompleted = (v: boolean) => setHideCompletedLocal(v);

  const allTasks = useMemo(() => Object.values(groupedTasks).flat(), [groupedTasks]);
  const completedCount = useMemo(() => allTasks.filter((t: any) => t.done).length, [allTasks]);
  const counts = useMemo(() => {
    const c = { all: allTasks.length, high: 0, medium: 0, low: 0 };
    allTasks.forEach((t: any) => { c[getPriority(t.updatedAt, t.done, t.priority)]++; });
    return c;
  }, [allTasks]);

  const matchesFilter = (t: any) => {
    if (hideCompleted && t.done) return false;
    return filter === 'all' || getPriority(t.updatedAt, t.done, t.priority) === filter;
  };

  const visibleGroups = Object.entries(groupedTasks)
    .map(([k, list]) => [k, list.filter(matchesFilter)] as const)
    .filter(([, list]) => list.length > 0);

  const tabs: { key: 'all' | Priority; label: string }[] = [
    { key: 'all',    label: `All (${counts.all})` },
    { key: 'high',   label: `High (${counts.high})` },
    { key: 'medium', label: `Medium (${counts.medium})` },
    { key: 'low',    label: `Low (${counts.low})` },
  ];

  return (
    <div className={showAddForm ? 'mt-4' : ''}>
      <div className={cn(
        "flex items-center gap-1.5 mb-3 flex-wrap",
        headerTitle && "pb-3 border-b border-border"
      )}>
        {headerTitle && (
          <h2 className="text-base font-semibold text-foreground mr-2">{headerTitle}</h2>
        )}
        {!hidePriorityFilter && tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
              filter === tab.key
                ? "bg-[#b73235] text-white"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </button>
        ))}
        {hideCompletedOverride === undefined && (
          <label className="ml-auto flex items-center gap-2 text-xs font-normal cursor-pointer">
            <Checkbox
              checked={hideCompleted}
              onCheckedChange={(c) => setHideCompleted(c === true)}
            />
            <span className="whitespace-nowrap">
              Hide completed tasks {completedCount > 0 && `(${completedCount})`}
            </span>
          </label>
        )}
      </div>


      {allTasks.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">
          No tasks yet. {showAddForm ? 'Add one above!' : 'Create tasks in the Daily Handover page.'}
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">No tasks in this priority.</div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map(([groupKey, list]) => (
            <div key={groupKey} className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#1c477a] border-b border-border pb-1">
                {groupKey === 'internal' ? 'Internal'
                  : groupKey === 'ungrouped' ? 'Unassigned Customer'
                  : getCustomerName(groupKey)}
              </h3>
              <ul className="divide-y divide-border">
                {list.map((t: any) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    isEditing={editingTask === t.id}
                    editText={editText}
                    setEditText={setEditText}
                    onEdit={onEdit}
                    onSave={onSave}
                    onCancel={onCancel}
                    toggleTask={toggleTask}
                    removeTask={removeTask}
                    showDelete={showDelete}
                    getAssigneeName={getAssigneeName}
                    onAddNote={onAddNote}
                    onSaveNote={onSaveNote}
                    canEditNote={canEditNote}
                    assignees={assignees}
                    canReassign={canReassign}
                    onReassign={onReassign}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskRowProps {
  task: any;
  isEditing: boolean;
  editText: string;
  setEditText: (v: string) => void;
  onEdit: (t: any) => void;
  onSave: () => void;
  onCancel: () => void;
  toggleTask: (id: string, done: boolean) => void;
  removeTask: (id: string) => void;
  showDelete: boolean;
  getAssigneeName: (id: string) => string;
  onAddNote: (taskId: string, body: string) => Promise<boolean> | boolean;
  onSaveNote: (taskId: string, index: number, body: string) => Promise<boolean> | boolean;
  canEditNote: (note: TaskNote) => boolean;
  assignees: { id: string; name: string }[];
  canReassign: boolean;
  onReassign: (taskId: string, ids: string[]) => Promise<void> | void;
}

function TaskRow({
  task, isEditing, editText, setEditText, onEdit, onSave, onCancel,
  toggleTask, removeTask, showDelete, getAssigneeName,
  onAddNote, onSaveNote, canEditNote,
  assignees, canReassign, onReassign,
}: TaskRowProps) {
  const pr = getPriority(task.updatedAt, task.done, task.priority);
  const meta = PRIORITY_META[pr];
  const notes = useMemo(() => parseNotes(task.notes), [task.notes]);
  const currentIds = useMemo(() => parseAssigneeIds(task.assigneeId), [task.assigneeId]);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignIds, setReassignIds] = useState<string[]>(currentIds);
  useEffect(() => { setReassignIds(currentIds); }, [task.assigneeId]);

  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  

  const startEditNote = (idx: number) => {
    setEditingNoteIndex(idx);
    setNoteDraft(notes[idx]?.body || '');
  };

  const saveNote = async () => {
    if (editingNoteIndex === null) return;
    const saved = await onSaveNote(task.id, editingNoteIndex, noteDraft);
    if (saved) {
      setEditingNoteIndex(null);
      setNoteDraft('');
    }
  };

  const submitNewNote = async () => {
    if (!newNoteText.trim()) return;
    const saved = await onAddNote(task.id, newNoteText);
    if (saved) {
      setNewNoteText('');
      setAddingNote(false);
    }
  };

  // Progress: 0% at creation, 100% at 48h (high-priority threshold). Done = 100%.
  const progressPct = (() => {
    if (task.done) return 100;
    const hoursAgo = (Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60 * 60);
    return Math.max(4, Math.min(100, Math.round((hoursAgo / 48) * 100)));
  })();
  const progressColor = task.done
    ? 'bg-green-500'
    : pr === 'high'
      ? 'bg-[#b73235]'
      : pr === 'medium'
        ? 'bg-amber-500'
        : 'bg-[#1c477a]';

  const [expanded, setExpanded] = useState(false);

  return (
    <li className="py-2 border-b border-border/40 last:border-b-0">
      {/* Collapsed header row — always visible */}
      <div className="flex items-center gap-3">
        <Checkbox
          checked={task.done}
          onCheckedChange={(c) => toggleTask(task.id, c === true)}
          aria-label={task.text}
          className="flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex-1 min-w-0 text-left flex items-center gap-3"
          aria-expanded={expanded}
        >
          <span className={cn(
            "text-sm font-semibold truncate flex-1 min-w-0",
            task.done ? "line-through text-muted-foreground" : "text-foreground"
          )}>
            {task.text}
          </span>
          <div className="hidden sm:flex w-28 h-1.5 bg-muted rounded-full overflow-hidden flex-shrink-0" aria-hidden>
            <div
              className={cn("h-full rounded-full transition-all", progressColor)}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className={cn("text-[10px] font-semibold w-8 text-right flex-shrink-0 hidden sm:inline", meta.text)}>
            {progressPct}%
          </span>
          <span className={cn(
            "text-xs font-semibold whitespace-nowrap flex-shrink-0",
            pr === 'high' ? 'text-[#b73235]' : 'text-muted-foreground'
          )}>
            {formatDueLabel(task.createdAt)}
          </span>
          {notes.length > 0 && (
            <span className="text-[10px] font-medium text-[#1c477a] whitespace-nowrap flex-shrink-0">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
        </button>
        {!isEditing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {canReassign && !task.done && (
              <Popover open={reassignOpen} onOpenChange={(o) => { setReassignOpen(o); if (o) setReassignIds(currentIds); }}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" aria-label="Reassign task">
                    Reassign
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="end" onClick={(e) => e.stopPropagation()}>
                  <div className="max-h-64 overflow-auto space-y-1">
                    {assignees.map((u) => {
                      const checked = reassignIds.includes(u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setReassignIds((prev) =>
                                v ? Array.from(new Set([...prev, u.id])) : prev.filter((x) => x !== u.id),
                              );
                            }}
                          />
                          <span className="truncate">{u.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-1 pt-2 mt-2 border-t border-border">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setReassignOpen(false)}>Cancel</Button>
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={reassignIds.length === 0}
                      onClick={async () => {
                        await onReassign(task.id, reassignIds);
                        setReassignOpen(false);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {!task.done && (
              <Button size="sm" variant="ghost" onClick={() => onEdit(task)} className="h-7 px-1.5" aria-label="Edit task">
                <Edit className="h-3 w-3" />
              </Button>
            )}
            {showDelete && (
              <Button size="sm" variant="ghost" onClick={() => removeTask(task.id)} className="h-7 px-2 text-xs">
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Expanded body */}
      {(expanded || isEditing) && (
        <div className="mt-2 pl-8 pr-2">
          {isEditing ? (
            <div className="space-y-2">
              <Input value={editText} onChange={(e) => setEditText(e.target.value)} className="text-sm" />
              <div className="flex gap-1">
                <Button size="sm" onClick={onSave} className="h-7 px-2"><Save className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 px-2"><X className="h-3 w-3" /></Button>
              </div>
            </div>
          ) : (
            <>
              <p className={cn("text-xs font-medium", meta.text)}>
                {meta.label}
                <span className="text-muted-foreground font-normal"> · {getAssigneeName(task.assigneeId)}</span>
              </p>

              {/* Mobile progress bar (hidden on sm+ since shown in header) */}
              <div className="sm:hidden mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", progressColor)} style={{ width: `${progressPct}%` }} />
                </div>
                <span className={cn("text-[10px] font-semibold", meta.text)}>{progressPct}%</span>
              </div>

              {/* Notes */}
              {notes.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {notes.map((n, idx) => {
                    const editable = canEditNote(n);
                    const isNoteEditing = editingNoteIndex === idx;
                    return (
                      <div key={idx} className="text-xs bg-muted/50 rounded px-2 py-1.5 border border-border">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="font-semibold text-[#1c477a]">
                            {(() => {
                              const raw = (n.authorName || '').trim();
                              if (raw && raw.includes('@')) {
                                const u = assignees.find((x: any) => x.email && x.email.toLowerCase() === raw.toLowerCase());
                                if (u?.name) return u.name;
                              }
                              if (n.authorId) {
                                const u = assignees.find((x: any) => x.user_id === n.authorId || x.id === n.authorId);
                                if (u?.name) return u.name;
                              }
                              return raw || 'Unknown';
                            })()}


                            {n.createdAt && (
                              <span className="font-normal text-muted-foreground"> · {formatNoteDate(n.createdAt)}</span>
                            )}
                            {idx === 0 && notes.length > 1 && (
                              <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">(first)</span>
                            )}
                          </span>
                          {editable && !isNoteEditing && (
                            <Button size="sm" variant="ghost" onClick={() => startEditNote(idx)} className="h-6 px-1.5" aria-label="Edit note">
                              <Edit className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        {isNoteEditing ? (
                          <div className="space-y-1.5">
                            <Textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} className="text-xs min-h-[60px]" />
                            <div className="flex gap-1">
                              <Button size="sm" onClick={saveNote} className="h-6 px-2 text-xs">
                                <Save className="h-3 w-3 mr-1" /> Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingNoteIndex(null); setNoteDraft(''); }} className="h-6 px-2 text-xs">
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-muted-foreground">{n.body}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add note */}
              {!task.done && (
                addingNote ? (
                  <div className="mt-2 space-y-1.5">
                    <Textarea
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder={notes.length === 0 ? "Add a note..." : "Add your note below..."}
                      className="text-xs min-h-[60px]"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <Button size="sm" onClick={submitNewNote} className="h-6 px-2 text-xs">
                        <Save className="h-3 w-3 mr-1" /> Post note
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAddingNote(false); setNewNoteText(''); }} className="h-6 px-2 text-xs">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setAddingNote(true)} className="mt-1.5 h-6 px-1.5 text-xs text-[#1c477a] hover:text-[#1c477a]">
                    <Plus className="h-3 w-3 mr-1" />
                    {notes.length === 0 ? 'Add note' : 'Add another note'}
                  </Button>
                )
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
