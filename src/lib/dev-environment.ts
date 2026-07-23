// Phase 0.5 Development Safety Hardening — client-side environment gate.
// This Remix is permanently classified as `development`. If VITE_APP_ENV is
// present, the only accepted value is the exact literal string "development".
// Lovable static previews can omit ignored .env files, so the checked-in code
// defaults the client classification to development, then also restricts the
// app to the confirmed Remix preview origin or localhost.

export const DEV_ENV_VALUE = 'development';
const REMIX_PROJECT_ID = '8b31b9e2-c03e-432c-8f58-7a093ded151c';

function isAllowedDevOrigin(): boolean {
  if (typeof window === 'undefined') return false;

  const { hostname } = window.location;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  ) {
    return true;
  }
  // Allow any Lovable preview subdomain scoped to this Remix project id
  // (e.g. id-preview--<id>.lovable.app, preview--<id>.lovable.app, <id>.lovableproject.com).
  return (
    hostname.endsWith('.lovable.app') ||
    hostname.endsWith('.lovableproject.com')
  ) && hostname.includes(REMIX_PROJECT_ID);
}

export function useIsDevEnvironment(): boolean {
  const configuredEnv = import.meta.env.VITE_APP_ENV ?? DEV_ENV_VALUE;
  return configuredEnv === DEV_ENV_VALUE && isAllowedDevOrigin();
}
