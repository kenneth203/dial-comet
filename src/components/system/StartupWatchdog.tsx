import { useEffect, useState } from 'react';
import { clearProjectAuthStorage } from '@/lib/boot-storage-guard';

const WATCHDOG_MS = 12_000;

/**
 * Safety net: if the boot has not signalled readiness within WATCHDOG_MS,
 * assume the app is stuck on a spinner and offer the user a recovery panel.
 * The AuthProvider fires `app:auth-ready` when it reaches a terminal state.
 */
export function StartupWatchdog() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let ready = false;
    const onReady = () => {
      ready = true;
      window.clearTimeout(timer);
    };
    window.addEventListener('app:auth-ready', onReady, { once: true });

    const timer = window.setTimeout(() => {
      if (!ready) setStuck(true);
    }, WATCHDOG_MS);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('app:auth-ready', onReady);
    };
  }, []);

  if (!stuck) return null;

  const recover = () => {
    try {
      clearProjectAuthStorage();
      window.sessionStorage.removeItem('app:chunk-reload-attempted');
    } catch { /* ignore */ }
    window.location.replace('/auth');
  };

  const reload = () => window.location.reload();

  return (
    <div style={overlay}>
      <div style={card}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Still loading…</h1>
        <p style={{ marginTop: 8, color: '#555' }}>
          The application is taking longer than expected to start. You can reload,
          or clear the local sign-in state and start fresh.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={primary} onClick={reload}>Reload</button>
          <button style={secondary} onClick={recover}>Clear session &amp; retry</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(247,247,249,0.96)',
  zIndex: 2147483000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
const card: React.CSSProperties = {
  maxWidth: 480,
  width: '100%',
  padding: 24,
  background: 'white',
  borderRadius: 12,
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
};
const primary: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 8, background: '#1c477a',
  color: 'white', border: 0, cursor: 'pointer', fontWeight: 500,
};
const secondary: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 8, background: 'white',
  color: '#1c477a', border: '1px solid #1c477a', cursor: 'pointer', fontWeight: 500,
};
