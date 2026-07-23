import { useEffect } from "react";

/**
 * Phase 0.5 — Development environment banner.
 * Visible on every route. Also injects a `[DEV] ` prefix into document.title.
 */
export function DevEnvironmentBanner() {
  useEffect(() => {
    if (!document.title.startsWith("[DEV] ")) {
      document.title = `[DEV] ${document.title}`;
    }
    const orig = document.title;
    const observer = new MutationObserver(() => {
      if (!document.title.startsWith("[DEV] ")) {
        document.title = `[DEV] ${document.title}`;
      }
    });
    const titleEl = document.querySelector("title");
    if (titleEl) observer.observe(titleEl, { childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      role="status"
      aria-label="Development environment"
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center bg-destructive text-destructive-foreground text-xs font-semibold tracking-wide px-3 py-1.5 shadow-md"
      style={{ minHeight: 28 }}
    >
      DEVELOPMENT ENVIRONMENT — NOT PRODUCTION · Outbound email, webhooks and third-party calls are blocked
    </div>
  );
}

export function DevEnvironmentBlockScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-destructive text-destructive-foreground p-8 text-center">
      <h1 className="text-2xl font-bold mb-3">Environment misconfigured</h1>
      <p className="max-w-md text-sm opacity-90">
        This build is not marked as <code>development</code>. The application has
        been blocked to prevent any accidental interaction with production
        services. Set <code>VITE_APP_ENV=development</code> and rebuild.
      </p>
    </div>
  );
}
