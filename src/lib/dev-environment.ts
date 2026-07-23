// Phase 0.5 Development Safety Hardening — client-side environment gate.
// This Remix is permanently classified as `development`. The only accepted
// value for VITE_APP_ENV is the exact literal string "development".
// Any other value triggers a full-screen block screen instead of the app.

export const DEV_ENV_VALUE = 'development';

export function useIsDevEnvironment(): boolean {
  return import.meta.env.VITE_APP_ENV === DEV_ENV_VALUE;
}
