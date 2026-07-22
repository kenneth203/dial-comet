import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { Loader2, GripVertical, ArrowUp, ArrowDown, Mail, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";

import EmailIntakeRules from "@/components/config/EmailIntakeRules";
import EmailRoutingAuditLog from "@/components/config/EmailRoutingAuditLog";

interface SystemUser {
  id: string;
  name: string | null;
  email: string | null;
  status: string | null;
}

export default function EmailIntakeSettings() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [group, setGroup] = useState<string[]>([]);
  const [lastAssigned, setLastAssigned] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [gmailQuery, setGmailQuery] = useState<string>("");
  const [gmailPollEnabled, setGmailPollEnabled] = useState<boolean>(true);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: userRows }, { data: settingsRow }] = await Promise.all([
        supabase.from("system_users").select("id, name, email, status").order("name"),
        (supabase.from("email_intake_settings" as any).select("assignee_group, last_assigned_user_id, gmail_query, gmail_poll_enabled").maybeSingle() as any),
      ]);
      setUsers((userRows || []) as SystemUser[]);
      setGroup(((settingsRow?.assignee_group || []) as string[]).filter(Boolean));
      setLastAssigned((settingsRow?.last_assigned_user_id as string) || null);
      setGmailQuery((settingsRow?.gmail_query as string) || "to:dictations@thevateam.london is:unread newer_than:7d");
      setGmailPollEnabled(settingsRow?.gmail_poll_enabled !== false);
      setLoading(false);
    })();
  }, []);

  const userMap = useMemo(() => {
    const m = new Map<string, SystemUser>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return users.filter((u) => {
      if (!f) return true;
      return (u.name || "").toLowerCase().includes(f) || (u.email || "").toLowerCase().includes(f);
    });
  }, [users, filter]);

  const toggle = (id: string) => {
    setGroup((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const move = (id: string, dir: -1 | 1) => {
    setGroup((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase.from("email_intake_settings" as any) as any)
      .update({ assignee_group: group })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: "Email intake group updated." });
  };

  const resetCursor = async () => {
    const { error } = await (supabase.from("email_intake_settings" as any) as any)
      .update({ last_assigned_user_id: null })
      .eq("id", true);
    if (error) {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
      return;
    }
    setLastAssigned(null);
    toast({ title: "Reset", description: "Round-robin cursor cleared." });
  };

  const saveGmailConfig = async () => {
    const { error } = await (supabase.from("email_intake_settings" as any) as any)
      .update({ gmail_query: gmailQuery, gmail_poll_enabled: gmailPollEnabled })
      .eq("id", true);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: "Gmail polling settings updated." });
  };

  const pollNow = async () => {
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke("poll-gmail-dictations", { body: {} });
      if (error) throw error;
      const scanned = (data as any)?.scanned ?? 0;
      const processed = (data as any)?.processed ?? 0;
      const failed = (data as any)?.failed ?? 0;
      const firstError = ((data as any)?.results || []).find((r: any) => !r.ok)?.error;
      toast({
        title: failed ? "Poll completed with errors" : "Poll complete",
        description: firstError
          ? `Scanned ${scanned} · Processed ${processed} · Failed ${failed}: ${firstError}`
          : `Scanned ${scanned} · Processed ${processed} · Failed ${failed}`,
        variant: failed ? "destructive" : undefined,
      });
    } catch (e: any) {
      let details = e?.message || String(e);
      try {
        if (e?.context?.text) {
          const body = await e.context.text();
          const parsed = JSON.parse(body);
          details = parsed?.error || parsed?.details || body || details;
        }
      } catch {
        // Keep the original error message if the function response is not JSON.
      }
      toast({ title: "Poll failed", description: details, variant: "destructive" });
    } finally {
      setPolling(false);
    }
  };

  const DICTATION_ADDRESS = "dictations@thevateam.london";



  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Dictation Intake · The VA Team Portal</title>
      </Helmet>
      <GradientBackdrop />
      <StandardNavigation currentPage="email-intake" />

      <main className="container max-w-5xl py-6 px-4 space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gradient">Dictation Intake</h1>
          <p className="text-muted-foreground text-sm">
            The portal polls the connected Gmail mailbox every 2 minutes for messages addressed to <code className="px-1.5 py-0.5 rounded bg-muted font-mono">{DICTATION_ADDRESS}</code>. Each matching email becomes a task in Task Manager, matched to the customer, with attachments uploaded and assigned round-robin to the typists below.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Gmail polling</CardTitle>
            <CardDescription>
              Uses the connected Google account. Add the alias <strong>{DICTATION_ADDRESS}</strong> to that mailbox and any forwarded email will be picked up automatically within 2 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="poll-enabled" className="font-medium">Polling enabled</Label>
                <p className="text-xs text-muted-foreground">Turn off to pause automatic ingestion.</p>
              </div>
              <Switch id="poll-enabled" checked={gmailPollEnabled} onCheckedChange={setGmailPollEnabled} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gmail-query">Gmail search query</Label>
              <Input
                id="gmail-query"
                value={gmailQuery}
                onChange={(e) => setGmailQuery(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Standard Gmail search syntax. Default filters to unread messages sent to the dictations alias in the last 7 days.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveGmailConfig}>Save Gmail settings</Button>
              <Button variant="outline" onClick={pollNow} disabled={polling}>
                {polling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Poll now
              </Button>
            </div>
          </CardContent>
        </Card>


        
        <EmailIntakeRules />
        <EmailRoutingAuditLog />



        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Available users</CardTitle>
                <CardDescription>Tick a user to add them to the round-robin group.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="user-filter" className="sr-only">Search users</Label>
                  <Input
                    id="user-filter"
                    placeholder="Search by name or email…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </div>
                <div className="max-h-[420px] overflow-y-auto rounded-md border divide-y">
                  {filteredUsers.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={group.includes(u.id)}
                        onCheckedChange={() => toggle(u.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{u.name || "Unnamed"}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                    </label>
                  ))}
                  {filteredUsers.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground text-center">No users found.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assignment order</CardTitle>
                <CardDescription>
                  New emailed tasks cycle through this list. Next up:{" "}
                  <span className="font-medium text-foreground">
                    {(() => {
                      if (group.length === 0) return "— nobody configured —";
                      const idx = lastAssigned ? group.indexOf(lastAssigned) : -1;
                      const nextIdx = (idx + 1) % group.length;
                      const next = userMap.get(group[nextIdx]);
                      return next?.name || next?.email || group[nextIdx];
                    })()}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border divide-y min-h-[120px]">
                  {group.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      Select users on the left to build the group.
                    </div>
                  )}
                  {group.map((id, i) => {
                    const u = userMap.get(id);
                    return (
                      <div key={id} className="flex items-center gap-2 px-3 py-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {i + 1}. {u?.name || "Unknown user"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{u?.email}</div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => move(id, -1)} disabled={i === 0}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => move(id, 1)}
                          disabled={i === group.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggle(id)}>
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={save} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save changes
                  </Button>
                  <Button variant="outline" onClick={resetCursor}>
                    Reset round-robin cursor
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Emails sent to <code>dictations@thevateam.london</code> are captured by a Cloudflare Email Worker and posted to the portal's secure inbound webhook.
            </p>
            <p>Each email creates a task titled <em>Digital Dictation - (attached file name) - Sender Name</em>, matches the sender against customer contacts, uploads any attachments to the task, and assigns the task to the next user in the list above.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
