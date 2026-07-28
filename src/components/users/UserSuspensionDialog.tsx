import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { asPromise } from "@/lib/supabaseRpc";
import { toast } from "sonner";

export interface SuspensionOverviewRow {
  user_id: string;
  state: string;
  reason: string | null;
  state_entered_at: string | null;
  suspend_until: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  is_suspended: boolean;
}

interface HistoryRow {
  id: string;
  action: string;
  from_state: string | null;
  to_state: string | null;
  reason: string | null;
  actor_name: string | null;
  suspend_until: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: { user_id: string; name: string; email: string } | null;
  suspension: SuspensionOverviewRow | null;
  onCompleted: () => void | Promise<void>;
}

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB");
};

const ACTION_LABELS: Record<string, string> = {
  reserve: "Requested",
  execute_start: "Started",
  complete_success: "Completed",
  complete_failure: "Failed",
};

export function UserSuspensionDialog({ open, onOpenChange, targetUser, suspension, onCompleted }: Props) {
  const isSuspended = !!suspension?.is_suspended;
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"manual" | "timed">("manual");
  const [until, setUntil] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setMode("manual");
      setUntil("");
      setConfirmed(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const loadHistory = useCallback(async () => {
    if (!targetUser) return;
    setHistoryLoading(true);
    setHistoryError(false);
    const { data, error: err } = await asPromise(
      supabase.rpc("get_user_suspension_history", { p_target_user_id: targetUser.user_id })
    );
    if (err) setHistoryError(true);
    else setHistory(((data as HistoryRow[] | null) ?? []));
    setHistoryLoading(false);
  }, [targetUser]);

  useEffect(() => {
    if (open) void loadHistory();
  }, [open, loadHistory]);

  const submit = async () => {
    if (!targetUser || submitting) return;
    setError(null);

    if (!isSuspended) {
      if (!reason.trim()) { setError("A suspension reason is required."); return; }
      if (!confirmed) { setError("Please confirm you understand this user will lose portal access."); return; }
      if (mode === "timed") {
        const d = new Date(until);
        if (!until || Number.isNaN(d.getTime())) { setError("Please choose a valid end date and time."); return; }
        if (d.getTime() <= Date.now()) { setError("The scheduled end date must be in the future."); return; }
      }
    }

    setSubmitting(true);
    try {
      const { data, error: err } = isSuspended
        ? await asPromise(supabase.rpc("admin_reinstate_user", {
            p_target_user_id: targetUser.user_id,
            p_reason: reason.trim() || null,
          }))
        : await asPromise(supabase.rpc("admin_suspend_user", {
            p_target_user_id: targetUser.user_id,
            p_reason: reason.trim(),
            p_suspend_until: mode === "timed" ? new Date(until).toISOString() : null,
          }));

      if (err) throw new Error(err.message || "The operation could not be completed.");
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.outcome !== "ok") {
        throw new Error(row?.message || "The operation could not be completed.");
      }

      toast.success(isSuspended ? "User reinstated" : "User suspended");
      await onCompleted();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "The operation could not be completed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSuspended ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            {isSuspended ? "Reinstate User" : "Suspend User"}
          </DialogTitle>
          <DialogDescription>
            {targetUser?.name} · {targetUser?.email}
          </DialogDescription>
        </DialogHeader>

        {isSuspended && suspension && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
            <Badge variant="destructive" className="text-xs">Suspended</Badge>
            <div><span className="text-muted-foreground">Reason:</span> {suspension.reason || "—"}</div>
            <div><span className="text-muted-foreground">Suspended:</span> {fmt(suspension.state_entered_at)}</div>
            <div><span className="text-muted-foreground">Suspended by:</span> {suspension.actor_name || "—"}</div>
            {suspension.suspend_until && (
              <div><span className="text-muted-foreground">Scheduled end:</span> {fmt(suspension.suspend_until)}</div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="suspension-reason">
              {isSuspended ? "Reinstatement note (optional)" : "Suspension reason"}
            </Label>
            <Textarea
              id="suspension-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isSuspended ? "Optional note for the record" : "Explain why this user is being suspended"}
            />
          </div>

          {!isSuspended && (
            <>
              <div className="space-y-2">
                <Label>Suspension type</Label>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as "manual" | "timed")}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="manual" id="mode-manual" />
                    <Label htmlFor="mode-manual" className="font-normal">Until manually reinstated</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="timed" id="mode-timed" />
                    <Label htmlFor="mode-timed" className="font-normal">Until a selected date and time</Label>
                  </div>
                </RadioGroup>
              </div>

              {mode === "timed" && (
                <div className="space-y-2">
                  <Label htmlFor="suspend-until">End date and time</Label>
                  <Input
                    id="suspend-until"
                    type="datetime-local"
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                </div>
              )}

              <div className="flex items-start gap-2">
                <Checkbox
                  id="suspend-confirm"
                  checked={confirmed}
                  onCheckedChange={(c) => setConfirmed(c === true)}
                />
                <Label htmlFor="suspend-confirm" className="font-normal leading-snug">
                  I understand this user will lose access to the portal.
                </Label>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <div className="space-y-2">
                <p className="text-foreground">{error}</p>
                <Button size="sm" variant="outline" onClick={submit} disabled={submitting}>Retry</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Suspension history</Label>
            {historyLoading ? (
              <p className="text-sm text-muted-foreground">Loading history…</p>
            ) : historyError ? (
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">History could not be loaded.</p>
                <Button size="sm" variant="outline" onClick={() => void loadHistory()}>Retry</Button>
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suspension history for this user.</p>
            ) : (
              <div className="rounded-md border border-border divide-y">
                {history.map((h) => (
                  <div key={h.id} className="p-2 text-xs space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {ACTION_LABELS[h.action] ?? h.action}
                        {h.to_state ? ` · ${h.to_state.replace(/_/g, " ")}` : ""}
                      </span>
                      <span className="text-muted-foreground">{fmt(h.created_at)}</span>
                    </div>
                    <div className="text-muted-foreground">Reason: {h.reason || "—"}</div>
                    <div className="text-muted-foreground">Administrator: {h.actor_name || "—"}</div>
                    {h.suspend_until && (
                      <div className="text-muted-foreground">Scheduled end: {fmt(h.suspend_until)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting}
            variant={isSuspended ? "default" : "destructive"}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isSuspended ? "Reinstate User" : "Confirm Suspension"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
