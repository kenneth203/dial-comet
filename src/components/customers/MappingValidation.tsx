import { useMemo, useState } from "react";
import {
  CUSTOMER_FIELD_LABELS,
  type CustomerFieldKey,
  type FieldTarget,
  type ScriptMappingConfig,
} from "@/lib/scriptImport";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  flatFields: Array<{ id: string; label: string }>;
  mapping: ScriptMappingConfig | null;
  responses: Record<string, any> | null | undefined;
  onOpenMapping?: () => void;
}

function stringifyValue(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(stringifyValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    if ("value" in v) return stringifyValue((v as any).value);
    return Object.values(v).map(stringifyValue).filter(Boolean).join(" ");
  }
  return "";
}

/** Heuristic: a field looks "ambiguous" when its label mentions a customer-ish concept
 *  (name/email/phone/address/etc.) but the current target is a script section — likely
 *  the operator meant to route it to a customer field. */
const CUSTOMER_HINT_RX =
  /\b(e-?mail|phone|telephone|mobile|website|url|address|street|city|town|post ?code|zip|company|business name|trading name)\b/i;

export function MappingValidation({ flatFields, mapping, responses, onOpenMapping }: Props) {
  const [open, setOpen] = useState(true);

  const issues = useMemo(() => {
    const ignored: Array<{ id: string; label: string }> = [];
    const ambiguous: Array<{ id: string; label: string; reason: string }> = [];
    const emptyMapped: Array<{ id: string; label: string; target: string }> = [];
    const conflicts: Array<{ field: CustomerFieldKey; fields: Array<{ id: string; label: string }> }> = [];

    if (!mapping) return { ignored, ambiguous, emptyMapped, conflicts };

    const customerFieldGroups = new Map<CustomerFieldKey, Array<{ id: string; label: string }>>();
    const sectionTitle = (id: string) =>
      mapping.sections.find((s) => s.id === id)?.title || id;

    for (const f of flatFields) {
      const target: FieldTarget =
        mapping.fields[f.id] ?? { kind: "script_section", sectionId: "business_info" };
      const raw = responses ? stringifyValue(responses[f.id]) : "";

      if (target.kind === "ignore") {
        ignored.push({ id: f.id, label: f.label });
        continue;
      }

      // Duplicate customer field detection
      if (target.kind === "customer_field") {
        const list = customerFieldGroups.get(target.field) ?? [];
        list.push({ id: f.id, label: f.label });
        customerFieldGroups.set(target.field, list);
      }

      // Ambiguous: label hints at a customer field but target is a script section (default)
      if (
        target.kind === "script_section" &&
        target.sectionId === "business_info" &&
        CUSTOMER_HINT_RX.test(f.label)
      ) {
        ambiguous.push({
          id: f.id,
          label: f.label,
          reason: "Looks like customer info but is routed to Business information",
        });
      }

      // Filled? if not, flag it (only for actively mapped destinations)
      if (!raw) {
        const targetLabel =
          target.kind === "customer_field"
            ? `Customer → ${CUSTOMER_FIELD_LABELS[target.field]}`
            : target.kind === "quick_ref"
              ? "Quick reference"
              : `Section — ${sectionTitle(target.sectionId)}`;
        emptyMapped.push({ id: f.id, label: f.label, target: targetLabel });
      }
    }

    for (const [field, list] of customerFieldGroups.entries()) {
      if (list.length > 1) conflicts.push({ field, fields: list });
    }

    return { ignored, ambiguous, emptyMapped, conflicts };
  }, [flatFields, mapping, responses]);

  if (!mapping || flatFields.length === 0) return null;

  const totalIssues =
    issues.ambiguous.length +
    issues.conflicts.length +
    issues.emptyMapped.length +
    issues.ignored.length;

  const hasBlockers = issues.ambiguous.length > 0 || issues.conflicts.length > 0;

  if (totalIssues === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 p-2.5 text-xs flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="text-emerald-900 dark:text-emerald-100">
          All {flatFields.length} field{flatFields.length === 1 ? "" : "s"} mapped and filled — ready to import.
        </span>
      </div>
    );
  }

  const tone = hasBlockers
    ? "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20"
    : "border-muted bg-muted/30";
  const iconColor = hasBlockers ? "text-amber-600" : "text-muted-foreground";

  const renderList = (
    title: string,
    color: string,
    items: React.ReactNode[],
  ) =>
    items.length > 0 && (
      <div>
        <div className={`text-[11px] font-semibold mb-1 ${color}`}>{title} ({items.length})</div>
        <ul className="space-y-0.5 pl-1">{items}</ul>
      </div>
    );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={`rounded-lg border ${tone}`}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${iconColor}`} />
            Mapping validation
            <span className="text-xs font-normal text-muted-foreground">
              {totalIssues} item{totalIssues === 1 ? "" : "s"} to review
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-2.5 max-h-64 overflow-y-auto">
        {onOpenMapping && (
          <button
            type="button"
            onClick={onOpenMapping}
            className="text-[11px] text-primary underline hover:no-underline"
          >
            Open field mapping to fix →
          </button>
        )}

        {renderList(
          "Ambiguous — please confirm",
          "text-amber-700 dark:text-amber-400",
          issues.ambiguous.map((a) => (
            <li key={a.id} className="text-xs">
              <span className="font-medium">{a.label}</span>
              <span className="text-muted-foreground"> — {a.reason}</span>
            </li>
          )),
        )}

        {renderList(
          "Conflicts — multiple fields targeting the same customer field",
          "text-amber-700 dark:text-amber-400",
          issues.conflicts.map((c) => (
            <li key={c.field} className="text-xs">
              <span className="font-medium">{CUSTOMER_FIELD_LABELS[c.field]}</span>
              <span className="text-muted-foreground">
                {" "}— {c.fields.map((f) => f.label).join(" · ")} (last one wins)
              </span>
            </li>
          )),
        )}

        {renderList(
          "No value in submission (will stay blank)",
          "text-muted-foreground",
          issues.emptyMapped.map((e) => (
            <li key={e.id} className="text-xs">
              <span className="font-medium">{e.label}</span>
              <span className="text-muted-foreground"> → {e.target}</span>
            </li>
          )),
        )}

        {renderList(
          "Ignored (won't be imported)",
          "text-muted-foreground",
          issues.ignored.map((i) => (
            <li key={i.id} className="text-xs text-muted-foreground">
              {i.label}
            </li>
          )),
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
