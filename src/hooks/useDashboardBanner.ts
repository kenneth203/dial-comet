import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import banner1 from "@/assets/banner-1.png.asset.json";
import banner2 from "@/assets/banner-2.png.asset.json";
import banner3 from "@/assets/banner-3.png.asset.json";
import banner4 from "@/assets/banner-4.png.asset.json";
import banner5 from "@/assets/banner-5.png.asset.json";

const FALLBACK_BANNERS = [banner1.url, banner2.url, banner3.url, banner4.url, banner5.url];
const DEFAULT_TZ = "Europe/London";
const DEFAULT_HOUR = 8;
const SIGNED_URL_TTL = 60 * 60 * 6;

type RotationSettings = {
  timezone: string;
  rotation_hour: number;
  manual_index: number | null;
  manual_set_at: string | null;
};

/**
 * Loads active dashboard banners and picks one on a daily rotation.
 * Super-Admins can override the current pick immediately via `manual_index`
 * (see "Refresh banner now"); otherwise it rotates at the configured hour.
 */
export function useDashboardBanner(): string {
  const [urls, setUrls] = useState<string[]>(FALLBACK_BANNERS);
  const [settings, setSettings] = useState<RotationSettings>({
    timezone: DEFAULT_TZ,
    rotation_hour: DEFAULT_HOUR,
    manual_index: null,
    manual_set_at: null,
  });

  useEffect(() => {
    let cancelled = false;

    const loadBanners = async () => {
      const { data: banners } = await supabase
        .from("dashboard_banners")
        .select("storage_path,sort_order,created_at")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled || !banners || banners.length === 0) return;
      const signed = await Promise.all(
        banners.map(async (row) => {
          const { data: s } = await supabase.storage
            .from("dashboard-banners")
            .createSignedUrl(row.storage_path, SIGNED_URL_TTL);
          return s?.signedUrl;
        }),
      );
      const resolved = signed.filter((u): u is string => !!u);
      if (!cancelled && resolved.length > 0) setUrls(resolved);
    };

    const loadSettings = async () => {
      const { data } = await (supabase as any)
        .from("banner_rotation_settings")
        .select("timezone,rotation_hour,manual_index,manual_set_at")
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) {
        setSettings({
          timezone: data.timezone ?? DEFAULT_TZ,
          rotation_hour: data.rotation_hour ?? DEFAULT_HOUR,
          manual_index: data.manual_index ?? null,
          manual_set_at: data.manual_set_at ?? null,
        });
      }
    };

    void loadBanners();
    void loadSettings();

    // Realtime: when a Super-Admin forces a refresh or changes schedule,
    // every open dashboard picks it up immediately.
    const channel = supabase
      .channel("banner-rotation-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "banner_rotation_settings" },
        (payload: any) => {
          const row = payload.new ?? payload.old;
          if (!row) return;
          setSettings({
            timezone: row.timezone ?? DEFAULT_TZ,
            rotation_hour: row.rotation_hour ?? DEFAULT_HOUR,
            manual_index: row.manual_index ?? null,
            manual_set_at: row.manual_set_at ?? null,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dashboard_banners" },
        () => {
          void loadBanners();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // Manual override wins over the daily rotation.
  if (
    settings.manual_index !== null &&
    settings.manual_index >= 0 &&
    urls.length > 0
  ) {
    return urls[settings.manual_index % urls.length];
  }

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  let daysSinceEpoch = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  if (h < settings.rotation_hour) daysSinceEpoch -= 1;
  return urls[((daysSinceEpoch % urls.length) + urls.length) % urls.length];
}
