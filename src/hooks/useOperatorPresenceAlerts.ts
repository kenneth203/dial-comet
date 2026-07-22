import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import {
  DEFAULT_PRESENCE_PREFS,
  loadPresenceAlertPrefs,
  type PresenceAlertPrefs,
} from "@/lib/presenceAlertPrefs";

type StatusRow = {
  user_id: string;
  status: string;
  last_heartbeat_at?: string | null;
  last_updated?: string | null;
};

type UserInfo = { name: string; email: string };

/**
 * Admin-only hook that surfaces operator presence transitions
 * (Online ↔ Offline) as toasts and triggers an internal email
 * notification. Email dedup is handled by send-transactional-email
 * via a minute-bucketed idempotency key, so multiple admin browsers
 * watching the same event will not double-send.
 */
export function useOperatorPresenceAlerts() {
  const { user } = useAuth();
  const { isSuperAdmin, userRole, isLoading } = usePermissions();

  // Track the last known status per user_id so we can detect transitions.
  const lastStatusRef = useRef<Record<string, string>>({});
  // Cache auth uid -> { name, email }
  const userInfoRef = useRef<Record<string, UserInfo>>({});
  // Has the initial snapshot been seeded? (suppress toasts on first load)
  const seededRef = useRef(false);
  // Per (user_id + transition) last alert timestamp for throttling.
  const lastAlertAtRef = useRef<Record<string, number>>({});
  // Live ref to current prefs so we don't resubscribe when they change.
  const prefsRef = useRef<PresenceAlertPrefs>(DEFAULT_PRESENCE_PREFS);

  const isAdmin = isSuperAdmin || userRole === "Admin";

  useEffect(() => {
    if (!user || isLoading || !isAdmin) return;

    let cancelled = false;

    // Initial prefs load + listen for in-tab and cross-tab changes.
    prefsRef.current = loadPresenceAlertPrefs(user.id);
    const onPrefsChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.userId === user.id) {
        prefsRef.current = loadPresenceAlertPrefs(user.id);
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === `presence-alert-prefs:${user.id}`) {
        prefsRef.current = loadPresenceAlertPrefs(user.id);
      }
    };
    window.addEventListener("presence-alert-prefs-changed", onPrefsChanged);
    window.addEventListener("storage", onStorage);

    const loadDirectory = async () => {
      const { data } = await supabase.rpc("get_all_system_users_minimal");
      const map: Record<string, UserInfo> = {};
      (data ?? []).forEach((u: any) => {
        if (u.user_id) {
          map[u.user_id] = {
            name: u.name || "Operator",
            email: u.email || "",
          };
        }
      });
      userInfoRef.current = map;
    };

    const seedStatuses = async () => {
      const { data } = await supabase
        .from("user_statuses")
        .select("user_id, status, last_heartbeat_at, updated_at");
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => {
        map[r.user_id] = r.status || "offline";
      });
      lastStatusRef.current = map;
      seededRef.current = true;
    };

    const fireAlert = async (
      row: StatusRow,
      transition: "online_to_offline" | "offline_to_online",
    ) => {
      // Skip alerts for the admin's own status changes.
      if (row.user_id === user.id) return;

      const prefs = prefsRef.current;
      if (prefs.channel === "none") return;
      if (prefs.offlineOnly && transition === "offline_to_online") return;

      // Throttle: skip if we alerted on this (user, transition) recently.
      const throttleMs = Math.max(0, prefs.throttleMinutes) * 60_000;
      const throttleKey = `${row.user_id}:${transition}`;
      const lastAt = lastAlertAtRef.current[throttleKey] ?? 0;
      if (throttleMs > 0 && Date.now() - lastAt < throttleMs) return;
      lastAlertAtRef.current[throttleKey] = Date.now();

      const info = userInfoRef.current[row.user_id] ?? {
        name: "An operator",
        email: "",
      };
      const wentOffline = transition === "online_to_offline";

      if (prefs.channel === "toast" || prefs.channel === "both") {
        toast(
          wentOffline
            ? `⚠️ ${info.name} is now Offline`
            : `✅ ${info.name} is back Online`,
          {
            description: info.email || undefined,
            duration: 8000,
          },
        );
      }

      if (prefs.channel !== "email" && prefs.channel !== "both") return;

      // Bucket idempotency key by throttle window (or minute when instant)
      // so concurrent admin browsers don't double-send.
      const bucketMs = throttleMs > 0 ? throttleMs : 60_000;
      const bucket = Math.floor(Date.now() / bucketMs);
      const idempotencyKey = `presence-${row.user_id}-${transition}-${bucket}`;

      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "operator-status-change",
            idempotencyKey,
            templateData: {
              operatorName: info.name,
              operatorEmail: info.email,
              transition,
              changedAt: new Date().toISOString(),
              lastSeenAt: row.last_heartbeat_at ?? row.last_updated ?? null,
            },
          },
        });
      } catch (err) {
        console.error("[presence-alerts] email dispatch failed", err);
      }
    };

    const handleRow = (row: StatusRow) => {
      const prev = lastStatusRef.current[row.user_id];
      const next = row.status || "offline";
      lastStatusRef.current[row.user_id] = next;
      if (!seededRef.current || prev === undefined) return;
      if (prev === next) return;

      const wasOffline = prev === "offline";
      const isOffline = next === "offline";
      if (wasOffline === isOffline) return; // transition within non-offline states

      fireAlert(row, isOffline ? "online_to_offline" : "offline_to_online");
    };

    void (async () => {
      await loadDirectory();
      await seedStatuses();
      if (cancelled) return;
    })();

    const channel = supabase
      .channel(`admin-presence-alerts-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_statuses" },
        (payload) => {
          const row = (payload.new ?? payload.old) as StatusRow | null;
          if (!row?.user_id) return;
          handleRow(row);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener("presence-alert-prefs-changed", onPrefsChanged);
      window.removeEventListener("storage", onStorage);
      void supabase.removeChannel(channel);
    };
  }, [user, isAdmin, isLoading]);
}
