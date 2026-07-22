import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/github';

interface GhCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
  };
  html_url: string;
  author?: { login: string; avatar_url: string } | null;
}

class GitHubProviderError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`[${status}] ${body}`);
    this.name = 'GitHubProviderError';
    this.status = status;
    this.body = body;
  }
}

async function gh(path: string, query?: Record<string, string>) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GITHUB_API_KEY = Deno.env.get('GITHUB_API_KEY');
  if (!LOVABLE_API_KEY || !GITHUB_API_KEY) {
    throw new Error('GitHub connector is not configured');
  }
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const res = await fetch(`${GATEWAY_URL}${path}${qs}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': GITHUB_API_KEY,
    },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new GitHubProviderError(res.status, body);
  }
  return body ? JSON.parse(body) : null;
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function githubErrorMessage(owner: string, repo: string, status: number, message: string) {
  if (status === 404) {
    return `Repository "${owner}/${repo}" was not found. Check the owner/name spelling, and ensure the connected GitHub account has access (for private repos, the token needs the "repo" scope).`;
  }
  if (status === 401 || status === 403) {
    return `GitHub denied access to "${owner}/${repo}". Reconnect the GitHub connector with access to this repository.`;
  }
  return message;
}

function handledGithubStatus(owner: string, repo: string, branch: unknown, err: unknown) {
  if (!(err instanceof GitHubProviderError) || ![401, 403, 404].includes(err.status)) {
    return null;
  }

  return jsonResponse({
    ok: false,
    error: githubErrorMessage(owner, repo, err.status, err.message),
    repo: null,
    branch: typeof branch === 'string' && branch ? branch : null,
    branchError: null,
    commit: null,
    workflowError: null,
    workflow_runs: [],
    fetched_at: new Date().toISOString(),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth: verify JWT + Super-Admin role
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('user_id', userRes.user.id).single();
    if (profile?.role !== 'Super-Admin') {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { owner, repo, branch, mode } = body ?? {};

    // Diagnostics mode: report the authenticated GitHub identity + token metadata,
    // and (optionally) whether it can see the requested repo.
    if (mode === 'diagnostics') {
      const diagnostics: Record<string, unknown> = {
        ok: true,
        fetched_at: new Date().toISOString(),
      };
      try {
        const gwRes = await fetch(`${GATEWAY_URL}/user`, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
            'X-Connection-Api-Key': Deno.env.get('GITHUB_API_KEY') ?? '',
          },
        });
        const raw = await gwRes.text();
        const scopes = gwRes.headers.get('x-oauth-scopes');
        const tokenType = gwRes.headers.get('x-github-media-type');
        const rateLimit = gwRes.headers.get('x-ratelimit-limit');
        const rateRemaining = gwRes.headers.get('x-ratelimit-remaining');
        if (!gwRes.ok) {
          diagnostics.ok = false;
          diagnostics.identity_error = `[${gwRes.status}] ${raw}`;
        } else {
          const u = JSON.parse(raw);
          diagnostics.identity = {
            login: u.login,
            id: u.id,
            type: u.type,
            name: u.name,
            html_url: u.html_url,
            avatar_url: u.avatar_url,
          };
        }
        diagnostics.token = {
          scopes: scopes ? scopes.split(',').map(s => s.trim()).filter(Boolean) : null,
          fine_grained: scopes === '' || scopes === null,
          media_type: tokenType,
          rate_limit: rateLimit ? Number(rateLimit) : null,
          rate_remaining: rateRemaining ? Number(rateRemaining) : null,
        };
      } catch (e) {
        diagnostics.ok = false;
        diagnostics.identity_error = e instanceof Error ? e.message : String(e);
      }

      if (owner && repo && typeof owner === 'string' && typeof repo === 'string') {
        try {
          const r = await gh(`/repos/${owner}/${repo}`);
          diagnostics.repo_access = {
            accessible: true,
            full_name: r.full_name,
            private: r.private,
            permissions: r.permissions ?? null,
          };
        } catch (e) {
          const status = e instanceof GitHubProviderError ? e.status : 0;
          diagnostics.repo_access = {
            accessible: false,
            status,
            message: status === 404
              ? `The authenticated GitHub account cannot see "${owner}/${repo}". Either the token belongs to a different account, or it lacks access to this repo (classic PAT needs "repo" scope; fine-grained PAT must be granted access to this specific repository).`
              : e instanceof Error ? e.message : String(e),
          };
        }
      }

      return jsonResponse(diagnostics);
    }

    if (!owner || !repo || typeof owner !== 'string' || typeof repo !== 'string') {
      return jsonResponse({ error: 'owner and repo are required' }, 400);
    }

    // Fetch repo, then branch commit + recent workflow runs in parallel
    let repoInfo: any;
    try {
      repoInfo = await gh(`/repos/${owner}/${repo}`);
    } catch (e) {
      const handled = handledGithubStatus(owner, repo, branch, e);
      if (handled) return handled;
      throw e;
    }
    const targetBranch: string = branch || repoInfo.default_branch;

    const [branchInfo, runs] = await Promise.all([
      gh(`/repos/${owner}/${repo}/branches/${encodeURIComponent(targetBranch)}`)
        .catch((e) => ({ error: String(e) })),
      gh(`/repos/${owner}/${repo}/actions/runs`, { per_page: '10', branch: targetBranch })
        .catch((e) => ({ error: String(e) })),
    ]);

    let commit: GhCommit | null = null;
    let branchError: string | null = null;
    if ((branchInfo as any).error) {
      branchError = (branchInfo as any).error;
    } else {
      commit = (branchInfo as any).commit as GhCommit;
    }

    const workflowRuns = (runs as any)?.workflow_runs ?? [];
    const workflowError = (runs as any)?.error ?? null;

    return jsonResponse(
      {
        ok: true,
        repo: {
          full_name: repoInfo.full_name,
          html_url: repoInfo.html_url,
          default_branch: repoInfo.default_branch,
          pushed_at: repoInfo.pushed_at,
          private: repoInfo.private,
        },
        branch: targetBranch,
        branchError,
        commit: commit
          ? {
              sha: commit.sha,
              short: commit.sha.slice(0, 7),
              message: commit.commit.message,
              author_name: commit.commit.author.name,
              author_login: commit.author?.login ?? null,
              author_avatar: commit.author?.avatar_url ?? null,
              date: commit.commit.author.date,
              html_url: commit.html_url,
            }
          : null,
        workflowError,
        workflow_runs: workflowRuns.slice(0, 10).map((r: any) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
          html_url: r.html_url,
          created_at: r.created_at,
          head_sha: r.head_sha,
          event: r.event,
        })),
        fetched_at: new Date().toISOString(),
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('github-status error:', message);
    if (err instanceof GitHubProviderError && [401, 403, 404].includes(err.status)) {
      return jsonResponse({
        ok: false,
        error: message,
        repo: null,
        branch: null,
        branchError: null,
        commit: null,
        workflowError: null,
        workflow_runs: [],
        fetched_at: new Date().toISOString(),
      });
    }
    return jsonResponse({ error: message }, 500);
  }
});
