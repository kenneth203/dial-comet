import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  Play, Square, Clock, Send, Paperclip, Timer, 
  User, Calendar, Tag, MessageSquare, X, Edit, Save,
  ChevronDown, Download, Trash2, FileText, Image, File, Loader2
} from "lucide-react";
import { useTaskAttachments, type TaskAttachment } from "@/hooks/useTaskAttachments";
import { type TMTask, type TMStatus } from "@/context/TasksContext";
import { TimeEditDialog } from "./TimeEditDialog";
import { toast } from "@/hooks/use-toast";
import { MentionTextarea, renderMentionText } from "./MentionTextarea";
import { Textarea } from "@/components/ui/textarea";
import { useTaskNotifications } from "@/hooks/useTaskNotifications";
import { calculateTaskCost, getTaskBillableSeconds, isTaskBillable } from "@/lib/taskBilling";
import { formatGBP } from "@/lib/currency";
import { usePermissions } from "@/hooks/usePermissions";

interface TaskDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TMTask | null;
  customerName: string;
  assigneeName: string;
  users: Array<{ id: string; name: string; status: string }>;
  customers: Array<{ id: string; name: string }>;
  onUpdateStatus: (id: string, status: TMStatus) => void;
  onUpdateAssignee: (id: string, assigneeId: string) => void;
  onUpdateCustomer: (id: string, customerId: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onStartTimer: (task: TMTask) => void;
  onStopTimer: (task: TMTask) => void;
  onDelete: (id: string) => void;
  onUpdateTime?: (id: string, totalTime: number, billableTime: number) => void;
  onUpdateServiceCategory?: (id: string, category: 'VA' | 'DT') => void;
  formatTime: (seconds?: number) => string;
  canViewBilling?: boolean;
  customerHourlyRate: number;
}

export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
  customerName,
  assigneeName,
  users,
  customers,
  onUpdateStatus,
  onUpdateAssignee,
  onUpdateCustomer,
  onUpdateNotes,
  onUpdateTitle,
  onStartTimer,
  onStopTimer,
  onDelete,
  onUpdateTime,
  onUpdateServiceCategory,
  formatTime,
  canViewBilling = true,
  customerHourlyRate,
}: TaskDetailDialogProps) {
  const [newComment, setNewComment] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showTimeEdit, setShowTimeEdit] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<TMStatus | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { createMentionNotifications } = useTaskNotifications();
  const { can } = usePermissions();
  const canDeleteTask = can('task_manager', 'delete');

  const mentionUsers = users.map(u => ({ id: u.id, name: u.name }));
  const userNames = users.map(u => u.name);

  // Live timer
  useEffect(() => {
    if (task?.isTimerRunning && task.startTime) {
      const tick = () => {
        const elapsed = (Date.now() - task.startTime!) / 1000;
        setElapsedTime(elapsed);
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    } else {
      setElapsedTime(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [task?.isTimerRunning, task?.startTime]);

  useEffect(() => { setPendingStatus(null); }, [task?.id, task?.status]);

  if (!task) return null;

  const statusLabel = (s: TMStatus) => {
    switch (s) {
      case "new_task": return "NEW TASK";
      case "pending": return "PENDING";
      case "in_progress": return "IN PROGRESS";
      case "completed": return "DONE";
    }
  };

  const statusColor = (s: TMStatus) => {
    switch (s) {
      case "new_task": return "bg-red-500 text-white";
      case "pending": return "bg-amber-500 text-white";
      case "in_progress": return "bg-green-400 text-green-900";
      case "completed": return "bg-gray-400 text-white";
    }
  };

  const currentRunning = task.isTimerRunning ? elapsedTime : 0;
  const displayTotal = (task.totalTime || 0) + currentRunning;
  const displayBillableSeconds = getTaskBillableSeconds(task, currentRunning);
  const displayCost = calculateTaskCost(displayBillableSeconds, customerHourlyRate);
  const taskCanShowBilling = isTaskBillable(task);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const commentText = newComment.trim();
    const timestamp = new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    });
    const existingNotes = task.notes || "";
    const commentEntry = `[${timestamp}] ${commentText}`;
    const updatedNotes = existingNotes ? `${commentEntry}\n${existingNotes}` : commentEntry;
    
    // Clear input immediately for responsive UX
    setNewComment("");

    // Save the comment first
    await onUpdateNotes(task.id, updatedNotes);

    // Extract @mentions and send notifications
    const mentionRegex = /@(\S+)/g;
    let match: RegExpExecArray | null;
    const mentionedUserIds: string[] = [];
    while ((match = mentionRegex.exec(commentText)) !== null) {
      const mentionedName = match[1];
      const matchedUser = users.find(u => u.name.toLowerCase() === mentionedName.toLowerCase());
      if (matchedUser) {
        mentionedUserIds.push(matchedUser.id);
      }
    }
    if (mentionedUserIds.length > 0) {
      await createMentionNotifications({
        taskTitle: task.title,
        taskId: task.id,
        customerName: customerName,
        mentionedSystemUserIds: mentionedUserIds,
      });
    }

    toast({ title: "Comment added" });
  };

  const handleStartEdit = () => {
    setEditNotes(task.notes || "");
    setIsEditingNotes(true);
  };

  const handleSaveNotes = () => {
    onUpdateNotes(task.id, editNotes);
    setIsEditingNotes(false);
    toast({ title: "Notes updated" });
  };

  const formatTimeDisplay = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const noteLines = (task.notes || "").split("\n").filter(l => l.trim());

  const activeUsers = users.filter(u => u.status === "Active");
  const assigneeList = activeUsers.length ? activeUsers : users;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1050px] w-[95vw] max-h-[90dvh] overflow-y-auto p-0">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-3 sm:pb-4">
          <div className="flex items-start gap-3">
            <div className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ${task.status === 'completed' ? 'bg-green-500' : task.status === 'in_progress' ? 'bg-blue-500' : task.status === 'new_task' ? 'bg-red-500' : 'bg-amber-500'}`} />
            <div className="flex-1 min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="text-lg font-semibold h-8"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (editTitle.trim()) {
                          onUpdateTitle(task.id, editTitle.trim());
                          toast({ title: "Title updated" });
                        }
                        setIsEditingTitle(false);
                      } else if (e.key === "Escape") {
                        setIsEditingTitle(false);
                      }
                    }}
                  />
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (editTitle.trim()) {
                      onUpdateTitle(task.id, editTitle.trim());
                      toast({ title: "Title updated" });
                    }
                    setIsEditingTitle(false);
                  }}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsEditingTitle(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h2 className="text-lg font-semibold leading-tight">{task.title}</h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => { setEditTitle(task.title); setIsEditingTitle(true); }}
                  >
                    <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span>{customerName}</span>
                <span>•</span>
                <span>Task #{task.id.slice(0, 6)}</span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col lg:flex-row">
          {/* Left: Main Content */}
          <div className="flex-1 p-4 sm:p-6 space-y-6 min-w-0">
            {/* Discussion / Comments */}
            <div>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Discussion
              </h3>
              
              {/* Comment Input */}
              <div className="flex gap-2 mb-4">
                <MentionTextarea
                  value={newComment}
                  onChange={setNewComment}
                  users={mentionUsers}
                  placeholder="Write a comment... Use @ to mention someone"
                  className="min-h-[60px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.defaultPrevented) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                />
                <Button size="sm" onClick={handleAddComment} className="self-end">
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {/* Notes / Activity */}
              <div className="space-y-3">
                {noteLines.length > 0 ? (
                  <div className="space-y-2">
                    {noteLines.map((line, idx) => {
                      const timestampMatch = line.match(/^\[(.+?)\]\s*(.*)/);
                      return (
                        <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            {timestampMatch ? (
                              <>
                                <span className="text-xs text-muted-foreground">{timestampMatch[1]}</span>
                                <p className="text-sm mt-0.5">{renderMentionText(timestampMatch[2], userNames)}</p>
                              </>
                            ) : (
                              <p className="text-sm">{renderMentionText(line, userNames)}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No comments yet. Add the first comment above.
                  </p>
                )}
              </div>

              {/* Edit raw notes */}
              {isEditingNotes ? (
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="min-h-[100px]"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveNotes}>
                      <Save className="h-3 w-3 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIsEditingNotes(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={handleStartEdit} className="mt-2 text-muted-foreground">
                  <Edit className="h-3 w-3 mr-1" /> Edit all notes
                </Button>
              )}
            </div>

            <Separator />

            {/* Attachments */}
            <TaskAttachmentsSection taskId={task.id} />
          </div>

          {/* Right Sidebar */}
          <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l p-4 sm:p-6 space-y-5 bg-muted/20">
            {/* Assignee */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assignee</label>
              <Select value={task.assigneeId} onValueChange={(v) => onUpdateAssignee(task.id, v)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assigneeList.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</label>
              <Select value={task.customerId} onValueChange={(v) => onUpdateCustomer(task.id, v)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status / Label */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
              <Select
                value={pendingStatus ?? task.status}
                onValueChange={(v) => setPendingStatus(v === task.status ? null : (v as TMStatus))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_task">New Task</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              {pendingStatus && pendingStatus !== task.status && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={savingStatus}
                    onClick={async () => {
                      try {
                        setSavingStatus(true);
                        await onUpdateStatus(task.id, pendingStatus);
                        toast({ title: "Status updated", description: statusLabel(pendingStatus) });
                        setPendingStatus(null);
                      } catch (e) {
                        toast({ title: "Failed to update status", variant: "destructive" });
                      } finally {
                        setSavingStatus(false);
                      }
                    }}
                  >
                    {savingStatus ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Save className="h-3 w-3 mr-1.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPendingStatus(null)} disabled={savingStatus}>
                    Cancel
                  </Button>
                </div>
              )}
              <div className="mt-2">
                <Badge className={statusColor(task.status)}>{statusLabel(task.status)}</Badge>
              </div>
            </div>

            <>
              <Separator />

              {/* Time Tracking - visible to all users; billing details gated separately */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time Tracking</label>
                <div className="mt-2 bg-background rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <Timer className="h-4 w-4 text-primary" />
                      Time
                    </span>
                    <span className="text-sm font-mono font-semibold">
                      {formatTimeDisplay(displayTotal)}
                    </span>
                  </div>

                  {/* Timer controls */}
                  <div className="space-y-1.5">
                    {task.isTimerRunning ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="w-full"
                        onClick={() => onStopTimer(task)}
                      >
                        <Square className="h-3 w-3 mr-1.5 fill-current" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => onStartTimer(task)}
                      >
                        <Play className="h-3 w-3 mr-1.5 fill-current" />
                        Start
                      </Button>
                    )}
                    {task.isTimerRunning && (
                      <div className="text-center text-xs font-mono text-muted-foreground">
                        Running: {formatTimeDisplay(currentRunning)}
                      </div>
                    )}
                  </div>


                  {/* Manual time edit button */}
                  {!task.isTimerRunning && onUpdateTime && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowTimeEdit(true)}
                    >
                      <Edit className="h-3 w-3 mr-1.5" />
                      Edit Time Manually
                    </Button>
                  )}

                  {canViewBilling && taskCanShowBilling && customerHourlyRate > 0 && displayBillableSeconds > 0 && (
                    <div className="pt-2 border-t">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Rate</span>
                        <span className="font-medium">{formatGBP(customerHourlyRate)}/hr</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Cost</span>
                        <span className="font-semibold text-primary">{formatGBP(displayCost)}</span>
                      </div>
                    </div>
                  )}

                  {canViewBilling && taskCanShowBilling && customerHourlyRate <= 0 && (
                    <div className="pt-2 border-t text-xs text-muted-foreground">
                      No hourly rate is set on this customer package yet.
                    </div>
                  )}

                  {task.billableTime !== undefined && task.billableTime > 0 && task.billableTime !== task.totalTime && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Billable</span>
                      <span>{formatTimeDisplay(task.billableTime)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>

            <Separator />

            {/* Internal checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox id="task-internal" checked={task.isInternal} disabled />
              <Label htmlFor="task-internal" className="text-sm">Internal task</Label>
            </div>

            {/* Digital Typing toggle (drives DT invoice line) */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="task-dt"
                checked={task.serviceCategory === 'DT'}
                disabled={!onUpdateServiceCategory || task.isInternal}
                onCheckedChange={(checked) =>
                  onUpdateServiceCategory?.(task.id, checked ? 'DT' : 'VA')
                }
              />
              <Label htmlFor="task-dt" className="text-sm">
                Digital Typing
                <span className="ml-2 text-xs text-muted-foreground">
                  (bills minutes × price-per-minute on monthly invoice)
                </span>
              </Label>
            </div>


            {/* Delete - only for roles with delete permission */}
            {canDeleteTask && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-destructive hover:text-destructive"
                onClick={() => { onDelete(task.id); onOpenChange(false); }}
              >
                Delete Task
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Time Edit Dialog */}
      {onUpdateTime && (
        <TimeEditDialog
          open={showTimeEdit}
          onOpenChange={setShowTimeEdit}
          taskTitle={task.title}
          currentTotalTime={task.totalTime || 0}
          currentBillableTime={task.billableTime || task.totalTime || 0}
          onSave={(totalTime, billableTime) => onUpdateTime(task.id, totalTime, billableTime)}
        />
      )}
    </Dialog>
  );
}

function TaskAttachmentsSection({ taskId }: { taskId: string }) {
  const { attachments, isLoading, isUploading, uploadFile, deleteAttachment, downloadFile } = useTaskAttachments(taskId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(uploadFile);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files) Array.from(files).forEach(uploadFile);
  }, [uploadFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string | null) => {
    if (!type) return <File className="h-4 w-4" />;
    if (type.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (type.includes('pdf') || type.includes('doc') || type.includes('text')) return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  return (
    <div>
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Paperclip className="h-4 w-4" />
        Attachments
        {attachments.length > 0 && (
          <span className="text-xs text-muted-foreground font-normal">({attachments.length})</span>
        )}
      </h3>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
        }`}
      >
        {isUploading ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Uploading...</span>
          </div>
        ) : (
          <>
            <Paperclip className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm text-muted-foreground">
              Drop files here or click to upload
            </p>
          </>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="mt-3 space-y-2">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 hover:bg-muted/50 group">
              <div className="text-muted-foreground flex-shrink-0">
                {getFileIcon(att.content_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate font-medium">{att.file_name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(att.file_size)}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); downloadFile(att); }}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); deleteAttachment(att); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
