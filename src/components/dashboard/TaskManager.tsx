import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { 
  ChevronDown, ChevronRight, Bell, X, Plus, Timer, 
  MessageSquare, Users, Clock, Paperclip
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUsers } from "@/context/UsersContext";
import { useCustomers } from "@/context/CustomersContext";
import { useTasks, type TMTask, type TMStatus, type TMPriority } from "@/context/TasksContext";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { useTaskNotifications } from "@/hooks/useTaskNotifications";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { getCustomerTaskHourlyRate } from "@/lib/taskBilling";

const STATUS_ORDER: TMStatus[] = ["new_task", "pending", "in_progress", "completed"];
const STATUS_LABELS: Record<TMStatus, string> = {
  new_task: "New Tasks",
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

export default function TaskManager() {
  const { users } = useUsers();
  const { activeCustomers: customers } = useCustomers();
  const { tasks, addTask, updateTaskStatus, updateTaskAssignee, updateTaskCustomer, updateTaskTitle, updateTaskPriority, removeTask, startTimer, stopTimer, updateTaskNotes, updateTaskTime, updateTaskServiceCategory } = useTasks();
  const { createNotification } = useTaskNotifications();
  const { user: currentUser } = useAuth();
  const { can } = usePermissions();
  const canViewBilling = can('task_manager', 'view_billing_data');
  
  // Form state
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [status, setStatus] = useState<TMStatus>("pending");
  const [priority, setPriority] = useState<TMPriority | "">("");
  const [isInternal, setIsInternal] = useState(false);
  const [isDigitalTyping, setIsDigitalTyping] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState<"all" | TMPriority>("all");
  
  // UI state
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [selectedTask, setSelectedTask] = useState<TMTask | null>(null);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  const [detailOpen, setDetailOpen] = useState(false);

  // Notification state
  const [assignmentNotification, setAssignmentNotification] = useState<{
    show: boolean;
    taskTitle: string;
    assigneeName: string;
    customerName: string;
  } | null>(null);

  const showAssignmentNotification = useCallback((taskTitle: string, assigneeId: string, custId: string, _taskId?: string) => {
    // Local banner for the assigner's own feedback. The actual recipient
    // notification is created by the DB trigger on project_tasks.
    const assigneeName = users.find(u => u.id === assigneeId)?.name ?? "Unassigned";
    const customerName = customers.find(c => c.id === custId)?.name ?? "Unknown";
    setAssignmentNotification({ show: true, taskTitle, assigneeName, customerName });
    setTimeout(() => setAssignmentNotification(null), 6000);
  }, [users, customers]);

  const activeUsers = users.filter((u) => u.status === "Active");
  const assignees = activeUsers.length ? activeUsers : users;

  // No auto-defaulting — let placeholders show

  // Auto-expand customers that have tasks
  useEffect(() => {
    const customerNames = new Set<string>();
    tasks.forEach(task => {
      const name = task.isInternal ? INTERNAL_GROUP : getCustomerName(task.customerId);
      customerNames.add(name);
    });
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      customerNames.forEach(n => next.add(n));
      return next;
    });
  }, []);

  // Fetch attachment counts for all tasks
  const fetchAttachmentCounts = useCallback(async () => {
    if (tasks.length === 0) return;
    const { data, error } = await supabase
      .from('task_attachments')
      .select('task_id');
    if (!error && data) {
      const counts: Record<string, number> = {};
      (data as any[]).forEach((row) => {
        counts[row.task_id] = (counts[row.task_id] || 0) + 1;
      });
      setAttachmentCounts(counts);
    }
  }, [tasks.length]);

  useEffect(() => {
    fetchAttachmentCounts();
  }, [fetchAttachmentCounts]);

  const handleAddTask = async () => {
    const t = title.trim();
    if (!t) return;
    if (!assigneeId) { toast({ title: "Please select an assignee", variant: "destructive" }); return; }
    if (!isInternal && !customerId) { toast({ title: "Please select a customer", variant: "destructive" }); return; }
    const effectiveCustomerId = isInternal ? "" : customerId;
    const newTaskId = await addTask({
      title: t,
      assigneeId,
      customerId: effectiveCustomerId,
      status,
      priority: priority || null,
      isInternal,
      serviceCategory: isDigitalTyping ? 'DT' : 'VA',
    });
    if (!newTaskId) {
      toast({ title: "Task save failed", description: "This task could not be saved to the database.", variant: "destructive" });
      return;
    }
    toast({ title: "Task created", description: t });
    showAssignmentNotification(t, assigneeId, effectiveCustomerId, newTaskId);
    setTitle("");
    setCustomerId("");
    setStatus("pending");
    setPriority("");
    setIsInternal(false);
    setIsDigitalTyping(false);
  };

  const getCustomerHourlyRate = (customerId: string): number => {
    const customer = customers.find(c => c.id === customerId);
    return getCustomerTaskHourlyRate(customer);
  };

  const getTaskCustomerHourlyRate = (task?: TMTask | null) => {
    if (!task || task.isInternal || !task.customerId) {
      return 0;
    }

    return getCustomerHourlyRate(task.customerId);
  };

  // Reconcile costs
  useEffect(() => {
    if (tasks.length > 0 && customers.length > 0) {
      tasks.forEach(task => {
        if (task.billableTime && task.cost) {
          const correctHourlyRate = getCustomerHourlyRate(task.customerId);
          const correctCost = Math.round(((task.billableTime / 3600) * correctHourlyRate) * 100) / 100;
          if (Math.abs(task.cost - correctCost) > 0.01) {
            updateTaskTime(task.id, task.totalTime || 0, task.billableTime, correctHourlyRate);
          }
        }
      });
    }
  }, [customers]);

  const formatTime = (seconds?: number): string => {
    if (!seconds) return "0:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}`;
    return `0:${minutes.toString().padStart(2, '0')}`;
  };

  const handleStartTimer = (task: TMTask) => {
    startTimer(task.id);
    toast({ title: "Timer started", description: `Started timing: ${task.title}` });
  };

  const handleStopTimer = (task: TMTask) => {
    const hourlyRate = getCustomerHourlyRate(task.customerId);
    stopTimer(task.id, hourlyRate);
    toast({ title: "Timer stopped", description: `Time tracked and cost calculated` });
  };

  const getAssigneeName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unassigned";
  const getCustomerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "No Customer";

  const INTERNAL_GROUP = "The VA Team (Internal)";
  const baseTasks = hideCompleted ? tasks.filter(t => t.status !== 'completed') : tasks;
  const filteredTasks = priorityFilter === "all" ? baseTasks : baseTasks.filter(t => t.priority === priorityFilter);
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const priorityCounts = {
    all: baseTasks.length,
    high: baseTasks.filter(t => t.priority === 'high').length,
    medium: baseTasks.filter(t => t.priority === 'medium').length,
    low: baseTasks.filter(t => t.priority === 'low').length,
  };

  // Group by customer, then by status
  const groupedByCustomer: Record<string, Record<TMStatus, TMTask[]>> = {};
  filteredTasks.forEach(task => {
    const groupName = task.isInternal ? INTERNAL_GROUP : getCustomerName(task.customerId);
    if (!groupedByCustomer[groupName]) {
      groupedByCustomer[groupName] = { new_task: [], pending: [], in_progress: [], completed: [] };
    }
    groupedByCustomer[groupName][task.status].push(task);
  });

  // Count tasks per customer
  const customerTaskCounts: Record<string, number> = {};
  Object.entries(groupedByCustomer).forEach(([name, statusGroups]) => {
    customerTaskCounts[name] = Object.values(statusGroups).reduce((sum, arr) => sum + arr.length, 0);
  });

  const toggleCustomer = (name: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleOpenTask = (task: TMTask) => {
    setSelectedTask(task);
    setDetailOpen(true);
  };

  // Keep selectedTask in sync with tasks array
  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find(t => t.id === selectedTask.id);
      if (updated) setSelectedTask(updated);
    }
  }, [tasks]);

  // Deep-link: open a specific task when ?task=<id> is in the URL
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const targetId = searchParams.get('task');
    if (!targetId || tasks.length === 0) return;
    const target = tasks.find(t => t.id === targetId);
    if (!target) return;
    setSelectedTask(target);
    setDetailOpen(true);
    const groupName = target.isInternal ? INTERNAL_GROUP : getCustomerName(target.customerId);
    setExpandedCustomers(prev => {
      if (prev.has(groupName)) return prev;
      const next = new Set(prev);
      next.add(groupName);
      return next;
    });
    // Clear the param so re-opening works after closing
    const next = new URLSearchParams(searchParams);
    next.delete('task');
    setSearchParams(next, { replace: true });
  }, [searchParams, tasks]);

  const statusBadgeSmall = (s: TMStatus) => {
    switch (s) {
      case "new_task":
        return <Badge className="bg-red-500 text-white border-red-600 text-[10px] px-1.5 py-0">New</Badge>;
      case "pending":
        return <Badge className="bg-amber-500 text-white border-amber-600 text-[10px] px-1.5 py-0">Pending</Badge>;
      case "in_progress":
        return <Badge className="bg-green-400 text-green-900 border-green-500 text-[10px] px-1.5 py-0">In Progress</Badge>;
      case "completed":
        return <Badge className="bg-gray-400 text-white border-gray-500 text-[10px] px-1.5 py-0">Done</Badge>;
    }
  };

  const getAssigneeInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (task: TMTask) => {
    return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  return (
    <>
      {/* Assignment Notification Banner */}
      {assignmentNotification?.show && (
        <div className="mb-4 p-3 sm:p-4 bg-primary/10 border border-primary/30 rounded-lg animate-in slide-in-from-top-2 duration-300 flex items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Task Assigned to {assignmentNotification.assigneeName}</p>
              <p className="text-sm text-muted-foreground">"{assignmentNotification.taskTitle}" — {assignmentNotification.customerName}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAssignmentNotification(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div>
        {/* Add Task Form */}
        <div className="flex flex-col md:flex-row gap-2 items-end">
          <Input
            placeholder="Type task title here..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
          />
          {!isInternal && (
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="w-full md:min-w-[200px]">
                <SelectValue placeholder="Select customer..." />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger className="w-full md:min-w-[180px]">
              <SelectValue placeholder="Select assignee..." />
            </SelectTrigger>
            <SelectContent>
              {assignees.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as TMStatus)}>
            <SelectTrigger className="w-full md:min-w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new_task">New Task</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priority || "none"} onValueChange={(v) => setPriority(v === "none" ? "" : (v as TMPriority))}>
            <SelectTrigger className="w-full md:min-w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No priority</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleAddTask}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox id="internal-task" checked={isInternal} onCheckedChange={(checked) => setIsInternal(!!checked)} />
            <Label htmlFor="internal-task" className="text-sm font-normal cursor-pointer whitespace-nowrap">Internal</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="dt-task" checked={isDigitalTyping} onCheckedChange={(checked) => setIsDigitalTyping(!!checked)} />
            <Label htmlFor="dt-task" className="text-sm font-normal cursor-pointer whitespace-nowrap">Digital Typing</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="hide-completed" checked={hideCompleted} onCheckedChange={(checked) => setHideCompleted(!!checked)} />
            <Label htmlFor="hide-completed" className="text-sm font-normal cursor-pointer whitespace-nowrap">
              Hide completed tasks {completedCount > 0 && `(${completedCount})`}
            </Label>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {([
              { key: "all", label: "All" },
              { key: "high", label: "High" },
              { key: "medium", label: "Medium" },
              { key: "low", label: "Low" },
            ] as const).map(({ key, label }) => (
              <Button
                key={key}
                size="sm"
                variant={priorityFilter === key ? "default" : "outline"}
                onClick={() => setPriorityFilter(key)}
                className="h-7 text-xs"
              >
                {label} ({priorityCounts[key]})
              </Button>
            ))}
          </div>
        </div>


        {/* Customer Projects List */}
        <div className="mt-6 space-y-2">
          {Object.entries(groupedByCustomer).map(([customerName, statusGroups]) => {
            const isExpanded = expandedCustomers.has(customerName);
            const totalTasks = customerTaskCounts[customerName] || 0;

            return (
              <div key={customerName} className="border rounded-lg overflow-hidden">
                {/* Customer Header */}
                <button
                  onClick={() => toggleCustomer(customerName)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="font-semibold text-sm flex-1">{customerName}</span>
                  <Badge variant="secondary" className="text-xs">
                    {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
                  </Badge>
                </button>

                {/* Expanded: Status groups */}
                {isExpanded && (
                  <div>
                    {STATUS_ORDER.map(statusKey => {
                      const tasksInStatus = statusGroups[statusKey];
                      if (tasksInStatus.length === 0) return null;

                      return (
                        <div key={statusKey}>
                          {/* Status Section Header */}
                          <div className={`px-4 py-2.5 border-t flex items-center gap-2.5 ${
                              statusKey === 'new_task' ? 'bg-[#585858]/10 border-l-4 border-l-[#585858]' :
                              statusKey === 'pending' ? 'bg-amber-500/10 border-l-4 border-l-amber-500' :
                              statusKey === 'in_progress' ? 'bg-[hsl(210,64%,30%)]/10 border-l-4 border-l-[hsl(210,64%,30%)]' :
                              'bg-muted/30 border-l-4 border-l-gray-400'
                            }`}>
                            <div className={`w-2.5 h-2.5 rounded-full ${
                              statusKey === 'new_task' ? 'bg-[#585858]' :
                              statusKey === 'pending' ? 'bg-amber-500' :
                              statusKey === 'in_progress' ? 'bg-[#1c477a]' :
                              'bg-gray-400'
                            }`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${
                              statusKey === 'new_task' ? 'text-[#585858]' :
                              statusKey === 'pending' ? 'text-amber-700 dark:text-amber-400' :
                              statusKey === 'in_progress' ? 'text-[#1c477a]' :
                              'text-muted-foreground'
                            }`}>
                              {STATUS_LABELS[statusKey]}
                            </span>
                          </div>

                          {/* Task rows */}
                          {/* Table header for this section */}
                          <div className={`hidden md:grid ${canViewBilling ? 'grid-cols-[1fr_100px_100px_80px_80px]' : 'grid-cols-[1fr_100px_100px_80px]'} px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-t bg-background/50`}>
                            <span>Name</span>
                            <span className="text-center">Assignee</span>
                            <span className="text-center">Label</span>
                            {canViewBilling && <span className="text-center">Time</span>}
                            <span className="text-center">Date</span>
                          </div>

                          {tasksInStatus.map((task) => {
                            const aName = getAssigneeName(task.assigneeId);
                            const noteCount = (task.notes || "").split("\n").filter(l => l.trim()).length;

                            return (
                              <div
                                key={task.id}
                                onClick={() => handleOpenTask(task)}
                                className={`grid grid-cols-1 ${canViewBilling ? 'md:grid-cols-[1fr_100px_100px_80px_80px]' : 'md:grid-cols-[1fr_100px_100px_80px]'} px-4 py-2.5 border-t hover:bg-accent/50 cursor-pointer transition-colors items-center gap-2`}
                              >
                                {/* Task name + indicators */}
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                    task.status === 'completed' ? 'bg-green-500' :
                                    task.status === 'in_progress' ? 'bg-blue-500' :
                                    task.status === 'new_task' ? 'bg-red-500' :
                                    'bg-amber-500'
                                  }`} />
                                  <span className={`text-sm truncate ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                                    {task.title}
                                  </span>
                                  {task.priority && (
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${
                                        task.priority === 'high'
                                          ? 'border-destructive/50 text-destructive bg-destructive/10'
                                          : task.priority === 'medium'
                                          ? 'border-amber-500/50 text-amber-700 dark:text-amber-400 bg-amber-500/10'
                                          : 'border-blue-500/50 text-blue-700 dark:text-blue-400 bg-blue-500/10'
                                      }`}
                                    >
                                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                                    </Badge>
                                  )}
                                  {noteCount > 0 && (
                                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground flex-shrink-0">
                                      <MessageSquare className="h-3 w-3" />
                                      {noteCount}
                                    </span>
                                  )}
                                  {(attachmentCounts[task.id] || 0) > 0 && (
                                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground flex-shrink-0">
                                      <Paperclip className="h-3 w-3" />
                                      {attachmentCounts[task.id]}
                                    </span>
                                  )}
                                  {task.isTimerRunning && (
                                    <span className="text-xs text-yellow-600 flex-shrink-0">⏱️</span>
                                  )}
                                </div>

                                {/* Assignee avatar */}
                                <div className="flex justify-center">
                                  <div 
                                    className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-semibold text-primary"
                                    title={aName}
                                  >
                                    {getAssigneeInitials(aName)}
                                  </div>
                                </div>

                                {/* Status badge */}
                                <div className="flex justify-center">
                                  {statusBadgeSmall(task.status)}
                                </div>

                                {/* Time */}
                                {canViewBilling && (
                                  <div className="text-center text-xs text-muted-foreground font-mono">
                                    {formatTime(task.totalTime)}
                                  </div>
                                )}

                                {/* Date */}
                                <div className="text-center text-xs text-muted-foreground">
                                  {formatDate(task)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {Object.keys(groupedByCustomer).length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No tasks yet. Add your first task above.
            </div>
          )}
        </div>
      </div>

      {/* Task Detail Dialog */}
      <TaskDetailDialog
        open={detailOpen}
        onOpenChange={(open) => { setDetailOpen(open); if (!open) fetchAttachmentCounts(); }}
        task={selectedTask}
        customerName={selectedTask ? (selectedTask.isInternal ? INTERNAL_GROUP : getCustomerName(selectedTask.customerId)) : ""}
        assigneeName={selectedTask ? getAssigneeName(selectedTask.assigneeId) : ""}
        users={users}
        customers={customers}
        onUpdateStatus={updateTaskStatus}
        onUpdateAssignee={(id, v) => { updateTaskAssignee(id, v); showAssignmentNotification(selectedTask?.title || "", v, selectedTask?.customerId || "", id); }}
        onUpdateCustomer={updateTaskCustomer}
        onUpdateNotes={updateTaskNotes}
        onUpdateTitle={updateTaskTitle}
        onStartTimer={handleStartTimer}
        onStopTimer={handleStopTimer}
        onDelete={removeTask}
        onUpdateServiceCategory={updateTaskServiceCategory}
        customerHourlyRate={getTaskCustomerHourlyRate(selectedTask)}
        onUpdateTime={(id, totalTime, billableTime) => {
          const currentTask = tasks.find(task => task.id === id) ?? selectedTask;
          const hourlyRate = getTaskCustomerHourlyRate(currentTask);
          updateTaskTime(id, totalTime, billableTime, hourlyRate);
        }}
        formatTime={formatTime}
        canViewBilling={canViewBilling}
      />
    </>
  );
}
