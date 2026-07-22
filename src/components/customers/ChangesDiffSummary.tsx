import { useMemo } from "react";
import { CUSTOMER_FIELD_LABELS, type CustomerFieldKey } from "@/lib/scriptImport";
import type { Customer } from "@/context/CustomersContext";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Plus, Minus, Pencil, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuickRefRow {
  label: string;
  value: string;
}

interface Props {
  customer: Customer | null;
  pendingCustomerUpdates: Partial<Record<CustomerFieldKey, string>>;
  initialQuickRows: QuickRefRow[];
  currentQuickRows: QuickRefRow[];
}

function customerCurrentValue(customer: Customer | null, key: CustomerFieldKey): string {
  if (!customer) return "";
  const c: any = customer;
  switch (key) {
    case "name":
      return c.name || c.company_name || "";
    case "email":
      return c.email || "";
    case "phone":
      return c.phone || c.telephone || "";
    case "website":
      return c.website || "";
    case "address_line1":
      return c.address_line1 || c.address || "";
    case "address_line2":
      return c.address_line2 || "";
    case "city":
      return c.city || "";
    case "postcode":
      return c.postcode || "";
    default:
      return "";
  }
}

type ChangeType = "add" | "change" | "remove" | "unchanged";

function classifyCustomer(
  before: string,
  after: string | undefined,
): ChangeType {
  const b = (before ?? "").trim();
  const a = after === undefined ? undefined : (after ?? "").trim();
  if (a === undefined) return "unchanged"; // not staged
  if (!b && a) return "add";
  if (b && !a) return "remove";
  if (b && a && b !== a) return "change";
  return "unchanged";
}

function rowKey(r: QuickRefRow) {
  return `${r.label.trim().toLowerCase()}::${r.value.trim()}`;
}

export function ChangesDiffSummary({
  customer,
  pendingCustomerUpdates,
  initialQuickRows,
  currentQuickRows,
}: Props) {
  const customerRows = useMemo(() => {
    const keys = Object.keys(CUSTOMER_FIELD_LABELS) as CustomerFieldKey[];
    return keys
      .map((k) => {
        const before = customerCurrentValue(customer, k);
        const staged = pendingCustomerUpdates[k];
        const change = classifyCustomer(before, staged);
        return { key: k, before, after: staged ?? before, change };
      })
      .filter((r) => r.change !== "unchanged");
  }, [customer, pendingCustomerUpdates]);

  const quickDiff = useMemo(() => {
    const before = new Map<string, QuickRefRow>();
    initialQuickRows.forEach((r) => before.set(rowKey(r), r));
    const after = new Map<string, QuickRefRow>();
    currentQuickRows.forEach((r) => after.set(rowKey(r), r));

    // Also match by label (case-insensitive) for label-preserving edits.
    const beforeByLabel = new Map<string, QuickRefRow>();
    initialQuickRows.forEach((r) => {
      const k = r.label.trim().toLowerCase();
      if (k) beforeByLabel.set(k, r);
    });
    const afterByLabel = new Map<string, QuickRefRow>();
    currentQuickRows.forEach((r) => {
      const k = r.label.trim().toLowerCase();
      if (k) afterByLabel.set(k, r);
    });

    const added: QuickRefRow[] = [];
    const removed: QuickRefRow[] = [];
    const changed: Array<{ label: string; before: string; after: string }> = [];

    // Detect removed (present before, absent after by label OR exact)
    for (const r of initialQuickRows) {
      const lbl = r.label.trim().toLowerCase();
      const stillByLabel = lbl ? afterByLabel.get(lbl) : undefined;
      if (!stillByLabel) {
        // completely gone (label removed)
        if (!after.has(rowKey(r))) removed.push(r);
      }
    }
    // Detect added (new labels)
    for (const r of currentQuickRows) {
      const lbl = r.label.trim().toLowerCase();
      const wasBefore = lbl ? beforeByLabel.get(lbl) : undefined;
      if (!wasBefore) {
        if (!before.has(rowKey(r))) added.push(r);
      }
    }
    // Detect changed (same label, different value)
    for (const [lbl, b] of beforeByLabel.entries()) {
      const a = afterByLabel.get(lbl);
      if (a && a.value.trim() !== b.value.trim()) {
        changed.push({ label: b.label, before: b.value, after: a.value });
      }
    }
    return { added, removed, changed };
  }, [initialQuickRows, currentQuickRows]);

  const totalChanges =
    customerRows.length +
    quickDiff.added.length +
    quickDiff.removed.length +
    quickDiff.changed.length;

  return (
    <div className="rounded-md border bg-background/60 p-2 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-medium">Change summary</div>
        {totalChanges === 0 ? (
          <Badge variant="secondary" className="gap-1">
            <Check className="h-3 w-3" /> No changes
          </Badge>
        ) : (
          <Badge className="gap-1">
            {totalChanges} change{totalChanges === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {/* Customer fields */}
      <div className="space-y-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Customer details
        </div>
        {customerRows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No customer field changes staged.
          </p>
        ) : (
          <ul className="space-y-1">
            {customerRows.map((r) => (
              <li
                key={r.key}
                className="grid grid-cols-12 gap-1 items-start rounded border bg-muted/40 p-1.5"
              >
                <div className="col-span-3 font-medium truncate">
                  {CUSTOMER_FIELD_LABELS[r.key]}
                </div>
                <div className="col-span-8 flex items-start gap-1 min-w-0">
                  <span
                    className={cn(
                      "flex-1 min-w-0 rounded px-1.5 py-0.5 line-clamp-2 break-words",
                      r.change === "add"
                        ? "text-muted-foreground italic"
                        : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 line-through",
                    )}
                    title={r.before || "(empty)"}
                  >
                    {r.before || <span className="italic">empty</span>}
                  </span>
                  <ArrowRight className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                  <span
                    className={cn(
                      "flex-1 min-w-0 rounded px-1.5 py-0.5 line-clamp-2 break-words",
                      r.change === "remove"
                        ? "text-muted-foreground italic"
                        : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 font-medium",
                    )}
                    title={
                      r.change === "remove" ? "(cleared)" : (pendingCustomerUpdates[r.key] || "")
                    }
                  >
                    {r.change === "remove" ? (
                      <span className="italic">cleared</span>
                    ) : (
                      pendingCustomerUpdates[r.key] || <span className="italic">empty</span>
                    )}
                  </span>
                </div>
                <div className="col-span-1 flex justify-end">
                  <ChangeBadge type={r.change} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick-ref rows */}
      <div className="space-y-1 border-t pt-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Quick-reference rows
        </div>
        {quickDiff.added.length + quickDiff.removed.length + quickDiff.changed.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No quick-reference row changes.
          </p>
        ) : (
          <ul className="space-y-1">
            {quickDiff.added.map((r, i) => (
              <li
                key={`add-${i}`}
                className="flex items-center gap-1.5 rounded border bg-emerald-50/60 dark:bg-emerald-950/20 p-1.5"
              >
                <ChangeBadge type="add" />
                <span className="font-medium min-w-[7rem] truncate">{r.label || "—"}</span>
                <span className="text-muted-foreground truncate">{r.value || "(empty)"}</span>
              </li>
            ))}
            {quickDiff.changed.map((r, i) => (
              <li
                key={`chg-${i}`}
                className="grid grid-cols-12 gap-1 items-start rounded border bg-muted/40 p-1.5"
              >
                <div className="col-span-3 font-medium truncate">{r.label}</div>
                <div className="col-span-8 flex items-start gap-1 min-w-0">
                  <span
                    className="flex-1 min-w-0 rounded bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 line-through px-1.5 py-0.5 line-clamp-2 break-words"
                    title={r.before}
                  >
                    {r.before || <span className="italic">empty</span>}
                  </span>
                  <ArrowRight className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                  <span
                    className="flex-1 min-w-0 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 font-medium px-1.5 py-0.5 line-clamp-2 break-words"
                    title={r.after}
                  >
                    {r.after || <span className="italic">empty</span>}
                  </span>
                </div>
                <div className="col-span-1 flex justify-end">
                  <ChangeBadge type="change" />
                </div>
              </li>
            ))}
            {quickDiff.removed.map((r, i) => (
              <li
                key={`rem-${i}`}
                className="flex items-center gap-1.5 rounded border bg-red-50/60 dark:bg-red-950/20 p-1.5"
              >
                <ChangeBadge type="remove" />
                <span className="font-medium min-w-[7rem] truncate line-through">
                  {r.label || "—"}
                </span>
                <span className="text-muted-foreground truncate line-through">
                  {r.value || "(empty)"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground pt-0.5">
        These are exactly the values that will be written when you click{" "}
        <strong>Apply to script</strong>.
      </p>
    </div>
  );
}

function ChangeBadge({ type }: { type: ChangeType }) {
  if (type === "add")
    return (
      <Badge variant="outline" className="gap-1 border-emerald-400 text-emerald-700">
        <Plus className="h-3 w-3" /> Add
      </Badge>
    );
  if (type === "change")
    return (
      <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700">
        <Pencil className="h-3 w-3" /> Edit
      </Badge>
    );
  if (type === "remove")
    return (
      <Badge variant="outline" className="gap-1 border-red-400 text-red-700">
        <Minus className="h-3 w-3" /> Remove
      </Badge>
    );
  return null;
}
