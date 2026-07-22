import { useEffect, useState } from "react";
import { Radio, RadioTower, WifiOff } from "lucide-react";
import { useRealtimeSession } from "@/lib/realtimeSessionStore";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function relativeTime(from: number, now: number) {
  if (!from) return "—";
  const secs = Math.max(0, Math.floor((now - from) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

/**
 * Visible indicator of the user's realtime session health.
 *  - Green pulsing dot = realtime session verified live (presence acknowledged)
 *  - Amber  = connecting / partial (browser online but presence not yet synced)
 *  - Red    = offline / channel error
 */
export function RealtimeStatusBadge({ className }: { className?: string }) {
  const { isLive, liveSince } = useRealtimeSession();
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const on = () => setBrowserOnline(true);
    const off = () => setBrowserOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const state: "live" | "connecting" | "offline" = !browserOnline
    ? "offline"
    : isLive
      ? "live"
      : "connecting";

  const meta = {
    live: {
      label: "Live",
      tooltip: `Realtime session active · connected ${relativeTime(liveSince, now)} ago`,
      icon: RadioTower,
      dotClass: "bg-emerald-500",
      pulse: true,
      ring: "ring-emerald-500/30",
      text: "text-emerald-700 dark:text-emerald-400",
    },
    connecting: {
      label: "Connecting",
      tooltip: "Realtime session reconnecting…",
      icon: Radio,
      dotClass: "bg-amber-500",
      pulse: true,
      ring: "ring-amber-500/30",
      text: "text-amber-700 dark:text-amber-500",
    },
    offline: {
      label: "Offline",
      tooltip: "No realtime session — live alerts paused",
      icon: WifiOff,
      dotClass: "bg-rose-500",
      pulse: false,
      ring: "ring-rose-500/30",
      text: "text-rose-700 dark:text-rose-400",
    },
  }[state];

  const Icon = meta.icon;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="status"
            aria-live="polite"
            aria-label={`Realtime: ${meta.label}`}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium shadow-sm",
              meta.text,
              className,
            )}
          >
            <span className="relative inline-flex h-2.5 w-2.5">
              {meta.pulse && (
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                    meta.dotClass,
                  )}
                />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2.5 w-2.5 rounded-full ring-2",
                  meta.dotClass,
                  meta.ring,
                )}
              />
            </span>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{meta.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">{meta.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default RealtimeStatusBadge;
