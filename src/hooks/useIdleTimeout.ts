import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const IDLE_LOGOUT_MS = 180 * 60 * 1000; // 180 min
const IDLE_WARN_MS = 179 * 60 * 1000; // 179 min (1 min warning)
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
const CHANNEL_NAME = "vateam-idle-activity";

/**
 * Auto sign-out after a period of inactivity (Cyber Essentials control).
 * - Resets on any user activity in this tab.
 * - Activity in any other tab keeps this one alive via BroadcastChannel.
 * - Toasts a warning 1 minute before logout.
 */
export function useIdleTimeout(enabled: boolean) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const warnTimer = useRef<number | null>(null);
  const logoutTimer = useRef<number | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const clearTimers = () => {
      if (warnTimer.current) window.clearTimeout(warnTimer.current);
      if (logoutTimer.current) window.clearTimeout(logoutTimer.current);
      warnTimer.current = null;
      logoutTimer.current = null;
    };

    const doLogout = async () => {
      clearTimers();
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      toast({
        title: "Signed out",
        description: "You were signed out after 180 minutes of inactivity.",
      });
      navigate("/auth?reason=idle");
    };

    const resetTimers = (broadcast = true) => {
      clearTimers();
      warnedRef.current = false;
      warnTimer.current = window.setTimeout(() => {
        warnedRef.current = true;
        toast({
          title: "You'll be signed out in 1 minute",
          description: "Move your mouse or press a key to stay signed in.",
        });
      }, IDLE_WARN_MS);
      logoutTimer.current = window.setTimeout(doLogout, IDLE_LOGOUT_MS);
      if (broadcast && channelRef.current) {
        try {
          channelRef.current.postMessage({ t: Date.now() });
        } catch {
          /* ignore */
        }
      }
    };

    // Cross-tab sync
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      ch.onmessage = () => resetTimers(false);
      channelRef.current = ch;
    }

    const onActivity = () => resetTimers(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") resetTimers(true);
    };

    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true })
    );
    document.addEventListener("visibilitychange", onVisibility);

    resetTimers(true);

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
    };
  }, [enabled, navigate, toast]);
}
