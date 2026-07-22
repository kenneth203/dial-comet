import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const IDLE_LOGOUT_MS = 180 * 60 * 1000; // 180 minutes total
const WARN_BEFORE_MS = 2 * 60 * 1000; // show "Stay signed in" 2 min before logout
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
const CHANNEL_NAME = "vateam-idle-activity";

type BroadcastMsg = { type: "activity" | "extend" | "logout"; t: number };

/**
 * Auto sign-out after 180 minutes of inactivity, with a "Stay signed in"
 * prompt 2 minutes before the cutoff so operators can extend their session
 * without losing in-progress work.
 *
 * - Activity in any tab keeps every tab alive (BroadcastChannel sync).
 * - While the prompt is open, ambient activity (mouse/keys) is ignored so an
 *   accidental mouse-move can't silently extend the session and hide the
 *   warning. The user must click "Stay signed in" or "Sign out now".
 */
export function IdleTimeoutGuard({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [warnOpen, setWarnOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(WARN_BEFORE_MS / 1000));

  const warnTimerRef = useRef<number | null>(null);
  const logoutTimerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const warnOpenRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (warnTimerRef.current) window.clearTimeout(warnTimerRef.current);
    if (logoutTimerRef.current) window.clearTimeout(logoutTimerRef.current);
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    warnTimerRef.current = null;
    logoutTimerRef.current = null;
    countdownRef.current = null;
  }, []);

  const doLogout = useCallback(async () => {
    clearTimers();
    setWarnOpen(false);
    warnOpenRef.current = false;
    try {
      channelRef.current?.postMessage({ type: "logout", t: Date.now() } as BroadcastMsg);
    } catch { /* ignore */ }
    try {
      await supabase.auth.signOut();
    } catch { /* ignore */ }
    toast({
      title: "Signed out",
      description: "You were signed out after 180 minutes of inactivity.",
    });
    navigate("/auth?reason=idle");
  }, [clearTimers, navigate, toast]);

  const openWarning = useCallback(() => {
    warnOpenRef.current = true;
    setSecondsLeft(Math.floor(WARN_BEFORE_MS / 1000));
    setWarnOpen(true);
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    countdownRef.current = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
  }, []);

  const resetTimers = useCallback((broadcast = true) => {
    clearTimers();
    warnOpenRef.current = false;
    setWarnOpen(false);
    warnTimerRef.current = window.setTimeout(openWarning, IDLE_LOGOUT_MS - WARN_BEFORE_MS);
    logoutTimerRef.current = window.setTimeout(doLogout, IDLE_LOGOUT_MS);
    if (broadcast) {
      try {
        channelRef.current?.postMessage({ type: "activity", t: Date.now() } as BroadcastMsg);
      } catch { /* ignore */ }
    }
  }, [clearTimers, doLogout, openWarning]);

  const staySignedIn = useCallback(() => {
    resetTimers(true);
    try {
      channelRef.current?.postMessage({ type: "extend", t: Date.now() } as BroadcastMsg);
    } catch { /* ignore */ }
  }, [resetTimers]);

  useEffect(() => {
    if (!enabled) return;

    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      ch.onmessage = (e: MessageEvent<BroadcastMsg>) => {
        const msg = e.data;
        if (!msg) return;
        if (msg.type === "logout") {
          // Another tab logged out; mirror it.
          void doLogout();
          return;
        }
        if (msg.type === "extend") {
          resetTimers(false);
          return;
        }
        // Generic activity from another tab — only reset if our prompt isn't
        // open. The local user must explicitly dismiss the prompt here.
        if (!warnOpenRef.current) resetTimers(false);
      };
      channelRef.current = ch;
    }

    const onActivity = () => {
      // Ignore ambient activity while the prompt is showing so the user must
      // make an explicit choice.
      if (warnOpenRef.current) return;
      resetTimers(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !warnOpenRef.current) {
        resetTimers(true);
      }
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
  }, [enabled, clearTimers, doLogout, resetTimers]);

  if (!enabled) return null;

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <AlertDialog open={warnOpen}>
      <AlertDialogContent
        // Don't auto-close on Escape — user must choose.
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You'll be signed out in <span className="font-semibold text-foreground">{mm}:{ss}</span> due to inactivity.
            Any unsaved work in open forms will be lost. Click "Stay signed in" to keep working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void doLogout()}>Sign out now</AlertDialogCancel>
          <AlertDialogAction onClick={staySignedIn}>Stay signed in</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default IdleTimeoutGuard;
