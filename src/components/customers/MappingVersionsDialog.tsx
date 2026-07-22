import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, History, RotateCcw, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ScriptMappingConfig } from "@/lib/scriptImport";

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};

interface Version {
  id: string;
  customer_id: string;
  mapping: ScriptMappingConfig;
  form_template_id: string | null;
  note: string | null;
  source: string;
  created_by: string | null;
  created_at: string;
  author_name?: string | null;
}

interface Props {
  customerId: string;
  customerName?: string;
  currentMapping?: ScriptMappingConfig | null;
  onRestore?: (mapping: ScriptMappingConfig) => void;
  trigger?: React.ReactNode;
}

export function MappingVersionsDialog({
  customerId,
  customerName,
  currentMapping,
  onRestore,
  trigger,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("customer_mapping_versions")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data as Version[]) || [];

      // Resolve author names
      const ids = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean))) as string[];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: users } = await (supabase as any)
          .from("system_users")
          .select("id, first_name, last_name, email")
          .in("id", ids);
        for (const u of (users as any[]) || []) {
          names[u.id] =
            [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "Unknown";
        }
      }
      setVersions(rows.map((r) => ({ ...r, author_name: r.created_by ? names[r.created_by] : null })));
      setSelectedId(rows[0]?.id ?? null);
    } catch (err: any) {
      toast({ title: "Could not load history", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId]);

  const selected = versions.find((v) => v.id === selectedId) || null;

  const handleRestore = async () => {
    if (!selected) return;
    setRestoring(true);
    try {
      // Snapshot the current mapping (with a note) before overwriting
      if (currentMapping) {
        await (supabase as any).from("customer_mapping_versions").insert({
          customer_id: customerId,
          mapping: currentMapping as any,
          source: "restore",
          note: `Auto-snapshot before restoring version from ${formatDateTime(selected.created_at)}`,
        });
      }
      const { error } = await (supabase as any)
        .from("customers")
        .update({ script_field_mappings: selected.mapping as any })
        .eq("id", customerId);
      if (error) throw error;
      toast({
        title: "Mapping restored",
        description: `Reverted to the version from ${formatDateTime(selected.created_at)}.`,
      });
      onRestore?.(selected.mapping);
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Restore failed", description: err?.message, variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  const summarize = (m: ScriptMappingConfig): { fields: number; sections: number } => {
    return {
      fields: m?.fields ? Object.keys(m.fields).length : 0,
      sections: m?.sections?.length || 0,
    };
  };

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          className="h-7 text-xs"
        >
          <History className="h-3.5 w-3.5 mr-1" />
          Version history
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[1000px] w-[95vw] h-[80dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Mapping version history
              {customerName && <span className="text-sm font-normal text-muted-foreground">· {customerName}</span>}
            </DialogTitle>
            <DialogDescription>
              Every time this customer's field mapping changes, a snapshot is stored. Select a version to preview it and restore if needed.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 flex-1 min-h-0 overflow-hidden">
            {/* List */}
            <div className="border rounded-md overflow-y-auto">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : versions.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No history yet.</div>
              ) : (
                <ul className="divide-y">
                  {versions.map((v, idx) => {
                    const { fields } = summarize(v.mapping);
                    const isSelected = v.id === selectedId;
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(v.id)}
                          className={`w-full text-left px-3 py-2 hover:bg-muted/50 ${isSelected ? "bg-primary/10" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">
                              {idx === 0 ? "Current" : `v${versions.length - idx}`}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {v.source}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(v.created_at)}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <UserIcon className="h-3 w-3" />
                            {v.author_name || "System"} · {fields} field{fields === 1 ? "" : "s"}
                          </div>
                          {v.note && (
                            <div className="text-[11px] text-muted-foreground italic mt-0.5 line-clamp-2">
                              {v.note}
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Details */}
            <div className="border rounded-md flex flex-col min-h-0">
              {selected ? (
                <>
                  <div className="p-3 border-b flex items-center justify-between gap-2">
                    <div className="text-sm">
                      <div className="font-medium">{formatDateTime(selected.created_at)}</div>
                      <div className="text-xs text-muted-foreground">
                        {selected.author_name || "System"} · {selected.source}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleRestore}
                      disabled={restoring || selected.id === versions[0]?.id}
                    >
                      {restoring ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Restoring…</>
                      ) : (
                        <><RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore this version</>
                      )}
                    </Button>
                  </div>
                  <div className="p-3 overflow-y-auto text-xs">
                    <div className="mb-2 font-medium text-foreground/80">
                      Sections ({selected.mapping.sections?.length || 0})
                    </div>
                    <ul className="mb-3 space-y-0.5 pl-2">
                      {(selected.mapping.sections || []).map((s) => (
                        <li key={s.id}>
                          <span className="text-muted-foreground">{s.order + 1}.</span> {s.title}
                        </li>
                      ))}
                    </ul>
                    <div className="mb-2 font-medium text-foreground/80">
                      Field routings ({Object.keys(selected.mapping.fields || {}).length})
                    </div>
                    <div className="rounded border bg-muted/30 p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
                      {JSON.stringify(selected.mapping.fields, null, 2)}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-4 text-sm text-muted-foreground">Select a version to see details.</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
