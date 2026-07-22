import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitCompare, Plus, Minus, Pencil, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FieldTarget,
  ScriptMappingConfig,
  ScriptSection,
} from "@/lib/scriptImport";

interface Preset {
  id: string;
  name: string;
  description: string | null;
  mapping: ScriptMappingConfig;
  is_default: boolean;
  updated_at: string;
}

interface Props {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMapping?: ScriptMappingConfig | null;
  initialLeftId?: string;
  initialRightId?: string;
  onApply?: (mapping: ScriptMappingConfig) => void;
}

const CURRENT_ID = "__current__";

function describeTarget(t: FieldTarget | undefined, sectionTitle: (id: string) => string) {
  if (!t) return "(unset)";
  switch (t.kind) {
    case "ignore":
      return "Ignore";
    case "quick_ref":
      return `Quick ref${t.label ? ` — ${t.label}` : ""}`;
    case "customer_field":
      return `Customer field — ${t.field}`;
    case "script_section":
      return `Section — ${sectionTitle(t.sectionId)}`;
    default:
      return String((t as any).kind);
  }
}

function targetsEqual(a: FieldTarget | undefined, b: FieldTarget | undefined) {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "customer_field" && b.kind === "customer_field") return a.field === b.field;
  if (a.kind === "script_section" && b.kind === "script_section")
    return a.sectionId === b.sectionId;
  if (a.kind === "quick_ref" && b.kind === "quick_ref")
    return (a.label || "") === (b.label || "");
  return true;
}

export function MappingPresetsDiffDialog({
  customerId,
  open,
  onOpenChange,
  currentMapping,
  initialLeftId,
  initialRightId,
  onApply,
}: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);
  const [leftId, setLeftId] = useState<string>(initialLeftId || "");
  const [rightId, setRightId] = useState<string>(initialRightId || "");

  useEffect(() => {
    if (!open || !customerId) return;
    setLoading(true);
    supabase
      .from("customer_mapping_presets" as any)
      .select("id,name,description,mapping,is_default,updated_at")
      .eq("customer_id", customerId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        setLoading(false);
        if (error) return;
        const list = (data || []) as unknown as Preset[];
        setPresets(list);
        // Sensible defaults when nothing preselected
        if (!leftId) {
          if (currentMapping) setLeftId(CURRENT_ID);
          else if (list[0]) setLeftId(list[0].id);
        }
        if (!rightId) {
          const firstNonDefault = list.find((p) => !p.is_default) || list[1] || list[0];
          if (firstNonDefault) setRightId(firstNonDefault.id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId]);

  const options = useMemo(() => {
    const items: Array<{ id: string; label: string; mapping: ScriptMappingConfig | null }> =
      [];
    if (currentMapping) {
      items.push({ id: CURRENT_ID, label: "Current (unsaved)", mapping: currentMapping });
    }
    for (const p of presets) {
      items.push({
        id: p.id,
        label: `${p.is_default ? "★ " : ""}${p.name}`,
        mapping: p.mapping,
      });
    }
    return items;
  }, [presets, currentMapping]);

  const left = options.find((o) => o.id === leftId)?.mapping ?? null;
  const right = options.find((o) => o.id === rightId)?.mapping ?? null;

  const diff = useMemo(() => buildDiff(left, right), [left, right]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] w-[95vw] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-primary" />
            Compare saved layouts
          </DialogTitle>
          <DialogDescription>
            Pick two layouts to see exactly which sections and field targets differ.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 shrink-0">
          <LayoutPicker
            label="Layout A"
            value={leftId}
            onChange={setLeftId}
            options={options}
            loading={loading}
          />
          <LayoutPicker
            label="Layout B"
            value={rightId}
            onChange={setRightId}
            options={options}
            loading={loading}
          />
        </div>

        <div className="flex items-center justify-between shrink-0">
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="border-emerald-400 text-emerald-700 gap-1">
              <Plus className="h-3 w-3" /> Only in B ({diff.summary.addedFields + diff.summary.addedSections})
            </Badge>
            <Badge variant="outline" className="border-red-400 text-red-700 gap-1">
              <Minus className="h-3 w-3" /> Only in A ({diff.summary.removedFields + diff.summary.removedSections})
            </Badge>
            <Badge variant="outline" className="border-amber-400 text-amber-700 gap-1">
              <Pencil className="h-3 w-3" /> Changed ({diff.summary.changedFields + diff.summary.changedSections})
            </Badge>
            <Badge variant="secondary">
              Same ({diff.summary.sameFields + diff.summary.sameSections})
            </Badge>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 border rounded-md">
          <div className="p-3 space-y-4 text-sm">
            {/* Sections */}
            <section>
              <h3 className="font-semibold mb-2">Script sections</h3>
              <DiffTable
                rows={diff.sectionRows}
                emptyLabel="No section differences."
              />
            </section>

            {/* Fields */}
            <section>
              <h3 className="font-semibold mb-2">Field mappings</h3>
              <DiffTable rows={diff.fieldRows} emptyLabel="No field mapping differences." />
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0">
          {onApply && right && rightId !== CURRENT_ID && (
            <Button
              variant="outline"
              onClick={() => {
                onApply(right);
                onOpenChange(false);
              }}
            >
              Apply Layout B
            </Button>
          )}
          {onApply && left && leftId !== CURRENT_ID && (
            <Button
              variant="outline"
              onClick={() => {
                onApply(left);
                onOpenChange(false);
              }}
            >
              Apply Layout A
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LayoutPicker({
  label,
  value,
  onChange,
  options,
  loading,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
  loading: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={loading ? "Loading…" : "Choose a layout"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
          {options.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-1">
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              No saved layouts
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

type DiffRow = {
  key: string;
  label: string;
  a: string | null; // null means missing
  b: string | null;
  status: "added" | "removed" | "changed" | "same";
};

function DiffTable({ rows, emptyLabel }: { rows: DiffRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="border rounded overflow-hidden">
      <div className="grid grid-cols-12 gap-2 bg-muted/60 px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        <div className="col-span-3">Field / Section</div>
        <div className="col-span-4">Layout A</div>
        <div className="col-span-4">Layout B</div>
        <div className="col-span-1 text-right">Status</div>
      </div>
      <ul>
        {rows.map((r) => (
          <li
            key={r.key}
            className={cn(
              "grid grid-cols-12 gap-2 px-2 py-1.5 items-start border-t text-xs",
              r.status === "added" && "bg-emerald-50/50 dark:bg-emerald-950/20",
              r.status === "removed" && "bg-red-50/50 dark:bg-red-950/20",
              r.status === "changed" && "bg-amber-50/50 dark:bg-amber-950/20",
            )}
          >
            <div className="col-span-3 font-medium break-words">{r.label}</div>
            <div
              className={cn(
                "col-span-4 break-words",
                r.a === null && "italic text-muted-foreground",
                r.status === "changed" && r.a !== null && "text-red-700 dark:text-red-300",
              )}
            >
              {r.a ?? "— absent —"}
            </div>
            <div
              className={cn(
                "col-span-4 break-words flex items-start gap-1",
                r.b === null && "italic text-muted-foreground",
              )}
            >
              {r.status === "changed" && r.a !== null && r.b !== null && (
                <ArrowRight className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
              )}
              <span
                className={cn(
                  r.status === "changed" &&
                    r.b !== null &&
                    "text-emerald-700 dark:text-emerald-300 font-medium",
                )}
              >
                {r.b ?? "— absent —"}
              </span>
            </div>
            <div className="col-span-1 flex justify-end">
              <StatusBadge status={r.status} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: DiffRow["status"] }) {
  if (status === "added")
    return (
      <Badge variant="outline" className="border-emerald-400 text-emerald-700 gap-1">
        <Plus className="h-3 w-3" /> B
      </Badge>
    );
  if (status === "removed")
    return (
      <Badge variant="outline" className="border-red-400 text-red-700 gap-1">
        <Minus className="h-3 w-3" /> A
      </Badge>
    );
  if (status === "changed")
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-700 gap-1">
        <Pencil className="h-3 w-3" /> Diff
      </Badge>
    );
  return <Badge variant="secondary">Same</Badge>;
}

interface DiffResult {
  sectionRows: DiffRow[];
  fieldRows: DiffRow[];
  summary: {
    addedSections: number;
    removedSections: number;
    changedSections: number;
    sameSections: number;
    addedFields: number;
    removedFields: number;
    changedFields: number;
    sameFields: number;
  };
}

function buildDiff(
  a: ScriptMappingConfig | null,
  b: ScriptMappingConfig | null,
): DiffResult {
  const emptySummary = {
    addedSections: 0,
    removedSections: 0,
    changedSections: 0,
    sameSections: 0,
    addedFields: 0,
    removedFields: 0,
    changedFields: 0,
    sameFields: 0,
  };
  if (!a || !b) return { sectionRows: [], fieldRows: [], summary: emptySummary };

  // Sections
  const sectionMapA = new Map<string, ScriptSection>();
  const sectionMapB = new Map<string, ScriptSection>();
  a.sections.forEach((s) => sectionMapA.set(s.id, s));
  b.sections.forEach((s) => sectionMapB.set(s.id, s));
  const sectionIds = new Set<string>([...sectionMapA.keys(), ...sectionMapB.keys()]);

  const sectionTitleForDiff = (id: string) =>
    sectionMapA.get(id)?.title || sectionMapB.get(id)?.title || id;

  const sectionRows: DiffRow[] = [];
  const summary = { ...emptySummary };
  for (const id of sectionIds) {
    const sa = sectionMapA.get(id);
    const sb = sectionMapB.get(id);
    const descA = sa ? `${sa.title} (order ${sa.order})` : null;
    const descB = sb ? `${sb.title} (order ${sb.order})` : null;
    let status: DiffRow["status"] = "same";
    if (!sa) status = "added";
    else if (!sb) status = "removed";
    else if (sa.title !== sb.title || sa.order !== sb.order) status = "changed";
    if (status === "added") summary.addedSections++;
    else if (status === "removed") summary.removedSections++;
    else if (status === "changed") summary.changedSections++;
    else summary.sameSections++;
    if (status !== "same") {
      sectionRows.push({ key: `s:${id}`, label: id, a: descA, b: descB, status });
    }
  }
  sectionRows.sort((x, y) => (x.status < y.status ? -1 : 1));

  // Fields
  const fieldKeys = new Set<string>([...Object.keys(a.fields), ...Object.keys(b.fields)]);
  const fieldRows: DiffRow[] = [];
  for (const k of fieldKeys) {
    const ta = a.fields[k];
    const tb = b.fields[k];
    const descA = ta ? describeTarget(ta, sectionTitleForDiff) : null;
    const descB = tb ? describeTarget(tb, sectionTitleForDiff) : null;
    let status: DiffRow["status"] = "same";
    if (!ta) status = "added";
    else if (!tb) status = "removed";
    else if (!targetsEqual(ta, tb)) status = "changed";
    if (status === "added") summary.addedFields++;
    else if (status === "removed") summary.removedFields++;
    else if (status === "changed") summary.changedFields++;
    else summary.sameFields++;
    if (status !== "same") {
      fieldRows.push({ key: `f:${k}`, label: k, a: descA, b: descB, status });
    }
  }
  fieldRows.sort((x, y) => x.label.localeCompare(y.label));

  return { sectionRows, fieldRows, summary };
}
