import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App.tsx'
import './index.css'
import { HelmetProvider } from 'react-helmet-async'
import { runBootStorageGuard } from '@/lib/boot-storage-guard'
import { AppErrorBoundary } from '@/components/system/AppErrorBoundary'
import { StartupConfigScreen } from '@/components/system/StartupConfigScreen'
import { recordBootStart, attachLifecycleDiagnostics } from '@/lib/appReload'

// Boot diagnostics — records last reload origin and lifecycle events.
recordBootStart();
attachLifecycleDiagnostics();

// STEP 1 — remove malformed persisted auth-state BEFORE the Supabase client
// touches localStorage.
const guardResult = runBootStorageGuard();
if (guardResult.cleared.length > 0) {
  console.warn('[boot] cleared malformed auth-storage keys:', guardResult.cleared.length);
}

const rootElement = document.getElementById('root')!;

document.title = 'The VA Team Portal';

// STEP 2 — fail loudly if boot-critical configuration is missing.
const missingConfig: string[] = [];
if (!import.meta.env.VITE_SUPABASE_URL) missingConfig.push('VITE_SUPABASE_URL');
if (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) missingConfig.push('VITE_SUPABASE_PUBLISHABLE_KEY');

// Signal the pre-React static failsafe to stand down immediately.
declare global {
  interface Window { __clearBootFailsafe?: () => void }
}
const clearFailsafe = () => {
  try { window.__clearBootFailsafe?.(); } catch { /* ignore */ }
};

const root = createRoot(rootElement);

if (missingConfig.length > 0) {
  root.render(<StartupConfigScreen missing={missingConfig} />);
  clearFailsafe();
} else {
  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <HelmetProvider>
          <App />
        </HelmetProvider>
      </AppErrorBoundary>
    </StrictMode>
  );
  // Remove the pre-React fallback on the next paint frame, after React has
  // committed its first render. Ensures no overlap with the working app.
  requestAnimationFrame(() => clearFailsafe());
}
