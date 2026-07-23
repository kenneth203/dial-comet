import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App.tsx'
import './index.css'
import { HelmetProvider } from 'react-helmet-async'
import { runBootStorageGuard } from '@/lib/boot-storage-guard'
import { AppErrorBoundary } from '@/components/system/AppErrorBoundary'
import { StartupConfigScreen } from '@/components/system/StartupConfigScreen'

// STEP 1 — remove malformed persisted auth-state BEFORE the Supabase client
// touches localStorage. This is the primary root-cause defense against the
// "indefinite spinner" symptom seen in the Lovable preview.
const guardResult = runBootStorageGuard();
if (guardResult.cleared.length > 0) {
  console.warn('[boot] cleared malformed auth-storage keys:', guardResult.cleared.length);
}

const rootElement = document.getElementById('root')!;
if (rootElement.querySelector('.critical-loading')) {
  rootElement.innerHTML = '';
}

document.title = 'The VA Team Portal';

// STEP 2 — fail loudly if boot-critical configuration is missing.
const missingConfig: string[] = [];
if (!import.meta.env.VITE_SUPABASE_URL) missingConfig.push('VITE_SUPABASE_URL');
if (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) missingConfig.push('VITE_SUPABASE_PUBLISHABLE_KEY');

const root = createRoot(rootElement);

if (missingConfig.length > 0) {
  root.render(<StartupConfigScreen missing={missingConfig} />);
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
}
