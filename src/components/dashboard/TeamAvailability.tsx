import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getFormattedNameFromProfile } from "@/lib/nameUtils";
import { cn } from "@/lib/utils";
import { CircleCheck, Toilet, Coffee, Laptop, CircleX, type LucideIcon } from "lucide-react";

type StatusValue = 'online' | 'toilet' | 'coffee' | 'meeting' | 'offline';

interface TeamMember {
  userId: string;
  authUserId: string | null;
  name: string;
  status: StatusValue;
  updatedAt: string | null;
}

// Mirrors the Quick Access status buttons: same Lucide icons and the same
// alternating primary / primary-variant colour pattern (index 0..4).
const STATUS_META: Record<StatusValue, { label: string; icon: LucideIcon; colorClass: string }> = {
  online:  { label: 'Online',       icon: CircleCheck, colorClass: 'text-[hsl(var(--primary))]' },
  toilet:  { label: 'Toilet Break', icon: Toilet,      colorClass: 'text-[hsl(var(--primary-variant))]' },
  coffee:  { label: 'Coffee Break', icon: Coffee,      colorClass: 'text-[hsl(var(--primary))]' },
  meeting: { label: 'Zoom/Meeting', icon: Laptop,      colorClass: 'text-[hsl(var(--primary-variant))]' },
  offline: { label: 'Offline',      icon: CircleX,     colorClass: 'text-[hsl(var(--primary))]' },
};

const AVATAR_PALETTE = [
  'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]',
  'bg-[hsl(var(--primary-variant))] text-white',
  'bg-[#1c477a] text-white',
  'bg-[#b73235] text-white',
  'bg-[#585858] text-white',
  'bg-[#0f1f4a] text-white',
];

const colorForUser = (userId: string) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
};

const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatUpdated = (iso: string | null, now: number): string => {
  if (!iso) return 'never';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'never';
  const diffSec = Math.max(0, Math.round((now - ts) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(iso).toLocaleString('en-GB');
};

export default function TeamAvailability() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const [{ data: staff }, { data: statuses }] = await Promise.all([
        Promise.resolve(supabase.rpc('get_all_system_users_minimal')),
        Promise.resolve(supabase.from('user_statuses').select('user_id, status, updated_at')),
      ]);

      // statuses are keyed by auth uid
      const statusByAuth = new Map<string, { status: StatusValue; updatedAt: string | null }>();
      statuses?.forEach(s => statusByAuth.set(s.user_id, {
        status: (s.status as StatusValue) || 'offline',
        updatedAt: (s as any).updated_at ?? null,
      }));

      const list: TeamMember[] = (staff ?? []).map((s: any) => {
        const entry = s.user_id ? statusByAuth.get(s.user_id) : undefined;
        return {
          userId: s.id,
          authUserId: s.user_id as string | null,
          name: s.name || 'User',
          status: entry?.status ?? 'offline',
          updatedAt: entry?.updatedAt ?? null,
        };
      });

      list.sort((a, b) => {
        if (a.authUserId === user.id) return -1;
        if (b.authUserId === user.id) return 1;
        return a.name.localeCompare(b.name);
      });
      setMembers(list);
      setNow(Date.now());
    };


    void load();

    // Debounce buffer: coalesce bursts of presence events into a single state update.
    const pendingStatuses = new Map<string, { status: StatusValue; updatedAt: string }>();
    let pendingRosterRefresh = false;
    let flushTimer: number | null = null;
    const FLUSH_MS = 200;

    const flush = () => {
      flushTimer = null;
      if (pendingStatuses.size > 0) {
        const updates = new Map(pendingStatuses);
        pendingStatuses.clear();
        let sawUnknown = false;
        setMembers(prev => {
          let changed = false;
          const next = prev.map(m => {
            if (!m.authUserId) return m;
            const u = updates.get(m.authUserId);
            if (!u) return m;
            updates.delete(m.authUserId);
            if (m.status === u.status && m.updatedAt === u.updatedAt) return m;
            changed = true;
            return { ...m, status: u.status, updatedAt: u.updatedAt };
          });
          if (updates.size > 0) sawUnknown = true;
          return changed ? next : prev;
        });
        if (sawUnknown) pendingRosterRefresh = true;
        setNow(Date.now());
      }
      if (pendingRosterRefresh) {
        pendingRosterRefresh = false;
        void load();
      }
    };

    const scheduleFlush = () => {
      if (flushTimer !== null) return;
      flushTimer = window.setTimeout(flush, FLUSH_MS);
    };

    const queuePayload = (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (!row?.user_id) return;
      pendingStatuses.set(row.user_id, {
        status: (row.status as StatusValue) || 'offline',
        updatedAt: row.updated_at ?? new Date().toISOString(),
      });
      scheduleFlush();
    };

    const channel = supabase
      .channel(`team-availability-${user.id}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_statuses' }, (payload) => {
        queuePayload(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_users' }, () => {
        pendingRosterRefresh = true;
        scheduleFlush();
      })
      .subscribe();

    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', () => void load());
    const poll = window.setInterval(() => void load(), 60000);

    return () => {
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(poll);
    };
  }, [user]);

  if (!user || members.length === 0) return null;

  return (
    <ul className="divide-y divide-border">
      {members.map((m) => {
        const meta = STATUS_META[m.status];
        const isMe = m.authUserId === user.id;
        return (
          <li key={m.userId} className="flex items-center gap-3 py-2.5">
            <div className={cn(
              "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold",
              colorForUser(m.userId)
            )}>
              {initialsOf(m.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {isMe ? `${m.name} (You)` : m.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {isMe ? `Your Status: ${meta.label}` : meta.label}
                <span className="ml-1 opacity-70">· updated {formatUpdated(m.updatedAt, now)}</span>
              </p>
            </div>
            <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center" title={meta.label}>
              <meta.icon
                className={cn("w-9 h-9", meta.colorClass)}
                strokeWidth={1.75}
                aria-label={meta.label}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
