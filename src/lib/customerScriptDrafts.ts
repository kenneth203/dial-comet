import type { Customer } from "@/context/CustomersContext";

export type CustomerScriptDraft = {
  script: string;
  scriptTags: Customer["scriptTags"];
  savedAt: number;
  customerName?: string;
};

const getCustomerScriptDraftKey = (customerId?: string | null) =>
  customerId ? `script-draft:${customerId}` : null;

const normaliseTags = (tags?: Customer["scriptTags"] | null): Customer["scriptTags"] =>
  Array.isArray(tags) ? tags : [];

export const scriptDraftDiffers = (
  draft: Pick<CustomerScriptDraft, "script" | "scriptTags">,
  currentScript?: string | null,
  currentTags?: Customer["scriptTags"] | null,
) => {
  return (
    (draft.script || "") !== (currentScript || "") ||
    JSON.stringify(normaliseTags(draft.scriptTags)) !== JSON.stringify(normaliseTags(currentTags))
  );
};

export const loadCustomerScriptDraft = (customerId?: string | null): CustomerScriptDraft | null => {
  if (typeof window === "undefined") return null;
  const key = getCustomerScriptDraftKey(customerId);
  if (!key) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.script !== "string") return null;

    return {
      script: parsed.script,
      scriptTags: normaliseTags(Array.isArray(parsed?.scriptTags) ? parsed.scriptTags : parsed?.tags),
      savedAt: typeof parsed?.savedAt === "number"
        ? parsed.savedAt
        : typeof parsed?.at === "number"
          ? parsed.at
          : Date.now(),
      customerName: typeof parsed?.customerName === "string" ? parsed.customerName : undefined,
    };
  } catch {
    return null;
  }
};

export const saveCustomerScriptDraft = (
  customerId: string | undefined | null,
  script: string,
  scriptTags: Customer["scriptTags"] | undefined,
  customerName?: string,
) => {
  if (typeof window === "undefined") return;
  const key = getCustomerScriptDraftKey(customerId);
  if (!key) return;

  const savedAt = Date.now();
  const tags = normaliseTags(scriptTags);
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ script, scriptTags: tags, tags, savedAt, at: savedAt, customerName }),
    );
  } catch {
    // Local draft recovery is best-effort only.
  }
};

export const clearCustomerScriptDraft = (customerId?: string | null) => {
  if (typeof window === "undefined") return;
  const key = getCustomerScriptDraftKey(customerId);
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
};

export const formatCustomerScriptDraftTime = (savedAt: number) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(savedAt));