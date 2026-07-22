import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Loader2, FileText, ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { ScriptPreview } from "./ScriptPreview";

interface AuditRow {
  id: string;
  customer_id: string;
  user_id: string;
  source_type: string;
  source_name: string | null;
  source_size: number | null;
  source_text_preview: string | null;
  applied_mode: string;
  old_script: string | null;
  new_script: string | null;
  customer_updates: Record<string, string>;
  quick_ref_rows: any[];
  ocr_used: boolean;
  ocr_avg_confidence: number | null;
  pages_processed: number | null;
  created_at: string;
}

interface Props {
  customerId: string;
  customerName?: string;
  triggerLabel?: string;
}

export function ScriptImportHistory({ customerId, customerName, triggerLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !customerId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("script_import_audit")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error && data) {
        setRows(data as any);
        const ids = Array.from(new Set(data.map((r: any) => r.user_id).filter(Boolean)));
        if (ids.length) {
          const { data: users } = await (supabase
            .from("system_users") as any)
            .select("auth_user_id, first_name, last_name")
            .in("auth_user_id", ids);
          const map: Record<string, string> = {};
          (users || []).forEach((u: any) => {
            map[u.auth_user_id] = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "User";
          });
          setUserNames(map);
        }
      }
      setLoading(false);
    })();
  }, [open, customerId]);

  const kindBadge = (kind: string) => {
    const label = kind.toUpperCase();
    return <Badge variant="secondary" className="text-[10px]">{label}</Badge>;
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <History className="h-4 w-4 mr-2" />
        {triggerLabel ?? "Import history"}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelected(null); }}>
        <DialogContent className="max-w-[1100px] w-[95vw] h-[85dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selected ? (
                <button
                  className="inline-flex items-center gap-1 hover:underline"
                  onClick={() => setSelected(null)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back to history
                </button>
              ) : (
                <>Script import history{customerName ? ` — ${customerName}` : ""}</>
              )}
            </DialogTitle>
            <DialogDescription>
              {selected
                ? `Import on ${format(new Date(selected.created_at), "dd/MM/yyyy HH:mm")}`
                : "Each row records a script import: who ran it, from what source, and what changed."}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : selected ? (
            <ScrollArea className="flex-1 pr-3">
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Source">
                    <div className="flex items-center gap-2">
                      {kindBadge(selected.source_type)}
                      <span className="truncate">{selected.source_name || "—"}</span>
                    </div>
                  </Field>
                  <Field label="Applied">
                    <Badge variant={selected.applied_mode === "append" ? "outline" : "default"}>
                      {selected.applied_mode}
                    </Badge>
                  </Field>
                  <Field label="By">{userNames[selected.user_id] || "Unknown user"}</Field>
                  <Field label="When">{format(new Date(selected.created_at), "dd/MM/yyyy HH:mm:ss")}</Field>
                  {selected.ocr_used && (
                    <Field label="OCR">
                      Used
                      {selected.ocr_avg_confidence != null &&
                        ` · ${Math.round(selected.ocr_avg_confidence)}% avg confidence`}
                    </Field>
                  )}
                  {selected.source_size != null && (
                    <Field label="File size">{formatBytes(selected.source_size)}</Field>
                  )}
                </div>

                {Object.keys(selected.customer_updates || {}).length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Customer field updates</div>
                    <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-1">
                      {Object.entries(selected.customer_updates).map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[160px_1fr] gap-2">
                          <span className="font-medium">{k}</span>
                          <span className="whitespace-pre-wrap break-words">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(selected.quick_ref_rows) && selected.quick_ref_rows.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Quick-reference rows</div>
                    <div className="rounded-md border bg-muted/30 p-2 text-xs">
                      {selected.quick_ref_rows.map((r: any, i: number) => (
                        <div key={i} className="grid grid-cols-[160px_1fr] gap-2 py-0.5">
                          <span className="font-medium">{r?.label ?? "—"}</span>
                          <span className="whitespace-pre-wrap break-words">{r?.value ?? ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Script before</div>
                    <div className="rounded-md border p-2 max-h-[300px] overflow-auto">
                      <ScriptPreview html={selected.old_script || "<em>(empty)</em>"} debounceMs={0} />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Script after</div>
                    <div className="rounded-md border p-2 max-h-[300px] overflow-auto">
                      <ScriptPreview html={selected.new_script || ""} debounceMs={0} />
                    </div>
                  </div>
                </div>

                {selected.source_text_preview && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Source text (first 8,000 chars)</div>
                    <pre className="rounded-md border bg-muted/30 p-2 text-xs whitespace-pre-wrap break-words max-h-[240px] overflow-auto">
                      {selected.source_text_preview}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : rows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm">
              <FileText className="h-6 w-6 mb-2" />
              No script imports recorded yet.
            </div>
          ) : (
            <ScrollArea className="flex-1 pr-3">
              <div className="space-y-1">
                {rows.map((r) => (
                  <button
                    key={r.id}
                    className="w-full text-left rounded-md border hover:bg-muted/40 px-3 py-2 flex items-center gap-3"
                    onClick={() => setSelected(r)}
                  >
                    <div className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {format(new Date(r.created_at), "dd/MM/yy HH:mm")}
                    </div>
                    {kindBadge(r.source_type)}
                    <div className="flex-1 min-w-0 truncate text-sm">
                      {r.source_name || (r.source_type === "text" ? "Pasted text" : "—")}
                    </div>
                    <Badge variant={r.applied_mode === "append" ? "outline" : "default"} className="text-[10px]">
                      {r.applied_mode}
                    </Badge>
                    <div className="w-32 shrink-0 text-xs text-muted-foreground truncate">
                      {userNames[r.user_id] || "…"}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
