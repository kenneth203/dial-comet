import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Polls the deployed index.html for a changed ETag / Last-Modified header.
 * When a new deploy is detected, surfaces a sticky toast prompting the user
 * to reload so they pick up the latest client bundle (e.g. mention modal
 * wiring) without manual refresh.
 *
 * Auto-reloads after a grace period if the user does not act, but only when
 * the tab is hidden so we never interrupt active typing.
 *
 * Cross-tab sync: the first tab to detect a new deploy broadcasts the new
 * signature to every other tab via BroadcastChannel (with a localStorage
 * fallback). Every open session then shows the same reload prompt at the
 * same moment, instead of waiting up to a minute for its own poll.
 */
const POLL_MS = 60_000; // every minute
const AUTO_RELOAD_AFTER_MS = 10 * 60_000; // 10 minutes
const TOAST_ID = "app-version-update";
const STORAGE_KEY = "app:version:signature";
const BROADCAST_KEY = "app:version:newDeploy";
const CHANNEL_NAME = "vateam-version-check";
const TAB_PROMPTED_KEY = "app:version:tabPromptedSignature";
const ACKNOWLEDGED_KEY = "app:version:acknowledgedSignature";

type VersionMsg = { type: "new-deploy"; signature: string; t: number };

async function fetchSignature(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?_v=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) return null;
    // Hash only the built asset references in the HTML. Headers such as ETag
    // and Last-Modified can change in preview/dev environments without a real
    // deployment, which caused repeated false reload prompts.
    const text = await res.text();
    const assetRefs = (text.match(/(?:src|href)="[^"]*\/assets\/[^"]+"/g) || [])
      .sort()
      .join("|");
    if (!assetRefs) return null; // unreliable signal — skip
    let hash = 0;
    for (let i = 0; i < assetRefs.length; i++) {
      hash = (hash * 31 + assetRefs.charCodeAt(i)) | 0;
    }
    return `assets:${hash}`;
  } catch {
    return null;
  }
}

export function useVersionCheck() {
  const detectedAtRef = useRef<number | null>(null);
  const baselineRef = useRef<string | null>(null);
  const promptedRef = useRef(false);
  const promptedSignatureRef = useRef<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) {
      toast.dismiss(TOAST_ID);
      return;
    }

    let cancelled = false;
    let pollTimer: number | undefined;
    let autoReloadTimer: number | undefined;

    const persistSignature = (signature: string) => {
      baselineRef.current = signature;
      try {
        localStorage.setItem(STORAGE_KEY, signature);
        sessionStorage.setItem(STORAGE_KEY, signature);
      } catch {
        /* ignore */
      }
    };

    const markAcknowledged = (signature: string) => {
      persistSignature(signature);
      try {
        localStorage.setItem(ACKNOWLEDGED_KEY, signature);
        sessionStorage.setItem(TAB_PROMPTED_KEY, signature);
      } catch {
        /* ignore */
      }
      stopPolling();
      if (autoReloadTimer) {
        window.clearTimeout(autoReloadTimer);
        autoReloadTimer = undefined;
      }
    };

    const hasAlreadyHandledSignature = (signature: string) => {
      if (promptedSignatureRef.current === signature) return true;
      try {
        return (
          sessionStorage.getItem(TAB_PROMPTED_KEY) === signature ||
          localStorage.getItem(ACKNOWLEDGED_KEY) === signature
        );
      } catch {
        return false;
      }
    };

    const reload = (signature: string) => {
      markAcknowledged(signature);
      try {
        sessionStorage.setItem("app:version:reloading", "1");
      } catch {
        /* ignore */
      }
      window.location.reload();
    };

    const stopPolling = () => {
      if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = window.setInterval(check, POLL_MS);
    };

    const showPrompt = (signature: string) => {
      if (promptedRef.current || hasAlreadyHandledSignature(signature)) {
        persistSignature(signature);
        return;
      }
      promptedRef.current = true;
      promptedSignatureRef.current = signature;
      detectedAtRef.current = Date.now();
      persistSignature(signature);
      try {
        sessionStorage.setItem(TAB_PROMPTED_KEY, signature);
      } catch {
        /* ignore */
      }
      // Stop background polling — we've already told the user. We'll only
      // resume when a one-off check (on focus/visibility) sees a brand new
      // signature different from the one we just prompted for.
      stopPolling();
      toast("A new version is available", {
        id: TOAST_ID,
        description:
          "Reload to get the latest updates (mentions, alerts, fixes).",
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => reload(signature),
        },
        onDismiss: () => {
          // User dismissed — keep polling stopped. Will resume only if a
          // later focus/visibility check detects a different signature.
          markAcknowledged(signature);
        },
        onAutoClose: () => {
          markAcknowledged(signature);
        },
      });

      // Safety: auto-reload after grace period when tab is hidden.
      autoReloadTimer = window.setTimeout(() => {
        if (document.visibilityState === "hidden") {
          reload(signature);
        }
      }, AUTO_RELOAD_AFTER_MS);
    };

    const broadcastNewDeploy = (signature: string) => {
      const msg: VersionMsg = { type: "new-deploy", signature, t: Date.now() };
      try {
        channelRef.current?.postMessage(msg);
      } catch {
        /* ignore */
      }
      // localStorage fallback for browsers without BroadcastChannel.
      try {
        localStorage.setItem(BROADCAST_KEY, JSON.stringify(msg));
      } catch {
        /* ignore */
      }
    };

    const promptUpdate = (signature: string, fromBroadcast = false) => {
      showPrompt(signature);
      if (!fromBroadcast) broadcastNewDeploy(signature);
    };

    const check = async () => {
      const sig = await fetchSignature();
      if (cancelled || !sig) return;
      if (baselineRef.current == null) {
        try {
          const stored =
            localStorage.getItem(STORAGE_KEY) ??
            sessionStorage.getItem(STORAGE_KEY);
          baselineRef.current = stored ?? sig;
          if (!stored) {
            persistSignature(sig);
          } else if (stored !== sig) {
            promptUpdate(sig);
          }
        } catch {
          baselineRef.current = sig;
        }
        return;
      }
      if (sig !== baselineRef.current) {
        if (promptedRef.current) {
          // A truly new deploy arrived after the previous prompt. Reset and
          // surface a fresh prompt + resume polling.
          promptedRef.current = false;
          promptedSignatureRef.current = null;
          if (autoReloadTimer) {
            window.clearTimeout(autoReloadTimer);
            autoReloadTimer = undefined;
          }
        }
        promptUpdate(sig);
      }
    };

    // Wire up cross-tab channel.
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const ch = new BroadcastChannel(CHANNEL_NAME);
        ch.onmessage = (e: MessageEvent<VersionMsg>) => {
          const msg = e.data;
          if (msg?.type === "new-deploy") {
            promptUpdate(msg.signature, true);
          }
        };
        channelRef.current = ch;
      } catch {
        /* ignore */
      }
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== BROADCAST_KEY || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as VersionMsg;
        if (msg?.type === "new-deploy") {
          promptUpdate(msg.signature, true);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);

    // Establish baseline immediately, then poll.
    check();
    startPolling();

    // Focus/visibility checks are still useful even after we've prompted:
    // they're the only path that can detect a brand-new deploy and re-arm
    // the polling loop once the user has dismissed an earlier prompt.
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    const onFocus = () => check();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);


    return () => {
      cancelled = true;
      if (pollTimer) window.clearInterval(pollTimer);
      if (autoReloadTimer) window.clearTimeout(autoReloadTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      if (channelRef.current) {
        try {
          channelRef.current.close();
        } catch {
          /* ignore */
        }
        channelRef.current = null;
      }
    };
  }, []);
}

export default useVersionCheck;
