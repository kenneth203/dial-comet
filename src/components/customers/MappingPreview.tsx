import { useMemo } from "react";
import {
  CUSTOMER_FIELD_LABELS,
  type CustomerFieldKey,
  type FieldTarget,
  type ScriptMappingConfig,
  type ScriptSection,
} from "@/lib/scriptImport";
import { ArrowRight, User, ListChecks, FileText, EyeOff } from "lucide-react";

interface Props {
  flatFields: Array<{ id: string; label: string }>;
  mapping: ScriptMappingConfig | null;
  responses: Record<string, any> | null | undefined;
}

function stringifyValue(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(stringifyValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    // Common shapes: {value}, {label,value}, address objects
    if ("value" in v) return stringifyValue((v as any).value);
    return Object.values(v).map(stringifyValue).filter(Boolean).join(" ");
  }
  return "";
}

type Row = { fieldId: string; label: string; value: string };

export function MappingPreview({ flatFields, mapping, responses }: Props) {
  const grouped = useMemo(() => {
    const customerFields = new Map<CustomerFieldKey, Row[]>();
    const sections = new Map<string, { title: string; rows: Row[] }>();
    const quickRef: Row[] = [];
    const ignored: Row[] = [];

    const sectionTitle = (id: string) =>
      mapping?.sections.find((s) => s.id === id)?.title || id;

    for (const f of flatFields) {
      const target: FieldTarget =
        mapping?.fields[f.id] ?? { kind: "script_section", sectionId: "business_info" };
      const raw = responses ? stringifyValue(responses[f.id]) : "";
      const row: Row = { fieldId: f.id, label: f.label, value: raw };

      if (target.kind === "ignore") {
        ignored.push(row);
      } else if (target.kind === "quick_ref") {
        quickRef.push(row);
      } else if (target.kind === "customer_field") {
        const list = customerFields.get(target.field) ?? [];
        list.push(row);
        customerFields.set(target.field, list);
      } else {
        const entry = sections.get(target.sectionId) ?? {
          title: sectionTitle(target.sectionId),
          rows: [],
        };
        entry.rows.push(row);
        sections.set(target.sectionId, entry);
      }
    }
    return { customerFields, sections, quickRef, ignored };
  }, [flatFields, mapping, responses]);

  const totalMapped =
    grouped.customerFields.size + grouped.sections.size + (grouped.quickRef.length ? 1 : 0);

  if (!mapping || flatFields.length === 0) return null;

  const filledCount = (rows: Row[]) => rows.filter((r) => r.value).length;

  const renderRow = (r: Row) => (
    <div key={r.fieldId} className="flex items-start gap-2 text-xs py-0.5">
      <span className="text-muted-foreground shrink-0 max-w-[45%] truncate" title={r.label}>
        {r.label}
      </span>
      <ArrowRight className="h-3 w-3 mt-0.5 text-muted-foreground/60 shrink-0" />
      <span
        className={`min-w-0 flex-1 truncate ${r.value ? "text-foreground" : "text-muted-foreground/60 italic"}`}
        title={r.value || "(no value in submission)"}
      >
        {r.value || "—"}
      </span>
    </div>
  );

  return (
    <div className="rounded-lg border bg-muted/20">
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          Mapping preview
        </div>
        <span className="text-[11px] text-muted-foreground">
          {totalMapped} destination{totalMapped === 1 ? "" : "s"} · {flatFields.length} field
          {flatFields.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="max-h-72 overflow-y-auto p-3 space-y-3">
        {grouped.customerFields.size > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-1">
              <User className="h-3.5 w-3.5" /> Customer fields
            </div>
            <div className="space-y-1 pl-1">
              {Array.from(grouped.customerFields.entries()).map(([field, rows]) => (
                <div key={field} className="rounded border bg-background/60 px-2 py-1">
                  <div className="text-[11px] font-medium text-foreground/80 mb-0.5">
                    {CUSTOMER_FIELD_LABELS[field]}
                    <span className="ml-1 text-muted-foreground font-normal">
                      ({filledCount(rows)}/{rows.length} filled)
                    </span>
                  </div>
                  {rows.map(renderRow)}
                </div>
              ))}
            </div>
          </div>
        )}

        {grouped.sections.size > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-1">
              <FileText className="h-3.5 w-3.5" /> Script sections
            </div>
            <div className="space-y-1 pl-1">
              {Array.from(grouped.sections.entries()).map(([id, entry]) => (
                <div key={id} className="rounded border bg-background/60 px-2 py-1">
                  <div className="text-[11px] font-medium text-foreground/80 mb-0.5">
                    {entry.title}
                    <span className="ml-1 text-muted-foreground font-normal">
                      ({filledCount(entry.rows)}/{entry.rows.length} filled)
                    </span>
                  </div>
                  {entry.rows.map(renderRow)}
                </div>
              ))}
            </div>
          </div>
        )}

        {grouped.quickRef.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-1">
              <ListChecks className="h-3.5 w-3.5" /> Quick reference rows
              <span className="text-muted-foreground font-normal">
                ({filledCount(grouped.quickRef)}/{grouped.quickRef.length} filled)
              </span>
            </div>
            <div className="rounded border bg-background/60 px-2 py-1">
              {grouped.quickRef.map(renderRow)}
            </div>
          </div>
        )}

        {grouped.ignored.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1">
              <EyeOff className="h-3.5 w-3.5" /> Ignored ({grouped.ignored.length})
            </div>
            <div className="rounded border bg-background/40 px-2 py-1 opacity-70">
              {grouped.ignored.map(renderRow)}
            </div>
          </div>
        )}

        {totalMapped === 0 && grouped.ignored.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No fields mapped yet.</p>
        )}
      </div>
    </div>
  );
}
