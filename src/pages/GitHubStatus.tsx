import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, ExternalLink, GitBranch, GitCommit, RefreshCw, Github, ShieldCheck, ShieldAlert } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";

interface StatusResponse {
  ok?: boolean;
  error?: string;
  repo: {
    full_name: string;
    html_url: string;
    default_branch: string;
    pushed_at: string;
    private: boolean;
  } | null;
  branch: string | null;
  branchError: string | null;
  commit: {
    sha: string;
    short: string;
    message: string;
    author_name: string;
    author_login: string | null;
    author_avatar: string | null;
    date: string;
    html_url: string;
  } | null;
  workflowError: string | null;
  workflow_runs: Array<{
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    created_at: string;
    head_sha: string;
    event: string;
  }>;
  fetched_at: string;
}

const STORAGE_KEY = "github-status-config";

// Project default — used for every user until they override it locally.
// Keeps the panel populated on any browser/device without per-user setup.
const DEFAULT_CONFIG: Config = {
  owner: "kenneth203",
  repo: "thevateamportal",
  branch: "main",
};

interface Config { owner: string; repo: string; branch: string }

interface Diagnostics {
  ok: boolean;
  identity?: { login: string; id: number; type: string; name: string | null; html_url: string; avatar_url: string };
  identity_error?: string;
  token?: { scopes: string[] | null; fine_grained: boolean; media_type: string | null; rate_limit: number | null; rate_remaining: number | null };
  repo_access?: { accessible: boolean; full_name?: string; private?: boolean; permissions?: Record<string, boolean> | null; status?: number; message?: string };
  fetched_at: string;
}

export default function GitHubStatus() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [draft, setDraft] = useState<Config>(DEFAULT_CONFIG);
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Config;
        if (parsed?.owner && parsed?.repo) {
          setConfig(parsed);
          setDraft(parsed);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const fetchStatus = useCallback(async (cfg: Config) => {
    if (!cfg.owner || !cfg.repo) return;
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("github-status", {
        body: { owner: cfg.owner.trim(), repo: cfg.repo.trim(), branch: cfg.branch.trim() || undefined },
      });
      if (fnErr) {
        let details = fnErr instanceof FunctionsHttpError
          ? await fnErr.context.text()
          : fnErr.message;
        try {
          const parsed = JSON.parse(details);
          if (parsed?.error) details = parsed.error;
        } catch { /* not JSON */ }
        throw new Error(details);
      }
      const status = res as StatusResponse;
      setData(status);
      if (status?.error) {
        setError(status.error);
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Failed to fetch GitHub status", { description: msg.slice(0, 200) });
    } finally {
      setLoading(false);
    }
  }, []);

  const runDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("github-status", {
        body: {
          mode: "diagnostics",
          owner: config.owner?.trim() || undefined,
          repo: config.repo?.trim() || undefined,
        },
      });
      if (fnErr) {
        const details = fnErr instanceof FunctionsHttpError ? await fnErr.context.text() : fnErr.message;
        throw new Error(details);
      }
      setDiag(res as Diagnostics);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Diagnostics failed", { description: msg.slice(0, 200) });
    } finally {
      setDiagLoading(false);
    }
  }, [config]);

  useEffect(() => {
    if (config.owner && config.repo) void fetchStatus(config);
  }, [config, fetchStatus]);

  const saveConfig = () => {
    const cleaned = { owner: draft.owner.trim(), repo: draft.repo.trim(), branch: draft.branch.trim() };
    if (!cleaned.owner || !cleaned.repo) {
      toast.error("Owner and repo are required");
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    setConfig(cleaned);
    toast.success("Repository saved");
  };

  const hasRepoData = Boolean(data?.repo);
  const failedRuns = data?.workflow_runs.filter(r => r.conclusion && r.conclusion !== "success" && r.conclusion !== "skipped") ?? [];
  const lastRun = data?.workflow_runs[0];

  return (
    <div className="container mx-auto max-w-5xl p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Github className="h-6 w-6" /> GitHub Connection &amp; Sync Status
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          System · Live view of the linked repository, latest commit, and workflow health.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Repository</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="owner">Owner / Org</Label>
            <Input id="owner" value={draft.owner} onChange={(e) => setDraft(d => ({ ...d, owner: e.target.value }))} placeholder="my-org" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repo">Repository</Label>
            <Input id="repo" value={draft.repo} onChange={(e) => setDraft(d => ({ ...d, repo: e.target.value }))} placeholder="portal" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch">Branch (optional)</Label>
            <Input id="branch" value={draft.branch} onChange={(e) => setDraft(d => ({ ...d, branch: e.target.value }))} placeholder="main" />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={saveConfig} className="flex-1">Save</Button>
            <Button variant="outline" size="icon" onClick={() => fetchStatus(config)} disabled={loading || !config.owner}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Connector diagnostics</span>
            <Button size="sm" variant="outline" onClick={runDiagnostics} disabled={diagLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${diagLoading ? "animate-spin" : ""}`} />
              {diag ? "Re-run" : "Run diagnostics"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-4">
          <p className="text-muted-foreground">
            Shows which GitHub account and token the connector is actually using, and whether it can see the configured repo.
            This is separate from Lovable's Git sync.
          </p>

          {!diag && !diagLoading && (
            <p className="text-muted-foreground italic">Click "Run diagnostics" to check the connector identity.</p>
          )}

          {diag?.identity_error && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Could not identify the connector token</AlertTitle>
              <AlertDescription className="break-all">{diag.identity_error}</AlertDescription>
            </Alert>
          )}

          {diag?.identity && (
            <div className="flex items-start gap-3 rounded-md border p-3">
              <img src={diag.identity.avatar_url} alt="" className="h-10 w-10 rounded-full" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  <a href={diag.identity.html_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    {diag.identity.login} <ExternalLink className="h-3 w-3" />
                  </a>
                  {diag.identity.name && <span className="text-muted-foreground ml-2">({diag.identity.name})</span>}
                </div>
                <div className="text-xs text-muted-foreground">Type: {diag.identity.type} · ID: {diag.identity.id}</div>
              </div>
            </div>
          )}

          {diag?.token && (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground text-xs">Token style</div>
                <div className="font-medium">{diag.token.fine_grained ? "Fine-grained PAT (or GitHub App)" : "Classic PAT / OAuth"}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground text-xs">Scopes</div>
                <div className="font-medium">
                  {diag.token.scopes && diag.token.scopes.length > 0
                    ? diag.token.scopes.map(s => <Badge key={s} variant="outline" className="mr-1 mb-1">{s}</Badge>)
                    : <span className="text-muted-foreground">None reported (fine-grained tokens don't expose scopes)</span>}
                </div>
              </div>
              <div className="rounded-md border p-3 md:col-span-2">
                <div className="text-muted-foreground text-xs">Rate limit</div>
                <div className="font-medium">
                  {diag.token.rate_remaining ?? "?"} / {diag.token.rate_limit ?? "?"} remaining
                </div>
              </div>
            </div>
          )}

          {diag?.repo_access && (
            <Alert variant={diag.repo_access.accessible ? "default" : "destructive"}>
              {diag.repo_access.accessible
                ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                : <ShieldAlert className="h-4 w-4" />}
              <AlertTitle>
                {diag.repo_access.accessible
                  ? `Repo accessible: ${diag.repo_access.full_name}${diag.repo_access.private ? " (private)" : ""}`
                  : `Repo NOT accessible${diag.repo_access.status ? ` (HTTP ${diag.repo_access.status})` : ""}`}
              </AlertTitle>
              <AlertDescription className="break-words">
                {diag.repo_access.accessible ? (
                  diag.repo_access.permissions && (
                    <div className="text-xs mt-1">
                      Permissions: {Object.entries(diag.repo_access.permissions)
                        .filter(([, v]) => v).map(([k]) => k).join(", ") || "read-only"}
                    </div>
                  )
                ) : (
                  diag.repo_access.message
                )}
              </AlertDescription>
            </Alert>
          )}

          {diag && (
            <p className="text-xs text-muted-foreground">Checked {format(new Date(diag.fetched_at), "dd/MM/yyyy HH:mm:ss")}</p>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sync error</AlertTitle>
          <AlertDescription className="break-all">{error}</AlertDescription>
        </Alert>
      )}

      {data && hasRepoData && data.repo && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Connection</span>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" /> Connected
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
              <div>
                <div className="text-muted-foreground">Repository</div>
                <a href={data.repo.html_url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline inline-flex items-center gap-1">
                  {data.repo.full_name} <ExternalLink className="h-3 w-3" />
                </a>
                {data.repo.private && <Badge variant="outline" className="ml-2">Private</Badge>}
              </div>
              <div>
                <div className="text-muted-foreground flex items-center gap-1"><GitBranch className="h-3 w-3" /> Current branch</div>
                <div className="font-medium">
                  {data.branch}
                  {data.branch === data.repo.default_branch
                    ? <Badge variant="secondary" className="ml-2">default</Badge>
                    : <Badge variant="outline" className="ml-2">default: {data.repo.default_branch}</Badge>}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Last push to repo</div>
                <div className="font-medium" title={format(new Date(data.repo.pushed_at), "PPpp")}>
                  {formatDistanceToNow(new Date(data.repo.pushed_at), { addSuffix: true })}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Fetched</div>
                <div className="font-medium">{format(new Date(data.fetched_at), "dd/MM/yyyy HH:mm:ss")}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><GitCommit className="h-4 w-4" /> Latest commit</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {data.branchError && (
                <Alert variant="destructive"><AlertDescription>{data.branchError}</AlertDescription></Alert>
              )}
              {data.commit && (
                <div className="space-y-2">
                  <a href={data.commit.html_url} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">
                    {data.commit.short}
                  </a>
                  <p className="font-medium whitespace-pre-wrap">{data.commit.message.split("\n")[0]}</p>
                  <div className="text-muted-foreground flex items-center gap-2">
                    {data.commit.author_avatar && (
                      <img src={data.commit.author_avatar} alt="" className="h-5 w-5 rounded-full" />
                    )}
                    <span>{data.commit.author_login ?? data.commit.author_name}</span>
                    <span>·</span>
                    <span title={format(new Date(data.commit.date), "PPpp")}>
                      {formatDistanceToNow(new Date(data.commit.date), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Recent workflow runs</span>
                {failedRuns.length > 0
                  ? <Badge variant="destructive">{failedRuns.length} failing</Badge>
                  : lastRun && <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" /> All green</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {data.workflowError && (
                <Alert variant="destructive"><AlertDescription>{data.workflowError}</AlertDescription></Alert>
              )}
              {!data.workflowError && data.workflow_runs.length === 0 && (
                <p className="text-muted-foreground">No workflow runs found for this branch.</p>
              )}
              <ul className="divide-y divide-border">
                {data.workflow_runs.map(run => {
                  const bad = run.conclusion && run.conclusion !== "success" && run.conclusion !== "skipped";
                  return (
                    <li key={run.id} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <a href={run.html_url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline truncate block">
                          {run.name}
                        </a>
                        <div className="text-xs text-muted-foreground">
                          {run.event} · {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                        </div>
                      </div>
                      <Badge variant={bad ? "destructive" : run.status === "in_progress" ? "secondary" : "outline"}>
                        {run.conclusion ?? run.status}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      {!hasRepoData && !error && !loading && (!config.owner || !config.repo) && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No repository configured</AlertTitle>
          <AlertDescription>
            Enter the GitHub owner and repository name above, then click Save. The GitHub connector is already linked.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
