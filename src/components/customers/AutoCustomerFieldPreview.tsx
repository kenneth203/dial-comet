import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  CUSTOMER_FIELD_LABELS,
  inferCustomerFieldsFromText,
  type CustomerFieldKey,
  type DetectedCustomerField,
} from "@/lib/scriptImport";
import { isValidUkPostcode, normaliseUkPostcode } from "@/lib/ukPostcode";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  uncertainTerms: string[];
  currentUpdates: Partial<Record<CustomerFieldKey, string>>;
  onChangeUpdates: (
    updater: (
      prev: Partial<Record<CustomerFieldKey, string>>,
    ) => Partial<Record<CustomerFieldKey, string>>,
  ) => void;
}

// ---------- formatters ----------
function formatValue(field: CustomerFieldKey, raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  switch (field) {
    case "email":
      return v.toLowerCase();
    case "phone":
      // keep leading + then digits/spaces only, collapse whitespace
      return v.replace(/[^\d+\s]/g, "").replace(/\s+/g, " ").trim();
    case "postcode":
      return normaliseUkPostcode(v);
    case "website": {
      let w = v.replace(/\s+/g, "");
      if (w && !/^https?:\/\//i.test(w)) w = `https://${w}`;
      return w;
    }
    case "city":
    case "name":
      return v.replace(/\s+/g, " ");
    default:
      return v;
  }
}

// ---------- validators ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s]{7,20}$/;
const URL_RE = /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i;

function validateField(field: CustomerFieldKey, raw: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return "Value is required";
  switch (field) {
    case "email":
      return EMAIL_RE.test(v) ? null : "Not a valid email address";
    case "phone": {
      const digits = v.replace(/\D/g, "");
      if (!PHONE_RE.test(v)) return "Phone can only contain digits, spaces and a leading +";
      if (digits.length < 7 || digits.length > 15) return "Phone must have 7–15 digits";
      return null;
    }
    case "postcode":
      return isValidUkPostcode(v) ? null : "Not a valid UK postcode";
    case "website":
      return URL_RE.test(v) ? null : "Enter a full URL (https://…)";
    case "address_line1":
      return v.length >= 3 ? null : "Address line 1 is too short";
    case "city":
      return /^[A-Za-z][A-Za-z\s'-]{1,}$/.test(v) ? null : "Enter a valid city name";
    case "name":
      return v.length >= 2 ? null : "Name is too short";
    default:
      return null;
  }
}

// Address parts that must be present together if any is used.
const ADDRESS_KEYS: CustomerFieldKey[] = ["address_line1", "city", "postcode"];

export function AutoCustomerFieldPreview({
  text,
  uncertainTerms,
  currentUpdates,
  onChangeUpdates,
}: Props) {
  const detected = useMemo<DetectedCustomerField[]>(
    () => (text.trim() ? inferCustomerFieldsFromText(text, uncertainTerms) : []),
    [text, uncertainTerms],
  );

  const [edits, setEdits] = useState<Partial<Record<CustomerFieldKey, string>>>({});
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    const next: Partial<Record<CustomerFieldKey, string>> = {};
    for (const d of detected) next[d.field] = d.value;
    setEdits(next);
    setApplied(false);
  }, [detected]);

  const errors = useMemo(() => {
    const map: Partial<Record<CustomerFieldKey, string>> = {};
    for (const d of detected) {
      const v = edits[d.field] ?? d.value;
      const err = validateField(d.field, v);
      if (err) map[d.field] = err;
    }
    return map;
  }, [edits, detected]);

  // Address integrity: if any address part is staged, warn about missing required ones.
  const stagedAddressKeys = ADDRESS_KEYS.filter((k) => (currentUpdates[k] ?? "").trim() !== "");
  const missingAddressKeys =
    stagedAddressKeys.length > 0
      ? ADDRESS_KEYS.filter((k) => (currentUpdates[k] ?? "").trim() === "")
      : [];

  const hasAnyError = Object.keys(errors).length > 0;

  const applyOne = (field: CustomerFieldKey) => {
    const formatted = formatValue(field, edits[field] ?? "");
    setEdits((prev) => ({ ...prev, [field]: formatted }));
    if (validateField(field, formatted)) return; // block if invalid
    onChangeUpdates((prev) => {
      const next = { ...prev };
      if (formatted) next[field] = formatted;
      else delete next[field];
      return next;
    });
  };

  const applyAll = () => {
    // Format all first, then only apply the ones that pass validation.
    const formattedEdits: Partial<Record<CustomerFieldKey, string>> = {};
    for (const d of detected) {
      formattedEdits[d.field] = formatValue(d.field, edits[d.field] ?? d.value);
    }
    setEdits(formattedEdits);
    onChangeUpdates((prev) => {
      const next = { ...prev };
      for (const d of detected) {
        const v = formattedEdits[d.field] ?? "";
        if (!v) continue;
        if (validateField(d.field, v)) continue; // skip invalid
        next[d.field] = v;
      }
      return next;
    });
    setApplied(true);
  };

  const clearAll = () => {
    onChangeUpdates((prev) => {
      const next = { ...prev };
      for (const d of detected) delete next[d.field];
      return next;
    });
    setApplied(false);
  };

  if (!text.trim()) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          Auto-detected customer fields
          <span className="text-xs text-muted-foreground">
            ({detected.length} found)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {detected.length > 0 && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={applyAll}
                disabled={hasAnyError}
                title={hasAnyError ? "Fix invalid fields before applying" : undefined}
              >
                {applied ? "Re-apply valid" : "Apply all"}
              </Button>
            </>
          )}
        </div>
      </div>

      {detected.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No customer fields could be auto-detected from the extracted text.
        </p>
      ) : (
        <div className="space-y-2">
          {detected.map((d) => {
            const editedValue = edits[d.field] ?? d.value;
            const err = errors[d.field];
            const isStaged =
              currentUpdates[d.field] === editedValue && editedValue.trim() !== "";
            return (
              <div
                key={d.field}
                className="grid grid-cols-12 gap-2 items-start text-sm"
              >
                <div className="col-span-3 pt-2">
                  <div className="font-medium">{CUSTOMER_FIELD_LABELS[d.field]}</div>
                  <div className="text-xs text-muted-foreground truncate" title={d.label}>
                    from: {d.label}
                  </div>
                </div>
                <div className="col-span-6">
                  <Input
                    value={editedValue}
                    onChange={(e) =>
                      setEdits((prev) => ({ ...prev, [d.field]: e.target.value }))
                    }
                    onBlur={() =>
                      setEdits((prev) => ({
                        ...prev,
                        [d.field]: formatValue(d.field, prev[d.field] ?? ""),
                      }))
                    }
                    aria-invalid={!!err}
                    className={cn(
                      err
                        ? "border-destructive focus-visible:ring-destructive"
                        : d.confidence === "low"
                          ? "border-amber-400 focus-visible:ring-amber-400"
                          : "",
                    )}
                  />
                  {err ? (
                    <p className="mt-1 text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {err}
                    </p>
                  ) : editedValue.trim() ? (
                    <p className="mt-1 text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Looks valid
                    </p>
                  ) : null}
                </div>
                <div className="col-span-2 flex items-center gap-1 pt-2">
                  {d.confidence === "low" ? (
                    <Badge
                      variant="outline"
                      className="border-amber-400 text-amber-700 gap-1"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Low OCR
                    </Badge>
                  ) : (
                    <Badge variant="secondary">High</Badge>
                  )}
                </div>
                <div className="col-span-1 flex justify-end pt-2">
                  <label
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      err && "opacity-50 cursor-not-allowed",
                    )}
                    title={err ? "Fix the value before applying" : undefined}
                  >
                    <Checkbox
                      checked={isStaged}
                      disabled={!!err}
                      onCheckedChange={(v) => {
                        if (v) applyOne(d.field);
                        else
                          onChangeUpdates((prev) => {
                            const next = { ...prev };
                            delete next[d.field];
                            return next;
                          });
                      }}
                    />
                    use
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {missingAddressKeys.length > 0 && (
        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            You've staged part of an address but the following required part
            {missingAddressKeys.length > 1 ? "s are" : " is"} missing:{" "}
            <span className="font-medium">
              {missingAddressKeys.map((k) => CUSTOMER_FIELD_LABELS[k]).join(", ")}
            </span>
            . The customer address may not update correctly until all parts are present.
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Values are auto-formatted on blur (email lower-cased, postcode normalised, phone
        cleaned). Invalid values can't be applied — fix the highlighted fields first.
      </p>
    </div>
  );
}
