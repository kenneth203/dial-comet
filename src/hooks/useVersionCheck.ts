import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { appReload } from "@/lib/appReload";

/**
 * Polls the deployed index.html for a changed asset signature and, when a
 * real new deploy is detected, offers the user a MANUAL "Reload" toast.
 *
 * No automatic reload:
 *   Previously this hook auto-reloaded the tab after 10 minutes when hidden.
 *   That path caused unexpected refreshes on the Lovable preview host, where
 *   Vite rebuilds rewrite index.html and produce false-positive signatures.
 *   The reload is now user-initiated only.
 *
 * Two-consecutive-poll debounce eliminates single-shot preview rewrites.
 *
 * Skipped in dev, in iframes, and on Lovable preview hosts.
 */
const POLL_MS = 60_000;
const TOAST_ID = "app-version-update";
const STORAGE_KEY = "app:version:signature";
const BROADCAST_KEY = "app:version:newDeploy";
const CHANNEL_NAME = "vateam-version-check";
const TAB_PROMPTED_KEY = "app:version:tabPromptedSignature";
const ACKNOWLEDGED_KEY = "app:version:acknowledgedSignature";

type VersionMsg = { type: "new-deploy"; signature: string; t: number };

function isPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.parent !== window) return true;
  } catch { return true; }
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovableproject-dev.com") ||
    /(^|\.)id-preview--/.test(h) ||
    /(^|\.)preview--/.test(h)
  );
}

async function fetchSignature(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?_v=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const assetRefs = (text.match(/(?:src|href)="[^"]*\/assets\/[^"]+"/g) || [])
      .sort()
      .join("|");
    if (!assetRefs) return null;
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
  const baselineRef = useRef<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const promptedRef = useRef(false);
  const promptedSignatureRef = useRef<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV || isPreviewHost()) {
      toast.dismiss(TOAST_ID);
      return;
    }

    let cancelled = false;
    let pollTimer: number | undefined;

    const persistSignature = (signature: string) => {
      baselineRef.current = signature;
      try {
        localStorage.setItem(STORAGE_KEY, signature);
        sessionStorage.setItem(STORAGE_KEY, signature);
      } catch { /* ignore */ }
    };

    const stopPolling = () => {
      if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    const markAcknowledged = (signature: string) => {
      persistSignature(signature);
      try {
        localStorage.setItem(ACKNOWLEDGED_KEY, signature);
        sessionStorage.setItem(TAB_PROMPTED_KEY, signature);
      } catch { /* ignore */ }
      stopPolling();
    };

    const hasAlreadyHandledSignature = (signature: string) => {
      if (promptedSignatureRef.current === signature) return true;
      try {
        return (
          sessionStorage.getItem(TAB_PROMPTED_KEY) === signature ||
          localStorage.getItem(ACKNOWLEDGED_KEY) === signature
        );
      } catch { return false; }
    };

    const showPrompt = (signature: string) => {
      if (promptedRef.current || hasAlreadyHandledSignature(signature)) {
        persistSignature(signature);
        return;
      }
      promptedRef.current = true;
      promptedSignatureRef.current = signature;
      persistSignature(signature);
      try { sessionStorage.setItem(TAB_PROMPTED_KEY, signature); } catch { /* ignore */ }
      stopPolling();
      toast("A new version is available", {
        id: TOAST_ID,
        description: "Reload to get the latest updates.",
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => {
            markAcknowledged(signature);
            appReload({ reason: "version-check-toast", source: "useVersionCheck" });
          },
        },
        onDismiss: () => markAcknowledged(signature),
        onAutoClose: () => markAcknowledged(signature),
      });
    };

    const broadcastNewDeploy = (signature: string) => {
      const msg: VersionMsg = { type: "new-deploy", signature, t: Date.now() };
      try { channelRef.current?.postMessage(msg); } catch { /* ignore */ }
      try { localStorage.setItem(BROADCAST_KEY, JSON.stringify(msg)); } catch { /* ignore */ }
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
          const stored = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
          baselineRef.current = stored ?? sig;
          if (!stored) persistSignature(sig);
        } catch { baselineRef.current = sig; }
        return;
      }
      if (sig === baselineRef.current) {
        pendingRef.current = null;
        return;
      }
      if (pendingRef.current !== sig) {
        pendingRef.current = sig;
        console.info("[version-check] candidate new signature; waiting for confirmation");
        return;
      }
      console.info("[version-check] confirmed new signature");
      pendingRef.current = null;
      if (promptedRef.current) {
        promptedRef.current = false;
        promptedSignatureRef.current = null;
      }
      promptUpdate(sig);
    };

    if (typeof BroadcastChannel !== "undefined") {
      try {
        const ch = new BroadcastChannel(CHANNEL_NAME);
        ch.onmessage = (e: MessageEvent<VersionMsg>) => {
          const msg = e.data;
          if (msg?.type === "new-deploy") promptUpdate(msg.signature, true);
        };
        channelRef.current = ch;
      } catch { /* ignore */ }
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== BROADCAST_KEY || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as VersionMsg;
        if (msg?.type === "new-deploy") promptUpdate(msg.signature, true);
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", onStorage);

    check();
    pollTimer = window.setInterval(check, POLL_MS);

    const onVisibility = () => { if (document.visibilityState === "visible") check(); };
    const onFocus = () => check();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      if (pollTimer) window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      if (channelRef.current) {
        try { channelRef.current.close(); } catch { /* ignore */ }
        channelRef.current = null;
      }
    };
  }, []);
}

export default useVersionCheck;
