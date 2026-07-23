import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearProjectAuthStorage } from '@/lib/boot-storage-guard';
import { appReload } from '@/lib/appReload';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [^\s]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
];

const RELOAD_GUARD_KEY = 'app:chunk-reload-attempted';

function isChunkError(err: unknown): boolean {
  if (!err) return false;
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return CHUNK_ERROR_PATTERNS.some((rx) => rx.test(message));
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log without leaking sensitive data — message + component stack only.
    console.error('[AppErrorBoundary] caught error:', error?.name, error?.message, info.componentStack);

    if (isChunkError(error) && typeof window !== 'undefined') {
      const alreadyTried = window.sessionStorage.getItem(RELOAD_GUARD_KEY) === '1';
      if (!alreadyTried) {
        try { window.sessionStorage.setItem(RELOAD_GUARD_KEY, '1'); } catch { /* ignore */ }
        appReload({ reason: 'chunk-load-error', source: 'AppErrorBoundary' });
      }
    }
  }

  private handleRecover = () => {
    try {
      clearProjectAuthStorage();
      window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
    } catch { /* ignore */ }
    appReload({ reason: 'error-boundary-recover', source: 'AppErrorBoundary', navigateTo: '/auth' });
  };

  private handleReload = () => {
    try { window.sessionStorage.removeItem(RELOAD_GUARD_KEY); } catch { /* ignore */ }
    appReload({ reason: 'error-boundary-reload', source: 'AppErrorBoundary' });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = isChunkError(this.state.error);
    return (
      <div style={panelStyle}>
        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            {chunk ? 'Update available' : 'Something went wrong'}
          </h1>
          <p style={{ marginTop: 8, color: '#555' }}>
            {chunk
              ? 'A newer version of the app is available. Reload to continue.'
              : 'The application hit an unexpected error while loading. You can try recovering below.'}
          </p>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={primaryBtn} onClick={this.handleReload}>Reload</button>
            {!chunk && (
              <button style={secondaryBtn} onClick={this.handleRecover}>
                Recover &amp; sign in again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

const panelStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: '#f7f7f9',
};
const cardStyle: React.CSSProperties = {
  maxWidth: 480,
  width: '100%',
  padding: 24,
  background: 'white',
  borderRadius: 12,
  boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
const primaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  background: '#1c477a',
  color: 'white',
  border: 0,
  cursor: 'pointer',
  fontWeight: 500,
};
const secondaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  background: 'white',
  color: '#1c477a',
  border: '1px solid #1c477a',
  cursor: 'pointer',
  fontWeight: 500,
};
