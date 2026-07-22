import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Keeps the current user's `user_statuses.last_heartbeat_at` fresh while the
 * app is open and signed-in.
 *
 * - Pings every 60s when the tab is visible.
 * - Pings immediately on mount, on tab refocus, and on network reconnect.
 * - Server-side cron (`mark_stale_users_offline`) flips users to Offline if
 *   no heartbeat has arrived for 3 minutes, so a crashed tab / dropped wifi /
 *   closed laptop automatically appears Offline to the rest of the team.
 */
export function useStatusHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let intervalId: number | null = null;

    const ping = async () => {
      if (cancelled) return;
      try {
        await supabase.rpc('heartbeat_user_status' as never);
      } catch (err) {
        console.debug('Heartbeat failed', err);
      }
    };

    // Fire immediately, then every 30s so Online status reflects in near real time.
    void ping();
    intervalId = window.setInterval(() => { void ping(); }, 30_000);

    const onVisible = () => { if (document.visibilityState === 'visible') void ping(); };
    const onOnline = () => { void ping(); };

    // On tab close / page hide, proactively mark this user offline using
    // fetch keepalive so it survives the page teardown. Avoids waiting on the
    // 3-min stale-offline sweep when someone simply closes the browser.
    const onPageHide = () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/mark_self_offline`;
        const token = (supabase as unknown as { auth: { currentSession?: { access_token?: string } } })
          .auth.currentSession?.access_token;
        void fetch(url, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: '{}',
        });
      } catch {
        /* best-effort */
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onOnline);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);

    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onOnline);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
    };
  }, [user]);
}
