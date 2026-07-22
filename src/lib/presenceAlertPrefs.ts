// Per-admin presence alert preferences, persisted in localStorage.
// Scoped per signed-in admin user_id so multiple admins on the same
// browser do not overwrite each other's settings.

export type PresenceAlertChannel = "none" | "toast" | "email" | "both";

export interface PresenceAlertPrefs {
  channel: PresenceAlertChannel;
  // Minimum minutes between alerts for the SAME operator + transition.
  // 0 = instant (every transition fires an alert).
  throttleMinutes: number;
  // If true, only fire when an operator goes Offline. If false, also
  // fire when they come back Online.
  offlineOnly: boolean;
}

export const DEFAULT_PRESENCE_PREFS: PresenceAlertPrefs = {
  channel: "both",
  throttleMinutes: 0,
  offlineOnly: false,
};

const key = (userId: string) => `presence-alert-prefs:${userId}`;

export function loadPresenceAlertPrefs(userId: string): PresenceAlertPrefs {
  if (typeof window === "undefined") return DEFAULT_PRESENCE_PREFS;
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return DEFAULT_PRESENCE_PREFS;
    const parsed = JSON.parse(raw);
    return {
      channel: (parsed.channel as PresenceAlertChannel) ?? DEFAULT_PRESENCE_PREFS.channel,
      throttleMinutes:
        typeof parsed.throttleMinutes === "number" && parsed.throttleMinutes >= 0
          ? parsed.throttleMinutes
          : DEFAULT_PRESENCE_PREFS.throttleMinutes,
      offlineOnly:
        typeof parsed.offlineOnly === "boolean"
          ? parsed.offlineOnly
          : DEFAULT_PRESENCE_PREFS.offlineOnly,
    };
  } catch {
    return DEFAULT_PRESENCE_PREFS;
  }
}

export function savePresenceAlertPrefs(userId: string, prefs: PresenceAlertPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(userId), JSON.stringify(prefs));
  // Notify listeners (the hook) in this tab.
  window.dispatchEvent(
    new CustomEvent("presence-alert-prefs-changed", { detail: { userId, prefs } }),
  );
}
