import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { setRealtimeSession } from "@/lib/realtimeSessionStore";
import { emitChatAlert } from "@/lib/chatAlertBus";
import { emitStatusAlert } from "@/lib/statusAlertBus";
import { emitMentionAlert } from "@/lib/mentionAlertBus";


/**
 * Global live alert broadcaster.
 *
 * Surfaces real-time popups to every signed-in user (online at that moment) for:
 *  - New Daily Handover tasks (todos)
 *  - New Task Manager tasks (project_tasks)
 *  - New Daily Checklist items (checklist_instances)
 *  - New chat messages (channels + DMs)
 *  - New task notifications (task_notifications)
 *  - User status changes (user_statuses)
 *
 * Each alert renders a sonner toast, plays a short chime, and (when the tab
 * is backgrounded and the user has granted permission) fires a browser
 * notification.
 *
 * Always-on per product spec — no mute toggle.
 */

type Directory = Record<string, { name: string; email: string }>;

// --- Sound (WebAudio chime + HTMLAudio fallback) ---------------------------
// Routes through the OS default audio output, so it follows whatever the
// user has set as their active output device (speakers, headset, etc.).
let audioCtx: AudioContext | null = null;
let audioUnlocked = false;

// Short two-tone chime encoded as a base64 WAV so we always have a fallback
// even if WebAudio is blocked. Plays through the default media output.
const FALLBACK_CHIME_SRC =
  "data:audio/wav;base64,UklGRiQEAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAEAAAAAB4MNxgxIokn1iniJ48iWBjxCQT4APg+6QXcEdJVzPjLNNDF2GHk+/Hl/3UMaxdsHwYkOiW6ItUcWBQQCi3/iPSj62Hk7t9R3sLfVeP56G3wzfgfASUJ+w8RFRMY6BiNFwAUYg7yBhf+0vTr66Pj7t1J22Tcd+B556LwzfqyBL4N/RTtGTwc4hvxGGgUWg5xB28AvfnT8/HuiOug6S/p1ekv6/btKPK294QOpRRpGEsZ/RebFKQPlAnpAtH7E/Vc7w/r/+gv6JPp4uxd8nT5MAFOCQERTRfwGtIbpRnvFLcOSAhKApj9/PnW9zr3pPe8+OL5lvqL+oj5o/dx9bjzbvNV9X750f7tBAcL5g8FE7gT4hG5DTUIfgIp/cv4OPYP9rH3X/p2/QwAaQEKAQz/oPvk9zP1L/Sv9R/5tP1KArkF/wYdBcQAlPpV85Hsf+ej5fHnD+5h9hX/qgZSC1IM4QnGBPP9MPbo7tDoSeXp5InnxOzu82H8tQS0CzQQjxFhDw0KKwIQ+TLwM+iI4onggOFi5SLrPPLD+VEBOAhsDdQPlw4iCXP/5/Iz5UDZHdCsy0jM8tF526T0iA6KJwk6P0JjPzgyDhxz/9Lhg8mNu1y6FsiD42UDViDgM6E73jTjILYG0umh0V3DiMNl0CPmO/4vFI4lFy/qLg4l9hN+/yzqMtPGwsm4Sb6jzcXn2gMUHzs1Rj+CQEY3OCXvDOnxk9rxynnIA8/m37b3HBJUKv87FELbPbgwCh8ICfXxvN9Cz//Hi8aTzo7eIvOMC6IiUDOEPGE6yC2tF5/8RuY51TbJ9MOXyGTW/ulRAa0YSCxiNL01tjBhJlcWPwjC/Br3JfaY+y8B5gZyDLAOoQqkAt36WfPC7Y/oG+a85x/sefBR9F73CftZ/JX72fdQ8/HwgfDt8m/3FfvF/sQAA/+a/Bf6cPiM91D2/PMP8s/x6vJI9LD0PvWp9eb02PNl85DznfM0+CcAOgmKDicQVA3JBmH+9PRX6+vmEekW7c7v0fAi8oP1MfqM/8gDugZNCEMG0AEN/X/4VPZw9zb+sQfaEoEdgyJaIO0WeAbU9PfjkdkH1zHaTuKy7q35WgGYBxoMRgsmBzcCEvxK+9z3J/Lz7CbnsuJ04G7gNuQB6oXz0fxhB4cQqxLPDjUFOPaA5/zaCdaC2fnh9OmO78XzN/eC++0AKwQOA0r9JPYL7uvkn92R1zPVO9c83Y3oTfb1AUEKbg2tCUUDtPzD9NHsv+ip6S/u5/QM/U4DJgheCqEKqQqQClcInQT0/tn5b/Wj8GLuQ+wH7Cnsx+/N9Ub7TQI8DI4Tdxd0Fb4QbgnVAGr5d/Hf6mDmRePR4pXkRumU703vkO5z63LpiOcF59vpY/L4+T8EaQ0NEZAOWQuKBAH+JPlb86HtfOnX59zoa+yz8mb38vsi/qb8jPfV8sXuoeqz5Q==";

function ensureAudioCtx(): AudioContext | null {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

function unlockAudioOnGesture() {
  if (audioUnlocked) return;
  const unlock = () => {
    audioUnlocked = true;
    const ctx = ensureAudioCtx();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    window.removeEventListener("click", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("click", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });
}

function playChime() {
  // Primary path: WebAudio synth — routes to the OS default output.
  try {
    const ctx = ensureAudioCtx();
    if (ctx) {
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.55, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      master.connect(ctx.destination);

      // Two pleasant tones — clearly audible alert without being harsh.
      const tone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + start);
        g.gain.setValueAtTime(0.0001, now + start);
        g.gain.exponentialRampToValueAtTime(0.9, now + start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(g).connect(master);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      };
      tone(880, 0, 0.18);
      tone(1320, 0.18, 0.28);
      return;
    }
  } catch {
    /* fall through to HTMLAudio fallback */
  }

  // Fallback: <audio> element using the OS default media output.
  try {
    const a = new Audio(FALLBACK_CHIME_SRC);
    a.volume = 0.9;
    void a.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

// --- Browser push -----------------------------------------------------------
function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    const ask = () => {
      void Notification.requestPermission().catch(() => undefined);
      window.removeEventListener("click", ask);
      window.removeEventListener("keydown", ask);
    };
    window.addEventListener("click", ask, { once: true });
    window.addEventListener("keydown", ask, { once: true });
  }
}

function browserNotify(title: string, body?: string, tag?: string) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (!document.hidden) return; // only push when tab is in background
    new Notification(title, {
      body,
      tag: tag ?? title,
      icon: "/favicon.ico",
      silent: false,
    });
  } catch {
    /* ignore */
  }
}

// --- Persistent dismissal --------------------------------------------------
// When the user closes (X) an alert, remember its tag so the same event
// won't reappear after refresh/reconnect. Scoped per signed-in user.
const DISMISS_KEY = (uid: string) => `live-alerts:dismissed:${uid}`;
const DISMISS_MAX = 500;

function loadDismissed(uid: string): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY(uid));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function saveDismissed(uid: string, set: Set<string>) {
  try {
    // cap size FIFO-ish
    const arr = Array.from(set).slice(-DISMISS_MAX);
    localStorage.setItem(DISMISS_KEY(uid), JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

// Module-level dedup: suppresses the same alert from firing twice within a
// short window (e.g. when the hook remounts, a subscription refetches, or
// the same realtime payload is delivered through multiple channels).
// Persisted to localStorage so a browser refresh doesn't re-fire alerts the
// user has already seen in this session.
const DEDUP_WINDOW_MS = 10_000;
const DEDUP_STORAGE_KEY = "live-alerts:recent";
const DEDUP_MAX_ENTRIES = 500;

function loadRecentAlerts(): Map<string, number> {
  try {
    const raw = localStorage.getItem(DEDUP_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return new Map();
    const now = Date.now();
    const map = new Map<string, number>();
    for (const [k, v] of Object.entries(parsed as Record<string, number>)) {
      if (typeof v === "number" && now - v < DEDUP_WINDOW_MS) map.set(k, v);
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveRecentAlerts(map: Map<string, number>) {
  try {
    const now = Date.now();
    const entries: [string, number][] = [];
    for (const [k, v] of map) {
      if (now - v < DEDUP_WINDOW_MS) entries.push([k, v]);
    }
    const trimmed = entries.slice(-DEDUP_MAX_ENTRIES);
    localStorage.setItem(DEDUP_STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    /* ignore quota / serialization errors */
  }
}

const recentAlerts = typeof window !== "undefined" ? loadRecentAlerts() : new Map<string, number>();

function pruneRecentAlerts(): boolean {
  const now = Date.now();
  let removed = false;
  for (const [k, ts] of recentAlerts) {
    if (now - ts > DEDUP_WINDOW_MS) {
      recentAlerts.delete(k);
      removed = true;
    }
  }
  return removed;
}

// Periodic sweep so stale entries never linger past the window, even if no
// new alerts arrive to trigger pruning. Also rewrites storage so localStorage
// shrinks back down on its own.
if (typeof window !== "undefined") {
  window.setInterval(() => {
    if (pruneRecentAlerts()) saveRecentAlerts(recentAlerts);
  }, DEDUP_WINDOW_MS);
  // Final flush on tab close so storage reflects pruning immediately.
  window.addEventListener("beforeunload", () => {
    pruneRecentAlerts();
    saveRecentAlerts(recentAlerts);
  });
}

function dedupKey(title: string, description: string | undefined, tag: string | undefined) {
  return tag ? `tag:${tag}` : `td:${title}::${description ?? ""}`;
}

function isDuplicate(key: string): boolean {
  const now = Date.now();
  // Prune every call — cheap (map iteration), and guarantees the window is
  // strictly enforced regardless of how many entries are currently held.
  pruneRecentAlerts();
  const last = recentAlerts.get(key);
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) return true;
  recentAlerts.set(key, now);
  saveRecentAlerts(recentAlerts);
  return false;
}

function fireAlert(
  title: string,
  description?: string,
  opts?: { tag?: string; level?: "info" | "success" | "warning"; userId?: string },
) {
  const level = opts?.level ?? "info";
  const tag = opts?.tag;
  const uid = opts?.userId;

  if (tag && uid) {
    const dismissed = loadDismissed(uid);
    if (dismissed.has(tag)) return; // suppress previously dismissed alert
  }

  // Drop duplicates from rapid refetches / re-renders / repeated payloads.
  if (isDuplicate(dedupKey(title, description, tag))) return;

  const toastFn =
    level === "success"
      ? toast.success
      : level === "warning"
        ? toast.warning
        : toast;
  toastFn(title, {
    description,
    duration: 6500,
    closeButton: true,
    // Stable id ensures sonner itself collapses repeats into a single toast.
    id: tag ?? `${title}::${description ?? ""}`,
    onDismiss: () => {
      if (!tag || !uid) return;
      const set = loadDismissed(uid);
      set.add(tag);
      saveDismissed(uid, set);
    },
  });
  playChime();
  browserNotify(title, description, tag);
}


function prettyStatus(s: string | null | undefined) {
  if (!s) return "Offline";
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const CLOSED_CHECKLIST_STATUSES = new Set(["completed", "skipped", "not_applicable"]);

function hasChecklistDueTimePassed(row: { task_date?: string | null; due_time?: string | null }) {
  if (!row.task_date || !row.due_time) return false;
  const dueAt = new Date(`${row.task_date}T${row.due_time}`);
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() <= Date.now();
}

async function isStaleTaskNotification(row: any) {
  const type = String(row?.type ?? "").toLowerCase();
  const taskId = row?.task_id ?? null;
  const relatedId = row?.related_id ?? null;

  if (relatedId) {
    const { data } = await supabase
      .from("checklist_instances")
      .select("id,status,task_date,due_time")
      .eq("id", relatedId)
      .maybeSingle();

    if (!data) return type === "checklist_reminder";
    const checklist = data as any;
    if (CLOSED_CHECKLIST_STATUSES.has(String(checklist.status))) return true;
    if (type === "checklist_reminder" && hasChecklistDueTimePassed(checklist)) return true;
  }

  if (!taskId) return false;

  const [{ data: projectTask }, { data: todo }, { data: checklist }] = await Promise.all([
    supabase.from("project_tasks").select("id,status").eq("id", taskId).maybeSingle(),
    supabase.from("todos").select("id,completed").eq("id", taskId).maybeSingle(),
    supabase.from("checklist_instances").select("id,status,task_date,due_time").eq("id", taskId).maybeSingle(),
  ]);

  if ((projectTask as any)?.status === "completed") return true;
  if ((todo as any)?.completed === true) return true;
  if (checklist) {
    const checklistRow = checklist as any;
    if (CLOSED_CHECKLIST_STATUSES.has(String(checklistRow.status))) return true;
    if (type === "checklist_reminder" && hasChecklistDueTimePassed(checklistRow)) return true;
  }

  return false;
}

export function useGlobalLiveAlerts() {
  const { user } = useAuth();
  const directoryRef = useRef<Directory>({});
  const lastStatusRef = useRef<Record<string, string>>({});
  const seededStatusRef = useRef(false);
  const recentKeyRef = useRef<Map<string, number>>(new Map());

  // Live realtime session tracking. We are "truly online" only when:
  //   1. The browser reports navigator.onLine === true
  //   2. The tab is not hidden (or has been hidden < grace window)
  //   3. Our channel is SUBSCRIBED
  //   4. Our own user_id is present in the presence sync from the channel
  const isLiveRef = useRef(false);
  // Timestamp at which we became live (used to suppress retroactive alerts
  // for events that occurred during a disconnect window).
  const liveSinceRef = useRef<number>(0);
  // Online peers set, derived from presence sync.
  const onlinePeersRef = useRef<Set<string>>(new Set());

  // Dedupe identical events. Once we've shown a popup for a given event key,
  // never show it again in this session (Realtime can replay rows on
  // reconnect, presence sync, or trigger re-fires — we must not loop).
  const seen = (key: string) => {
    const map = recentKeyRef.current;
    if (map.has(key)) return true;
    map.set(key, Date.now());
    // Soft cap so the map can't grow unbounded over a long session.
    if (map.size > 2000) {
      const oldest = Array.from(map.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, 500);
      for (const [k] of oldest) map.delete(k);
    }
    return false;
  };



  useEffect(() => {
    if (!user) return;

    ensureNotificationPermission();
    unlockAudioOnGesture();


    const loadDirectory = async () => {
      try {
        const { data } = await supabase.rpc("get_all_system_users_minimal");
        const map: Directory = {};
        (data ?? []).forEach((u: any) => {
          if (u.user_id) {
            map[u.user_id] = {
              name: u.name || "Someone",
              email: u.email || "",
            };
          }
        });
        directoryRef.current = map;
      } catch (err) {
        console.warn("[live-alerts] directory load failed", err);
      }
    };

    const seedStatuses = async () => {
      try {
        const { data } = await supabase
          .from("user_statuses")
          .select("user_id, status");
        const map: Record<string, string> = {};
        (data ?? []).forEach((r: any) => {
          map[r.user_id] = r.status || "offline";
        });
        lastStatusRef.current = map;
      } catch {
        /* ignore */
      } finally {
        seededStatusRef.current = true;
      }
    };

    const nameOf = (uid?: string | null) =>
      (uid && directoryRef.current[uid]?.name) || "A teammate";

    const shouldShowLiveRow = (row: any) => {
      if (!isLiveRef.current) return false;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
      if (!onlinePeersRef.current.has(user.id)) return false;

      const eventAt = Date.parse(
        row?.created_at ?? row?.updated_at ?? row?.last_updated ?? new Date().toISOString(),
      );
      return Number.isNaN(eventAt) || eventAt >= liveSinceRef.current - 2000;
    };

    void loadDirectory();
    void seedStatuses();

    const channel = supabase.channel(
      `global-live-alerts-${user.id}-${Date.now()}`,
      { config: { presence: { key: user.id } } },
    )

      // --- Daily Handover ----------------------------------------------------
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "todos" },
        (payload) => {
          const row: any = payload.new;
          if (!row || row.created_by === user.id) return;
          if (!shouldShowLiveRow(row)) return;
          if (seen(`todo:${row.id}`)) return;
          fireAlert(
            "📝 New handover task",
            `${nameOf(row.created_by)} added: ${row.title ?? "Untitled task"}`,
            { tag: `todo-${row.id}`, userId: user.id },
          );
        },
      )
      // --- Task Manager ------------------------------------------------------
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "project_tasks" },
        (payload) => {
          const row: any = payload.new;
          if (!row || row.created_by === user.id) return;
          if (!shouldShowLiveRow(row)) return;
          if (seen(`pt:${row.id}`)) return;
          fireAlert(
            "📋 New task assigned",
            `${nameOf(row.created_by)} created: ${row.title ?? "Untitled task"}`,
            { tag: `pt-${row.id}`, userId: user.id },
          );
        },
      )
      // --- Daily Checklist ---------------------------------------------------
      // Intentionally no popup alert for new checklist_instances rows.
      // The dashboard's Daily Checklist card already updates live via its own
      // realtime subscription, and the cron job generates rows every few minutes
      // which would otherwise spam users with popups for routine background syncs.
      // --- Chat (all rooms, DMs + channels) ----------------------------------
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const row: any = payload.new;
          if (!row || row.sender_id === user.id) return;
          if (!shouldShowLiveRow(row)) return;
          if (seen(`msg:${row.id}`)) return;
          const preview =
            typeof row.content === "string"
              ? row.content.length > 140
                ? `${row.content.slice(0, 140)}…`
                : row.content
              : "New message";
          // Show centered modal popup with "Read Now" CTA (per product spec)
          // — keep sound + browser push for off-tab users.
          emitChatAlert({
            id: row.id,
            senderName: nameOf(row.sender_id),
            preview,
            roomId: row.room_id ?? null,
          });
          playChime();
          browserNotify(`💬 ${nameOf(row.sender_id)}`, preview, `chat-${row.id}`);

        },
      )
      // --- Notifications -----------------------------------------------------
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_notifications" },
        (payload) => {
          void (async () => {
            const row: any = payload.new;
            if (!row) return;
            // Only alert the recipient (if column exists), else broadcast
            if (row.user_id && row.user_id !== user.id) return;
            if (!shouldShowLiveRow(row)) return;
            if (seen(`tn:${row.id}`)) return;
            if (await isStaleTaskNotification(row)) {
              await supabase
                .from("task_notifications")
                .update({ is_read: true })
                .eq("id", row.id)
                .eq("user_id", user.id);
              return;
            }
            // @mention notifications → centered modal with "Read Now" CTA
            // (mirrors chat/status alert UX) instead of a generic toast.
            const notifType = String(row.type ?? "").toLowerCase();
            if (notifType === "mention" && row.task_id) {
              try {
                const { data: task } = await supabase
                  .from("project_tasks")
                  .select("id,title,customer_id,created_by")
                  .eq("id", row.task_id)
                  .maybeSingle();
                const t = task as any;
                let customerName: string | null = null;
                if (t?.customer_id) {
                  const { data: cust } = await supabase
                    .from("customers")
                    .select("name")
                    .eq("id", t.customer_id)
                    .maybeSingle();
                  customerName = (cust as any)?.name ?? null;
                }
                emitMentionAlert({
                  id: row.id,
                  taskId: row.task_id,
                  taskTitle: t?.title ?? "Task",
                  customerName,
                  mentionerName: nameOf(t?.created_by),
                  preview: row.message ?? null,
                  tag: `mention-${row.id}`,
                });
                playChime();
                browserNotify(
                  "@ You were mentioned",
                  `${customerName ? customerName + " • " : ""}${t?.title ?? "Task"}`,
                  `mention-${row.id}`,
                );
              } catch {
                /* fall back to toast below if fetch fails */
                fireAlert(
                  "@ You were mentioned",
                  row.message ?? "You were mentioned in a task",
                  { tag: `tn-${row.id}`, level: "info", userId: user.id },
                );
              }
              return;
            }
            fireAlert(
              "🔔 New notification",
              row.message ?? row.title ?? "You have a new notification",
              { tag: `tn-${row.id}`, level: "info", userId: user.id },
            );
          })();
        },
      )

      // --- Status changes (Online/Offline/Away/Busy/etc., ALL) --------------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_statuses" },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (!row?.user_id) return;
          if (row.user_id === user.id) {
            // keep our local map current but don't alert on self
            lastStatusRef.current[row.user_id] = row.status || "offline";
            return;
          }
          // RELIABLE PRESENCE GATE -----------------------------------------
          // Only deliver status-change alerts if we have a verified, live
          // realtime session. This requires:
          //   - browser is online
          //   - channel is SUBSCRIBED and we're in our own presence sync
          //   - this event arrived AFTER we became live (avoids retroactive
          //     bursts when reconnecting)
          //   - the recipient's own status is 'online'
          if (!isLiveRef.current) {
            lastStatusRef.current[row.user_id] = row.status || "offline";
            return;
          }
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            lastStatusRef.current[row.user_id] = row.status || "offline";
            return;
          }
          if (!onlinePeersRef.current.has(user.id)) {
            lastStatusRef.current[row.user_id] = row.status || "offline";
            return;
          }
          const eventAt = Date.parse(
            (row as any).updated_at ??
              (row as any).last_heartbeat_at ??
              new Date().toISOString(),
          );
          if (!Number.isNaN(eventAt) && eventAt < liveSinceRef.current - 2000) {
            lastStatusRef.current[row.user_id] = row.status || "offline";
            return;
          }
          const selfStatus = lastStatusRef.current[user.id] ?? "offline";
          if (selfStatus !== "online") {
            lastStatusRef.current[row.user_id] = row.status || "offline";
            return;
          }

          const prev = lastStatusRef.current[row.user_id];
          const next = row.status || "offline";
          lastStatusRef.current[row.user_id] = next;
          if (!seededStatusRef.current || prev === undefined) return;
          if (prev === next) return;
          if (seen(`status:${row.user_id}:${prev}->${next}`)) return;

          const isOffline = next === "offline";
          const wasOffline = prev === "offline";
          const name = nameOf(row.user_id);

          // Stable tag (no Date.now) so persistent dismissal works and we
          // never re-fire the same transition twice.
          const statusTag = `status-${row.user_id}-${prev}->${next}`;
          const level: "success" | "warning" | "info" =
            wasOffline && !isOffline
              ? "success"
              : !wasOffline && isOffline
              ? "warning"
              : "info";

          // Centered modal popup (mirrors chat alert UX).
          emitStatusAlert({
            id: statusTag,
            userId: row.user_id,
            name,
            prev,
            next,
            level,
            tag: statusTag,
          });


        },
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown>;
        const peers = new Set<string>(Object.keys(state));
        onlinePeersRef.current = peers;
        if (peers.has(user.id) && !isLiveRef.current) {
          // Just became verifiably live → re-seed statuses so we don't fire
          // alerts for transitions that happened while we were disconnected.
          isLiveRef.current = true;
          liveSinceRef.current = Date.now();
          setRealtimeSession({ isLive: true, liveSince: liveSinceRef.current });
          void seedStatuses();
        } else if (!peers.has(user.id)) {
          isLiveRef.current = false;
          setRealtimeSession({ isLive: false });
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try {
            await channel.track({ online_at: new Date().toISOString() });
          } catch (err) {
            console.warn("[live-alerts] presence track failed", err);
          }
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          isLiveRef.current = false;
          onlinePeersRef.current = new Set();
          setRealtimeSession({ isLive: false });
        }
      });

    // Browser-level connectivity / visibility signals act as an additional
    // safety net. When the browser reports offline, immediately stop firing
    // alerts. When it comes back, presence-sync will re-promote us to live.
    const handleOffline = () => {
      isLiveRef.current = false;
      setRealtimeSession({ isLive: false });
    };
    const handleOnline = () => {
      // Force a presence retrack so the channel re-acquires us quickly.
      void channel.track({ online_at: new Date().toISOString() }).catch(() => undefined);
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      isLiveRef.current = false;
      onlinePeersRef.current = new Set();
      setRealtimeSession({ isLive: false });
      void supabase.removeChannel(channel);
    };

  }, [user]);
}

