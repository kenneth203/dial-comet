import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2, MoreVertical, ClipboardCheck, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

type Status = "not_started" | "completed" | "overdue" | "skipped" | "not_applicable";
type Priority = "low" | "medium" | "high" | "critical";

interface ChecklistInstance {
  id: string;
  title: string;
  description: string | null;
  due_time: string | null;
  priority: Priority;
  status: Status;
  task_date: string;
  occurrence_label: string | null;
  completed_at: string | null;
  completion_notes: string | null;
  skipped_reason: string | null;
  is_overdue: boolean;
  customer_id: string | null;
  is_internal: boolean;
  template_id: string | null;
  contact_names: string[];
  require_contact_names: boolean;
  min_contact_names: number;
}

const priorityClass: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100",
  high: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
  critical: "bg-destructive/15 text-destructive",
};

const statusClass: Record<Status, string> = {
  not_started: "border-border",
  completed: "border-green-500/40 bg-green-50/40 dark:bg-green-950/20",
  overdue: "border-destructive/50 bg-destructive/5",
  skipped: "border-muted bg-muted/30 opacity-70",
  not_applicable: "border-muted bg-muted/30 opacity-70",
};

const CHECKLIST_SELECT = "id,title,description,due_time,priority,status,task_date,occurrence_label,completed_at,completion_notes,skipped_reason,is_overdue,customer_id,is_internal,template_id,contact_names";

const getLocalDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const hasOpenChecklistItems = (list: ChecklistInstance[]) =>
  list.some((item) => item.status === "not_started" || item.status === "overdue");

const formatTime = (t: string | null) => {
  if (!t) return "";
  return t.slice(0, 5);
};

interface ChecklistRowProps {
  item: ChecklistInstance;
  noteValue: string;
  onNoteChange: (val: string) => Promise<boolean> | boolean;
  onToggleComplete: (item: ChecklistInstance, checked: boolean, noteOverride?: string) => void;
  onSkip: (mode: "skipped" | "not_applicable") => void;
  onContactNamesChange?: (item: ChecklistInstance, names: string[]) => Promise<boolean> | boolean;
}

function ChecklistRow({ item, noteValue, onNoteChange, onToggleComplete, onSkip, onContactNamesChange }: ChecklistRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [localNote, setLocalNote] = useState(noteValue);
  const [dirty, setDirty] = useState(false);
  const namesDraftKey = `checklist-names-draft:${item.id}`;
  const [namesText, setNamesText] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const draft = window.localStorage.getItem(namesDraftKey);
        if (draft !== null) return draft;
      } catch { /* ignore */ }
    }
    return (item.contact_names ?? []).join("\n");
  });
  const [namesDirty, setNamesDirty] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const draft = window.localStorage.getItem(namesDraftKey);
        if (draft !== null && draft !== (item.contact_names ?? []).join("\n")) return true;
      } catch { /* ignore */ }
    }
    return false;
  });
  const [savingNames, setSavingNames] = useState(false);
  const [lastAutosaveAt, setLastAutosaveAt] = useState<Date | null>(null);
  const [autosaveError, setAutosaveError] = useState(false);

  // Undo history for contact names — snapshots taken before mutations so the
  // user can revert accidental typing before autosave persists it.
  const namesHistoryRef = useRef<string[]>([]);
  const lastSnapshotAtRef = useRef<number>(0);
  const [undoTick, setUndoTick] = useState(0);
  const snapshotNames = useCallback((current: string) => {
    const now = Date.now();
    const stack = namesHistoryRef.current;
    const last = stack[stack.length - 1];
    // Coalesce rapid keystrokes: only snapshot if >600ms since last or content differs meaningfully.
    if (last === current) return;
    if (now - lastSnapshotAtRef.current < 600 && last !== undefined) return;
    stack.push(current);
    if (stack.length > 50) stack.shift();
    lastSnapshotAtRef.current = now;
    setUndoTick((t) => t + 1);
  }, []);
  const undoNames = useCallback(() => {
    const stack = namesHistoryRef.current;
    const prev = stack.pop();
    if (prev === undefined) return;
    setNamesText(prev);
    setNamesDirty(true);
    lastSnapshotAtRef.current = 0;
    setUndoTick((t) => t + 1);
  }, []);


  // Sync from parent when not actively editing
  useEffect(() => {
    if (!dirty) setLocalNote(noteValue);
  }, [noteValue, dirty]);

  useEffect(() => {
    if (namesDirty) return;
    const incoming = (item.contact_names ?? []);
    const localParsed = namesText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    // Preserve the user's exact whitespace (blank lines, trailing newlines)
    // whenever the parsed names already match what the server has. Only
    // overwrite when the server's names actually differ from the local
    // parsed set — e.g. another device saved changes.
    const same = incoming.length === localParsed.length
      && incoming.every((n, i) => n === localParsed[i]);
    if (!same) setNamesText(incoming.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.contact_names, namesDirty]);

  const parsedNames = namesText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const requiresNames = Boolean(item.require_contact_names);
  const minNames = Math.max(1, Number(item.min_contact_names) || 3);
  const namesMet = !requiresNames || parsedNames.length >= minNames;
  const isDone = item.status === "completed";

  const isSkipped = item.status === "skipped" || item.status === "not_applicable";
  const isOverdue = item.status === "overdue";

  const progressPct = (() => {
    if (isDone || isSkipped) return 100;
    if (isOverdue) return 100;
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    let target: Date;
    if (item.due_time) {
      const [h, m] = item.due_time.split(":").map(Number);
      target = new Date(now);
      target.setHours(h || 23, m || 59, 0, 0);
    } else {
      target = new Date(now);
      target.setHours(23, 59, 0, 0);
    }
    const total = target.getTime() - startOfDay.getTime();
    const elapsed = now.getTime() - startOfDay.getTime();
    if (total <= 0) return 100;
    return Math.max(4, Math.min(100, (elapsed / total) * 100));
  })();

  const barColor = isDone
    ? "bg-green-500"
    : isSkipped
    ? "bg-muted-foreground"
    : isOverdue || item.priority === "critical"
    ? "bg-destructive"
    : item.priority === "high"
    ? "bg-orange-500"
    : item.priority === "medium"
    ? "bg-blue-500"
    : "bg-muted-foreground";

  const saveNote = async () => {
    const saved = await onNoteChange(localNote);
    if (saved) setDirty(false);
  };

  const autosaveTimerRef = useRef<number | null>(null);

  const saveNames = async (opts?: { silent?: boolean }) => {
    if (!onContactNamesChange) return false;
    // Cancel any pending debounced autosave so we don't double-save
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (!opts?.silent) setSavingNames(true);
    const ok = await onContactNamesChange(item, parsedNames);
    if (!opts?.silent) setSavingNames(false);
    if (ok) {
      setNamesDirty(false);
      setAutosaveError(false);
      setLastAutosaveAt(new Date());
      try { window.localStorage.removeItem(namesDraftKey); } catch { /* ignore */ }
    } else if (opts?.silent) {
      setAutosaveError(true);
    }
    return ok;
  };

  const handleManualSave = async () => {
    const ok = await saveNames();
    if (ok) {
      toast({ title: "Contact names saved", description: `${parsedNames.length} name${parsedNames.length === 1 ? "" : "s"} saved.` });
    } else {
      toast({ title: "Save failed", description: "Please try again in a moment.", variant: "destructive" });
    }
  };

  // Persist draft to localStorage on every keystroke so a refresh preserves it
  useEffect(() => {
    if (!requiresNames) return;
    if (!namesDirty) return;
    try { window.localStorage.setItem(namesDraftKey, namesText); } catch { /* ignore */ }
  }, [namesText, namesDirty, requiresNames, namesDraftKey]);

  // Debounced autosave (1.5s) while the user is typing contact names
  useEffect(() => {
    if (!requiresNames) return;
    if (!namesDirty) return;
    if (isDone || isSkipped) return;
    const t = window.setTimeout(() => { void saveNames({ silent: true }); }, 1500);
    autosaveTimerRef.current = t as unknown as number;
    return () => {
      window.clearTimeout(t);
      if (autosaveTimerRef.current === (t as unknown as number)) autosaveTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesText, namesDirty, requiresNames, isDone, isSkipped]);

  const canComplete = !isDone && !isSkipped && namesMet;

  const handleToggle = (c: boolean) => {
    if (!c) return;
    if (requiresNames && !namesMet) {
      setExpanded(true);
      const remaining = Math.max(0, minNames - parsedNames.length);
      toast({
        title: "Contact names required",
        description: `Add ${remaining} more name${remaining === 1 ? "" : "s"} (minimum ${minNames}) before completing this task.`,
        variant: "destructive",
      });
      return;
    }
    onToggleComplete(item, true, localNote);
  };

  return (
    <div className={`rounded-lg border transition-colors ${statusClass[item.status]}`}>
      <div className="flex items-center gap-3 p-3">
        <Checkbox
          checked={isDone}
          disabled={isDone || isSkipped || (requiresNames && !namesMet)}
          onCheckedChange={(c) => handleToggle(Boolean(c))}
          onClick={(e) => e.stopPropagation()}
          title={requiresNames && !namesMet ? `Enter ${Math.max(0, minNames - parsedNames.length)} more contact name${Math.max(0, minNames - parsedNames.length) === 1 ? "" : "s"} (min ${minNames}) to complete` : undefined}
        />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <span className={`font-medium text-sm truncate ${isDone ? "line-through text-muted-foreground" : ""}`}>
            {item.title}
          </span>
          <div className="hidden sm:block flex-1 max-w-[180px] h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${progressPct}%` }} />
          </div>
          {item.due_time && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(item.due_time)}</span>
          )}
          {isOverdue && (
            <Badge variant="destructive" className="text-[10px]">
              <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
            </Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {(item.status === "not_started" || item.status === "overdue") && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSkip("skipped")}>Skip with reason</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSkip("not_applicable")}>Mark not applicable</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 pl-10 space-y-2">
          <div className="sm:hidden h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[10px] uppercase ${priorityClass[item.priority]}`}>
              {item.priority}
            </Badge>
            {item.status === "skipped" && <Badge variant="secondary" className="text-[10px]">Skipped</Badge>}
            {item.status === "not_applicable" && <Badge variant="secondary" className="text-[10px]">N/A</Badge>}
            {requiresNames && (
              <Badge
                variant={namesMet ? "outline" : "destructive"}
                className="text-[10px]"
                title={namesMet ? "Minimum contact names entered" : `${Math.max(0, minNames - parsedNames.length)} more required to unlock completion`}
              >
                Contacts {parsedNames.length}/{minNames}
                {!namesMet && ` · ${Math.max(0, minNames - parsedNames.length)} more needed`}
              </Badge>
            )}
          </div>
          {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
          {requiresNames && (item.status === "not_started" || item.status === "overdue") && (() => {
            const remaining = Math.max(0, minNames - parsedNames.length);
            const pct = Math.min(100, Math.round((parsedNames.length / minNames) * 100));
            const lowerCased = parsedNames.map((n) => n.toLowerCase());
            const duplicateCount = lowerCased.length - new Set(lowerCased).size;
            return (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium flex items-center gap-2">
                    People contacted this shift <span className="text-muted-foreground">(one name per line, min {minNames})</span>
                    {(() => {
                      // Compact sync badge: dot + label reflecting autosave state.
                      const state: { cls: string; dot: string; label: string; title: string } =
                        savingNames
                          ? { cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100", dot: "bg-blue-500 animate-pulse", label: "Syncing…", title: "Autosaving your changes now" }
                          : autosaveError
                            ? { cls: "bg-destructive/15 text-destructive", dot: "bg-destructive", label: "Sync failed", title: "Autosave failed — will retry on next change" }
                            : namesDirty
                              ? { cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100", dot: "bg-amber-500", label: "Unsaved", title: "Local changes not yet saved" }
                              : lastAutosaveAt
                                ? { cls: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100", dot: "bg-green-500", label: `Saved ${lastAutosaveAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, title: "All changes saved to the server" }
                                : { cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50", label: "Idle", title: "No changes yet" };
                      return (
                        <span
                          role="status"
                          aria-live="polite"
                          title={state.title}
                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${state.cls}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} aria-hidden />
                          {state.label}
                        </span>
                      );
                    })()}
                  </label>
                  <span className={`text-[10px] font-medium ${namesMet ? "text-green-600" : "text-destructive"}`}>
                    {namesMet
                      ? `✓ ${parsedNames.length}/${minNames} entered`
                      : `${parsedNames.length}/${minNames} · ${remaining} more needed`}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden" aria-hidden>
                  <div
                    className={`h-full transition-all ${namesMet ? "bg-green-500" : "bg-destructive"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <Textarea
                  placeholder={`e.g.\nJane Smith\nJohn Doe\nSarah Patel`}
                  value={namesText}
                  onChange={(e) => {
                    snapshotNames(namesText);
                    setNamesText(e.target.value);
                    setNamesDirty(true);
                  }}
                  onKeyDown={(e) => {
                    // Ctrl/Cmd+Z → in-app undo (works even after autosave re-renders).
                    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
                      if (namesHistoryRef.current.length > 0) {
                        e.preventDefault();
                        undoNames();
                        return;
                      }
                    }
                    if (e.key === "Enter") {
                      // Insert a real newline at the caret and lock the caret
                      // to the start of the new line so no re-render (autosave,
                      // parent sync) can bounce focus back to the previous line.
                      e.preventDefault();
                      const el = e.currentTarget;
                      const start = el.selectionStart ?? namesText.length;
                      const end = el.selectionEnd ?? start;
                      const next = namesText.slice(0, start) + "\n" + namesText.slice(end);
                      const caret = start + 1;
                      snapshotNames(namesText);
                      setNamesText(next);
                      setNamesDirty(true);
                      requestAnimationFrame(() => {
                        try { el.setSelectionRange(caret, caret); } catch { /* ignore */ }
                      });
                    }
                  }}
                  onBlur={() => { if (namesDirty) void saveNames(); }}
                  aria-invalid={!namesMet}
                  aria-describedby={!namesMet ? `names-error-${item.id}` : undefined}
                  className={`text-xs min-h-[72px] ${!namesMet ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                {!namesMet ? (
                  <p
                    id={`names-error-${item.id}`}
                    role="alert"
                    className="text-[11px] text-destructive flex items-start gap-1"
                  >
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      Add <strong>{remaining}</strong> more contact name{remaining === 1 ? "" : "s"} to unlock the completion checkbox (minimum {minNames}).
                    </span>
                  </p>
                ) : (
                  <p className="text-[11px] text-green-600">
                    Minimum met — you can now mark this task complete.
                  </p>
                )}
                {duplicateCount > 0 && (
                  <p className="text-[11px] text-orange-600">
                    {duplicateCount} duplicate name{duplicateCount === 1 ? "" : "s"} detected — duplicates don't count toward the minimum.
                  </p>
                )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {savingNames
                    ? "Saving…"
                    : namesDirty
                      ? "Unsaved changes — autosaving…"
                      : autosaveError
                        ? <span className="text-destructive">Autosave failed — retrying on next change</span>
                        : lastAutosaveAt
                          ? `Autosaved ${lastAutosaveAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                          : "Autosaves as you type"}
                </span>
                <div className="flex justify-end gap-2">
                  {namesHistoryRef.current.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={undoNames}
                      disabled={savingNames}
                      title="Undo last change (⌘/Ctrl+Z)"
                    >
                      Undo ({namesHistoryRef.current.length})
                    </Button>
                  )}
                  {namesDirty && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (autosaveTimerRef.current !== null) {
                          window.clearTimeout(autosaveTimerRef.current);
                          autosaveTimerRef.current = null;
                        }
                        setNamesText((item.contact_names ?? []).join("\n"));
                        setNamesDirty(false);
                        namesHistoryRef.current = [];
                        setUndoTick((t) => t + 1);
                        try { window.localStorage.removeItem(namesDraftKey); } catch { /* ignore */ }
                      }}
                      disabled={savingNames}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void handleManualSave()}
                    disabled={savingNames || (!namesDirty && !autosaveError)}
                    title={namesDirty ? "Save contact names now" : autosaveError ? "Retry save" : "No changes to save"}
                  >
                    {savingNames ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save names"}
                  </Button>
                </div>
              </div>
              </div>
            );
          })()}
          {requiresNames && item.status === "completed" && (item.contact_names?.length ?? 0) > 0 && (
            <div className="text-xs">
              <div className="font-medium mb-0.5">People contacted:</div>
              <ul className="list-disc pl-4 text-muted-foreground">
                {item.contact_names.map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}
              </ul>
            </div>
          )}
          {item.status === "not_started" || item.status === "overdue" ? (
            <div className="space-y-2">
              <Textarea
                placeholder="Add notes (optional)... (Enter or ⌘/Ctrl+S to save, Shift+Enter for newline, Esc to cancel)"
                value={localNote}
                onChange={(e) => { setLocalNote(e.target.value); setDirty(true); }}
                onBlur={() => { if (dirty) void saveNote(); }}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" && !e.shiftKey) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s")) {
                    e.preventDefault();
                    if (dirty) void saveNote();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setLocalNote(noteValue);
                    setDirty(false);
                  }
                }}
                className="text-xs min-h-[48px]"
              />

              {dirty && (
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setLocalNote(noteValue); setDirty(false); }}
                  >
                    Cancel
                  </Button>
                  <Button type="button" size="sm" className="h-7 text-xs" onClick={() => void saveNote()}>
                    Save note
                  </Button>
                </div>
              )}
            </div>
          ) : (
            (item.completion_notes || item.skipped_reason) && (
              <p className="text-xs italic text-muted-foreground">
                {item.completion_notes || `Reason: ${item.skipped_reason}`}
              </p>
            )
          )}
          {item.completed_at && (
            <p className="text-[10px] text-muted-foreground">
              Completed {new Date(item.completed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface ChecklistGroupProps {
  groupName: string;
  groupItems: ChecklistInstance[];
  renderRow: (item: ChecklistInstance) => JSX.Element;
}

function ChecklistGroup({ groupName, groupItems, renderRow }: ChecklistGroupProps) {
  const [open, setOpen] = useState(false);
  const total = groupItems.length;
  const doneCount = groupItems.filter((i) => i.status === "completed").length;
  const overdueCount = groupItems.filter((i) => i.status === "overdue").length;
  const skippedCount = groupItems.filter((i) => i.status === "skipped" || i.status === "not_applicable").length;
  const progressPct = total === 0 ? 0 : Math.max(4, ((doneCount + skippedCount) / total) * 100);
  const allDone = doneCount + skippedCount === total;
  const barColor = allDone ? "bg-green-500" : overdueCount > 0 ? "bg-destructive" : "bg-primary";
  const borderClass = overdueCount > 0
    ? "border-destructive/50 bg-destructive/5"
    : allDone
    ? "border-green-500/40 bg-green-50/40 dark:bg-green-950/20"
    : "border-border";

  return (
    <div className={`rounded-lg border ${borderClass}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
        <span className="font-medium text-sm truncate flex-1 min-w-0">{groupName}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{doneCount + skippedCount}/{total}</span>
        <div className="hidden sm:block w-[180px] h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${progressPct}%` }} />
        </div>
        {overdueCount > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            <AlertTriangle className="h-3 w-3 mr-1" /> {overdueCount} overdue
          </Badge>
        )}
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-2 border-t pt-2">
          {groupItems.map(renderRow)}
        </div>
      )}
    </div>
  );
}

export default function DailyChecklist({ hideTabs = false, hideClosed = false }: { hideTabs?: boolean; hideClosed?: boolean } = {}) {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [autoRetrying, setAutoRetrying] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [skipTarget, setSkipTarget] = useState<{ id: string; mode: "skipped" | "not_applicable" } | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});

  const today = getLocalDateKey();

  // Concurrency guards: prevent racing loads from clearing items with stale empty arrays
  const loadSeqRef = useRef(0);
  const lastAppliedSeqRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const emptyRetryRef = useRef(0);

  const fetchChecklistItems = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("checklist_instances")
      .select(CHECKLIST_SELECT)
      .eq("user_id", user!.id)
      .eq("task_date", today)
      .order("due_time", { ascending: true, nullsFirst: false });

    let rows = (data || []) as any[];
    const tmplIds = Array.from(new Set(rows.map((r) => r.template_id).filter(Boolean))) as string[];
    let tmplMap: Record<string, { require_contact_names: boolean; min_contact_names: number }> = {};
    if (tmplIds.length > 0) {
      const { data: tmpls } = await (supabase as any)
        .from("checklist_templates")
        .select("id,require_contact_names,min_contact_names")
        .in("id", tmplIds);
      (tmpls || []).forEach((t: any) => {
        tmplMap[t.id] = {
          require_contact_names: Boolean(t.require_contact_names),
          min_contact_names: Number(t.min_contact_names ?? 3),
        };
      });
    }
    const list: ChecklistInstance[] = rows.map((r) => ({
      ...r,
      contact_names: Array.isArray(r.contact_names) ? r.contact_names : [],
      require_contact_names: r.template_id ? Boolean(tmplMap[r.template_id]?.require_contact_names) : false,
      min_contact_names: r.template_id ? Number(tmplMap[r.template_id]?.min_contact_names ?? 3) : 3,
    }));
    return { list, error };
  }, [user, today]);


  const load = useCallback(async () => {
    if (!user) return;
    const seq = ++loadSeqRef.current;
    const { list: initialList, error } = await fetchChecklistItems();

    // Ignore out-of-order responses
    if (seq < lastAppliedSeqRef.current) return;
    if (error) {
      // Don't blank existing items on transient errors
      setLoading(false);
      return;
    }
    lastAppliedSeqRef.current = seq;

    let list = initialList;

    // If there are no open checklist items, reconcile once with the backend before
    // showing an empty/"all done" state. This covers cron gaps, first load races,
    // refreshes during the delete/regenerate window, and shift boundary rollovers.
    if (!hasOpenChecklistItems(list) && emptyRetryRef.current < 2) {
      emptyRetryRef.current += 1;
      try {
        await (supabase as any).rpc("generate_checklist_for_user", { p_user_id: user.id, p_date: today });
      } catch {/* ignore */}
      const { list: retryList } = await fetchChecklistItems();
      if (retryList.length > 0) list = retryList;
    }

    if (list.length > 0 || hasLoadedOnceRef.current) {
      emptyRetryRef.current = 0;
      hasLoadedOnceRef.current = true;
    }
    setItems(list);
    const ids = Array.from(new Set(list.map((i) => i.customer_id).filter(Boolean))) as string[];
    setCustomerNames((prev) => {
      const missing = ids.filter((id) => !(id in prev));
      if (missing.length === 0) return prev;
      supabase.from("customers").select("id,name").in("id", missing).then(({ data: custs }) => {
        if (custs) {
          setCustomerNames((p) => {
            const next = { ...p };
            (custs as any[]).forEach((c) => { next[c.id] = c.name; });
            return next;
          });
        }
      });
      return prev;
    });
    setLoading(false);
  }, [user, today, fetchChecklistItems]);

  // Debounced load to coalesce realtime bursts (cron syncs can fire many updates at once).
  // Kept short so cross-operator completions and freshly generated items appear within ~150ms.
  const loadDebounceRef = useRef<number | null>(null);
  const scheduleLoad = useCallback((immediate = false) => {
    if (loadDebounceRef.current) window.clearTimeout(loadDebounceRef.current);
    if (immediate) { void load(); return; }
    loadDebounceRef.current = window.setTimeout(() => { void load(); }, 150);
  }, [load]);

  const generate = useCallback(async () => {
    if (!user) return;
    setGenerating(true);
    try {
      await (supabase as any).rpc("generate_checklist_for_user", { p_user_id: user.id, p_date: today });
      await load();
    } catch (e) {
      // silent — generation will be retried next open
    } finally {
      setGenerating(false);
    }
  }, [user, today, load]);

  // Track which shift window we last generated for, so we auto-regenerate
  // when the clock crosses 09:00 / 14:00 / 17:00 boundaries (AM/PM/Evening).
  const lastShiftRef = useRef<string>("");
  const currentShift = () => {
    const h = new Date().getHours();
    if (h < 9) return "pre";
    if (h < 14) return "am";
    if (h < 17) return "pm";
    return "eve";
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      lastShiftRef.current = currentShift();
      await generate();
    })();

    const channel = supabase
      .channel(`checklist_instances_${user.id}`)
      // INSERTs for this user: a new item just appeared (template added, shift opened,
      // cron generated). Apply immediately so it shows up without waiting on the debounce.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checklist_instances", filter: `user_id=eq.${user.id}` }, () => {
        scheduleLoad(true);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "checklist_instances", filter: `user_id=eq.${user.id}` }, () => {
        scheduleLoad(true);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "checklist_instances", filter: `user_id=eq.${user.id}` }, () => {
        scheduleLoad(true);
      })
      // Team-wide: when another operator completes/skips an item we need to mirror
      // that status here. sync_checklist_instance_team_status() fans the change out
      // across sibling rows, but listening to all UPDATEs guarantees we catch it.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "checklist_instances" }, () => {
        scheduleLoad();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checklist_instances" }, () => {
        scheduleLoad();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_logs" }, () => {
        scheduleLoad();
      })
      // New/updated templates can trigger fresh instances via DB cron; refresh shortly after.
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_templates" }, () => {
        scheduleLoad();
      })
      .subscribe();

    // Refresh when tab regains focus. Also re-generate if the shift window
    // has rolled over while the tab was hidden (covers iPad/Safari suspending
    // websockets and the cron-driven sync not yet having run for this user).
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const shift = currentShift();
      if (shift !== lastShiftRef.current) {
        lastShiftRef.current = shift;
        void generate();
      } else {
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // Polling fallback every 45s. Every cycle, also check whether the shift
    // boundary was crossed and trigger generation so PM/Evening items appear
    // without requiring a manual Refresh click.
    const poll = window.setInterval(() => {
      const shift = currentShift();
      if (shift !== lastShiftRef.current) {
        lastShiftRef.current = shift;
        void generate();
      } else {
        void load();
      }
    }, 45000);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(poll);
      if (loadDebounceRef.current) window.clearTimeout(loadDebounceRef.current);
    };
  }, [user, generate, load, scheduleLoad]);



  const toggleComplete = useCallback(async (item: ChecklistInstance, checked: boolean, noteOverride?: string) => {
    if (!checked || item.status === "completed") return;
    const notes = noteOverride ?? noteDraft[item.id] ?? item.completion_notes ?? null;
    // Optimistic: mark as completed immediately so the UI feels instant.
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, status: "completed" as const, completion_notes: notes ?? i.completion_notes, completed_at: new Date().toISOString() }
      : i));
    const { error } = await (supabase as any).rpc("complete_checklist_instance", {
      p_id: item.id,
      p_notes: notes,
    });
    if (error) {
      toast({ title: "Could not complete", description: error.message, variant: "destructive" });
      load();
    } else {
      load();
    }
  }, [noteDraft, load]);

  const saveChecklistNote = useCallback(async (item: ChecklistInstance, val: string): Promise<boolean> => {
    const nextNote = val.trim();
    setNoteDraft((d) => ({ ...d, [item.id]: nextNote }));
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, completion_notes: nextNote || null } : i));

    const { data, error } = await (supabase as any).rpc("save_checklist_instance_note", {
      p_id: item.id,
      p_notes: nextNote,
    });

    if (error) {
      toast({ title: "Could not save note", description: error.message, variant: "destructive" });
      load();
      return false;
    }

    setNoteDraft((d) => ({ ...d, [item.id]: data || "" }));
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, completion_notes: data || null } : i));
    toast({ title: "Note saved" });
    return true;
  }, [load]);

  const saveContactNames = useCallback(async (item: ChecklistInstance, names: string[]): Promise<boolean> => {
    const cleaned = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, contact_names: cleaned } : i));
    const { error } = await (supabase as any)
      .from("checklist_instances")
      .update({ contact_names: cleaned })
      .eq("id", item.id);
    if (error) {
      toast({ title: "Could not save names", description: error.message, variant: "destructive" });
      load();
      return false;
    }
    return true;
  }, [load]);

  const submitSkip = async () => {
    if (!skipTarget || !skipReason.trim()) return;
    const { error } = await (supabase as any).rpc("skip_checklist_instance", {
      p_id: skipTarget.id,
      p_reason: skipReason.trim(),
      p_status: skipTarget.mode,
    });
    if (error) toast({ title: "Could not update", description: error.message, variant: "destructive" });
    else {
      setSkipTarget(null);
      setSkipReason("");
      load();
    }
  };

  const baseToday = items.filter((i) => i.status === "not_started" || i.status === "overdue");
  const todayItems = hideClosed
    ? baseToday.filter((i) => i.status !== "completed" && i.status !== "skipped" && i.status !== "not_applicable")
    : baseToday;
  const completedItems = hideClosed ? [] : items.filter((i) => i.status === "completed");
  const skippedItems = hideClosed ? [] : items.filter((i) => i.status === "skipped" || i.status === "not_applicable");
  const overdueCount = items.filter((i) => i.status === "overdue").length;

  // Self-heal: if we have items but none are active for the current shift,
  // verify with the server once that nothing new should have been generated.
  const shiftGenCheckRef = useRef<string>("");
  useEffect(() => {
    if (!user || loading) return;
    if (todayItems.length > 0) return;
    if (items.length === 0) return; // handled by the empty-retry path in load()
    const key = `${user.id}:${today}:${currentShift()}`;
    if (shiftGenCheckRef.current === key) return;
    shiftGenCheckRef.current = key;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, items.length, todayItems.length, today]);

  // Auto-retry loop when the checklist comes back completely empty.
  // Uses exponential backoff (2s, 4s, 8s — capped at 4 attempts) so the user
  // doesn't have to press Refresh if the first generation race lost.
  useEffect(() => {
    if (!user || loading) return;
    if (items.length > 0) {
      if (autoRetrying) setAutoRetrying(false);
      if (retryAttempt !== 0) setRetryAttempt(0);
      return;
    }
    if (retryAttempt >= 4) {
      if (autoRetrying) setAutoRetrying(false);
      return;
    }
    setAutoRetrying(true);
    const delay = Math.min(8000, 2000 * Math.pow(2, retryAttempt));
    const t = window.setTimeout(async () => {
      try {
        await (supabase as any).rpc("generate_checklist_for_user", { p_user_id: user.id, p_date: today });
      } catch {/* ignore */}
      await load();
      setRetryAttempt((n) => n + 1);
    }, delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, items.length, retryAttempt, today]);


  const renderItem = (item: ChecklistInstance) => (
    <ChecklistRow
      key={item.id}
      item={item}
      noteValue={noteDraft[item.id] ?? item.completion_notes ?? ""}
      onNoteChange={(val) => saveChecklistNote(item, val)}
      onToggleComplete={toggleComplete}
      onSkip={(mode) => { setSkipTarget({ id: item.id, mode }); setSkipReason(""); }}
      onContactNamesChange={saveContactNames}
    />
  );

  const groupItems = (list: ChecklistInstance[]) => {
    const groups = new Map<string, ChecklistInstance[]>();
    const order: string[] = [];
    list.forEach((item) => {
      const key = item.title.includes(" - ") ? item.title.split(" - ")[0].trim() : item.title;
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(item);
    });
    return order.map((k) => ({ name: k, items: groups.get(k)! }));
  };

  const renderGroupedList = (list: ChecklistInstance[]) => {
    const buckets = new Map<string, { label: string; items: ChecklistInstance[] }>();
    list.forEach((item) => {
      let key: string;
      let label: string;
      if (item.is_internal) {
        key = "__internal";
        label = "Internal (Team)";
      } else if (item.customer_id) {
        key = `c:${item.customer_id}`;
        label = customerNames[item.customer_id] ?? "Customer";
      } else {
        key = "__general";
        label = "General";
      }
      if (!buckets.has(key)) buckets.set(key, { label, items: [] });
      buckets.get(key)!.items.push(item);
    });

    const order = Array.from(buckets.keys()).sort((a, b) => {
      if (a === "__internal") return -1;
      if (b === "__internal") return 1;
      if (a === "__general") return 1;
      if (b === "__general") return -1;
      return (buckets.get(a)!.label).localeCompare(buckets.get(b)!.label);
    });

    const renderBucketItems = (bucketItems: ChecklistInstance[]) => {
      const grouped = groupItems(bucketItems);
      return grouped.map((g) =>
        g.items.length === 1 ? (
          <ChecklistRow
            key={g.items[0].id}
            item={g.items[0]}
            noteValue={noteDraft[g.items[0].id] ?? g.items[0].completion_notes ?? ""}
            onNoteChange={(val) => saveChecklistNote(g.items[0], val)}
            onToggleComplete={toggleComplete}
            onSkip={(mode) => { setSkipTarget({ id: g.items[0].id, mode }); setSkipReason(""); }}
            onContactNamesChange={saveContactNames}
          />
        ) : (
          <ChecklistGroup key={g.name} groupName={g.name} groupItems={g.items} renderRow={renderItem} />
        )
      );
    };

    if (order.length === 1 && order[0] === "__general") {
      return renderBucketItems(buckets.get("__general")!.items);
    }

    return order.map((k) => {
      const b = buckets.get(k)!;
      return (
        <div key={k} className="space-y-2">
          <div className="flex items-center gap-2 pt-2 pb-1 border-b border-border/60">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{b.label}</span>
            <span className="text-[10px] text-muted-foreground">({b.items.length})</span>
          </div>
          <div className="space-y-2">{renderBucketItems(b.items)}</div>
        </div>
      );
    });
  };

  return (
    <Card className="mb-4 border-border shadow-[var(--shadow-card)]">
      <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
            Daily Checklist
            {overdueCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">{overdueCount} overdue</Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            Recurring checks for your shift. Tick each one as you complete it.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2 py-2" aria-live="polite" aria-busy="true">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading today's checklist…
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-lg border border-border bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          autoRetrying ? (
            <div className="space-y-2 py-2" aria-live="polite" aria-busy="true">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                No tasks loaded yet — retrying automatically (attempt {retryAttempt + 1} of 4)…
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded-lg border border-border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="py-4 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                No checklist tasks for today. Ask your supervisor to add a template.
              </p>
              <Button size="sm" variant="outline" onClick={() => { setRetryAttempt(0); void generate(); }}>
                Try again
              </Button>
            </div>
          )
        ) : (
          hideTabs ? (
            <div className="space-y-2">
              {todayItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">All done for now.</p>
              ) : renderGroupedList(todayItems)}
            </div>
          ) : (
            <Tabs defaultValue="today">
              <TabsList>
                <TabsTrigger value="today">Today ({todayItems.length})</TabsTrigger>
                <TabsTrigger value="done">Completed ({completedItems.length})</TabsTrigger>
                <TabsTrigger value="skipped">Skipped ({skippedItems.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="today" className="space-y-2">
                {todayItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">All done for now.</p>
                ) : renderGroupedList(todayItems)}
              </TabsContent>
              <TabsContent value="done" className="space-y-2">
                {renderGroupedList(completedItems)}
              </TabsContent>
              <TabsContent value="skipped" className="space-y-2">
                {renderGroupedList(skippedItems)}
              </TabsContent>
            </Tabs>
          )
        )}
      </CardContent>

      <Dialog open={!!skipTarget} onOpenChange={(o) => !o && setSkipTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {skipTarget?.mode === "skipped" ? "Skip task" : "Mark as not applicable"}
            </DialogTitle>
            <DialogDescription>Please enter a reason. This will be recorded.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="Reason..."
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSkipTarget(null)}>Cancel</Button>
            <Button onClick={submitSkip} disabled={!skipReason.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
