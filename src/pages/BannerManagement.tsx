import { useEffect, useState, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Trash2, ArrowUp, ArrowDown, Upload, ImageIcon, Download, Eye, X, Clock, Save, RefreshCw, Zap } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { ResponsiveBannerPreview } from "@/components/banners/ResponsiveBannerPreview";
import banner1 from "@/assets/banner-1.png.asset.json";
import banner2 from "@/assets/banner-2.png.asset.json";
import banner3 from "@/assets/banner-3.png.asset.json";
import banner4 from "@/assets/banner-4.png.asset.json";
import banner5 from "@/assets/banner-5.png.asset.json";


const BUNDLED_BANNERS = [banner1, banner2, banner3, banner4, banner5];

interface BannerRow {
  id: string;
  name: string;
  storage_path: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  signedUrl?: string;
}

const BUCKET = "dashboard-banners";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const SIGNED_URL_TTL = 60 * 60; // 1 hour

export default function BannerManagement() {
  const { user } = useAuth();
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newName, setNewName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pending upload state — image is held here and only committed on Upload click.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [pendingDims, setPendingDims] = useState<{ w: number; h: number } | null>(null);

  // Preview dialog for existing banners
  const [previewBanner, setPreviewBanner] = useState<BannerRow | null>(null);

  // Rotation settings
  const [rotationTz, setRotationTz] = useState<string>("Europe/London");
  const [rotationHour, setRotationHour] = useState<number>(8);
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const [manualSetAt, setManualSetAt] = useState<string | null>(null);
  const [rotationLoaded, setRotationLoaded] = useState(false);
  const [savingRotation, setSavingRotation] = useState(false);
  const [forcing, setForcing] = useState<number | "clear" | null>(null);

  const loadRotation = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("banner_rotation_settings")
      .select("timezone,rotation_hour,manual_index,manual_set_at")
      .limit(1)
      .maybeSingle();
    if (data) {
      setRotationTz(data.timezone ?? "Europe/London");
      setRotationHour(data.rotation_hour ?? 8);
      setManualIndex(data.manual_index ?? null);
      setManualSetAt(data.manual_set_at ?? null);
    }
    setRotationLoaded(true);
  }, []);

  useEffect(() => {
    loadRotation();
  }, [loadRotation]);

  const upsertRotation = async (patch: Record<string, unknown>) => {
    const { data: existing } = await (supabase as any)
      .from("banner_rotation_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    const payload = { ...patch, updated_by: user?.id };
    if (existing) {
      return (supabase as any)
        .from("banner_rotation_settings")
        .update(payload)
        .eq("id", existing.id);
    }
    return (supabase as any)
      .from("banner_rotation_settings")
      .insert({ ...payload, singleton: true });
  };

  const saveRotation = async () => {
    setSavingRotation(true);
    try {
      const { error } = await upsertRotation({
        timezone: rotationTz,
        rotation_hour: rotationHour,
      });
      if (error) throw error;
      toast.success("Rotation schedule saved");
    } catch (e: any) {
      toast.error("Save failed: " + (e?.message ?? "unknown error"));
    } finally {
      setSavingRotation(false);
    }
  };

  const forceBannerLive = async (activeIndex: number) => {
    setForcing(activeIndex);
    try {
      const { error } = await upsertRotation({
        manual_index: activeIndex,
        manual_set_at: new Date().toISOString(),
      });
      if (error) throw error;
      setManualIndex(activeIndex);
      setManualSetAt(new Date().toISOString());
      toast.success("Banner pushed live to all dashboards");
    } catch (e: any) {
      toast.error("Refresh failed: " + (e?.message ?? "unknown error"));
    } finally {
      setForcing(null);
    }
  };

  const clearManualOverride = async () => {
    setForcing("clear");
    try {
      const { error } = await upsertRotation({
        manual_index: null,
        manual_set_at: null,
      });
      if (error) throw error;
      setManualIndex(null);
      setManualSetAt(null);
      toast.success("Resumed scheduled rotation");
    } catch (e: any) {
      toast.error("Failed to clear override: " + (e?.message ?? "unknown error"));
    } finally {
      setForcing(null);
    }
  };



  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("dashboard_banners")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Failed to load banners: " + error.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as BannerRow[];
    // Sign URLs in parallel for previews
    const withUrls = await Promise.all(
      rows.map(async (b) => {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(b.storage_path, SIGNED_URL_TTL);
        return { ...b, signedUrl: signed?.signedUrl };
      }),
    );
    setBanners(withUrls);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Clean up object URL when pending selection changes/unmounts
  useEffect(() => {
    return () => {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    };
  }, [pendingUrl]);

  const clearPending = () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingFile(null);
    setPendingUrl(null);
    setPendingDims(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelected = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Image must be 5MB or smaller.");
      return;
    }
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    const url = URL.createObjectURL(file);
    setPendingFile(file);
    setPendingUrl(url);
    setPendingDims(null);

    // Load natural dimensions and warn if aspect ratio is far from 4:1–5:1.
    const img = new Image();
    img.onload = () => {
      setPendingDims({ w: img.naturalWidth, h: img.naturalHeight });
      const ratio = img.naturalWidth / img.naturalHeight;
      if (ratio < 4 || ratio > 5) {
        toast.warning(
          `Banner aspect ratio is ${ratio.toFixed(2)}:1. For best results use a wide banner between 4:1 and 5:1 (e.g. 1800×400 px).`,
        );
      }
    };
    img.src = url;
  };

  const commitUpload = async () => {
    const file = pendingFile;
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const nextOrder = banners.length
        ? Math.max(...banners.map((b) => b.sort_order)) + 1
        : 0;

      const { error: insErr } = await supabase.from("dashboard_banners").insert({
        name: newName.trim() || file.name,
        storage_path: path,
        is_active: true,
        sort_order: nextOrder,
        created_by: user?.id,
      });
      if (insErr) throw insErr;

      toast.success("Banner uploaded");
      setNewName("");
      clearPending();
      await load();
    } catch (e: any) {
      toast.error("Upload failed: " + (e?.message ?? "unknown error"));
    } finally {
      setUploading(false);
    }
  };



  const importBundled = async () => {
    setImporting(true);
    let imported = 0;
    try {
      const baseOrder = banners.length
        ? Math.max(...banners.map((b) => b.sort_order)) + 1
        : 0;
      for (let i = 0; i < BUNDLED_BANNERS.length; i++) {
        const meta = BUNDLED_BANNERS[i];
        try {
          const res = await fetch(meta.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const path = `${crypto.randomUUID()}.png`;
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, blob, { contentType: meta.content_type || "image/png", upsert: false });
          if (upErr) throw upErr;
          const { error: insErr } = await supabase.from("dashboard_banners").insert({
            name: meta.original_filename || `Banner ${i + 1}`,
            storage_path: path,
            is_active: true,
            sort_order: baseOrder + i,
            created_by: user?.id,
          });
          if (insErr) throw insErr;
          imported++;
        } catch (inner: any) {
          console.error("Import failed for", meta.original_filename, inner);
        }
      }
      if (imported > 0) {
        toast.success(`Imported ${imported} banner${imported === 1 ? "" : "s"}`);
        await load();
      } else {
        toast.error("Could not import any banners");
      }
    } finally {
      setImporting(false);
    }
  };



  const toggleActive = async (banner: BannerRow) => {
    const { error } = await supabase
      .from("dashboard_banners")
      .update({ is_active: !banner.is_active })
      .eq("id", banner.id);
    if (error) {
      toast.error("Failed to update: " + error.message);
      return;
    }
    setBanners((prev) =>
      prev.map((b) => (b.id === banner.id ? { ...b, is_active: !b.is_active } : b)),
    );
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= banners.length) return;
    const a = banners[index];
    const b = banners[target];
    const [aOrder, bOrder] = [a.sort_order, b.sort_order];
    // Optimistic swap
    const next = [...banners];
    next[index] = { ...b, sort_order: aOrder };
    next[target] = { ...a, sort_order: bOrder };
    next.sort((x, y) => x.sort_order - y.sort_order);
    setBanners(next);

    const { error: e1 } = await supabase
      .from("dashboard_banners")
      .update({ sort_order: bOrder })
      .eq("id", a.id);
    const { error: e2 } = await supabase
      .from("dashboard_banners")
      .update({ sort_order: aOrder })
      .eq("id", b.id);
    if (e1 || e2) {
      toast.error("Failed to reorder");
      load();
    }
  };

  const remove = async (banner: BannerRow) => {
    if (!window.confirm(`Delete "${banner.name}"? This cannot be undone.`)) return;
    const { error: dbErr } = await supabase
      .from("dashboard_banners")
      .delete()
      .eq("id", banner.id);
    if (dbErr) {
      toast.error("Delete failed: " + dbErr.message);
      return;
    }
    await supabase.storage.from(BUCKET).remove([banner.storage_path]);
    setBanners((prev) => prev.filter((b) => b.id !== banner.id));
    toast.success("Banner deleted");
  };

  const activeCount = banners.filter((b) => b.is_active).length;

  return (
    <div className="container py-6 px-4 lg:px-6 space-y-6">
      <Helmet>
        <title>Banner Management | The VA Team Portal</title>
      </Helmet>

      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard Banners</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload and manage hero banners shown on the dashboard. Active banners rotate
          once every 24 hours at the configured time. {activeCount} active of {banners.length}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" /> Rotation schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Set the time of day when active banners rotate. Defaults to 08:00 Europe/London
            (DST-aware). Applies to all users.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
            <div className="grid gap-2">
              <Label htmlFor="rotation-tz">Timezone</Label>
              <Select value={rotationTz} onValueChange={setRotationTz} disabled={!rotationLoaded || savingRotation}>
                <SelectTrigger id="rotation-tz">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "Europe/London",
                    "Europe/Dublin",
                    "Europe/Paris",
                    "Europe/Berlin",
                    "Europe/Madrid",
                    "UTC",
                    "America/New_York",
                    "America/Chicago",
                    "America/Denver",
                    "America/Los_Angeles",
                    "Asia/Dubai",
                    "Asia/Kolkata",
                    "Asia/Singapore",
                    "Asia/Tokyo",
                    "Australia/Sydney",
                  ].map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rotation-hour">Rotation time</Label>
              <Select
                value={String(rotationHour)}
                onValueChange={(v) => setRotationHour(Number(v))}
                disabled={!rotationLoaded || savingRotation}
              >
                <SelectTrigger id="rotation-hour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, "0")}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={saveRotation} disabled={!rotationLoaded || savingRotation}>
              {savingRotation ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</>
              ) : (
                <><Save className="h-4 w-4 mr-1" /> Save schedule</>
              )}
            </Button>
            {manualIndex !== null && (
              <Button
                size="sm"
                variant="outline"
                onClick={clearManualOverride}
                disabled={forcing !== null}
              >
                {forcing === "clear" ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Clearing…</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-1" /> Resume scheduled rotation</>
                )}
              </Button>
            )}
          </div>
          {manualIndex !== null && (
            <p className="text-xs text-muted-foreground">
              A banner is currently pinned live (manual override
              {manualSetAt ? ` since ${new Date(manualSetAt).toLocaleString("en-GB")}` : ""}).
              Scheduled rotation is paused until you resume it.
            </p>
          )}

        </CardContent>
      </Card>

      <Card>
        <CardHeader>

          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload new banner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="banner-name">Name (optional)</Label>
            <Input
              id="banner-name"
              placeholder="e.g. Summer promo"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={uploading}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="banner-file">
              Image file (max 5MB, recommended wide banner 4:1 to 5:1, e.g. 1800×400 px)
            </Label>
            <Input
              id="banner-file"
              type="file"
              accept="image/*"
              ref={fileInputRef}
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f);
              }}
            />
          </div>

          {pendingUrl && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-foreground">Responsive preview</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pendingDims
                      ? `${pendingDims.w} × ${pendingDims.h} px · ratio ${(pendingDims.w / pendingDims.h).toFixed(2)}:1`
                      : "Reading image…"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This shows how the banner will crop and scale on each device before saving.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={clearPending} disabled={uploading}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={commitUpload} disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-1" /> Upload banner
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <ResponsiveBannerPreview src={pendingUrl} alt={pendingFile?.name || "Pending banner"} />
            </div>
          )}

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            All banners
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : banners.length === 0 ? (
            <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground py-12">
              <ImageIcon className="h-8 w-8 opacity-50" />
              <p>No banners uploaded yet.</p>
              <p className="text-xs">
                The dashboard is currently showing the 5 bundled banners. Import them
                here to preview, replace, or delete them.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={importBundled}
                disabled={importing}
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" /> Import current dashboard banners
                  </>
                )}
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {banners.map((b, idx) => {
                const activeList = banners.filter((x) => x.is_active);
                const activeIdx = activeList.findIndex((x) => x.id === b.id);
                const isLive = b.is_active && manualIndex !== null && activeIdx === manualIndex;
                return (
                <li
                  key={b.id}
                  className="flex flex-col sm:flex-row gap-4 border rounded-lg p-3 bg-card"
                >
                  <div className="w-full sm:w-64 shrink-0 aspect-[6/1] bg-muted rounded overflow-hidden flex items-center justify-center">
                    {b.signedUrl ? (
                      <img
                        src={b.signedUrl}
                        alt={b.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <div>
                      <p className="font-medium text-foreground">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Position {idx + 1} · Uploaded{" "}
                        {new Date(b.created_at).toLocaleDateString("en-GB")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-auto">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={b.is_active}
                          onCheckedChange={() => toggleActive(b)}
                          id={`active-${b.id}`}
                        />
                        <Label htmlFor={`active-${b.id}`} className="text-sm">
                          {b.is_active ? "Active" : "Inactive"}
                        </Label>
                      </div>
                      <div className="flex gap-1 ml-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewBanner(b)}
                          disabled={!b.signedUrl}
                          aria-label="Preview banner"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant={isLive ? "default" : "outline"}
                          onClick={() => forceBannerLive(activeIdx)}
                          disabled={!b.is_active || activeIdx < 0 || forcing !== null}
                          aria-label="Push this banner live now"
                          title={
                            !b.is_active
                              ? "Activate this banner first"
                              : isLive
                                ? "Currently pinned live"
                                : "Push this banner live to all dashboards now"
                          }
                        >
                          {forcing === activeIdx ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => move(idx, -1)}
                          disabled={idx === 0}
                          aria-label="Move up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => move(idx, 1)}
                          disabled={idx === banners.length - 1}
                          aria-label="Move down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => remove(b)}
                          aria-label="Delete banner"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!previewBanner} onOpenChange={(open) => !open && setPreviewBanner(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewBanner?.name || "Banner preview"}</DialogTitle>
          </DialogHeader>
          {previewBanner?.signedUrl && (
            <ResponsiveBannerPreview src={previewBanner.signedUrl} alt={previewBanner.name} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

