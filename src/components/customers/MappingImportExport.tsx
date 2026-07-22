import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ScriptMappingConfig, FieldTarget, ScriptSection } from "@/lib/scriptImport";

const FILE_TYPE = "lovable.script-field-mapping";
const FILE_VERSION = 1;

function isValidTarget(t: any): t is FieldTarget {
  if (!t || typeof t !== "object" || typeof t.kind !== "string") return false;
  switch (t.kind) {
    case "ignore":
      return true;
    case "script_section":
      return typeof t.sectionId === "string";
    case "quick_ref":
      return t.label === undefined || typeof t.label === "string";
    case "customer_field":
      return typeof t.field === "string";
    default:
      return false;
  }
}

function isValidMapping(m: any): m is ScriptMappingConfig {
  if (!m || typeof m !== "object") return false;
  if (!Array.isArray(m.sections)) return false;
  if (!m.fields || typeof m.fields !== "object") return false;
  for (const s of m.sections as ScriptSection[]) {
    if (!s || typeof s.id !== "string" || typeof s.title !== "string") return false;
  }
  for (const [, v] of Object.entries(m.fields)) {
    if (!isValidTarget(v)) return false;
  }
  return true;
}

function sanitizeFilename(s: string) {
  return (s || "customer").replace(/[^a-z0-9\-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "customer";
}

interface Props {
  currentMapping: ScriptMappingConfig | null;
  customerName?: string;
  onImport: (mapping: ScriptMappingConfig) => void;
}

export function MappingImportExport({ currentMapping, customerName, onImport }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    if (!currentMapping) {
      toast({ title: "No mapping to export", variant: "destructive" });
      return;
    }
    const payload = {
      type: FILE_TYPE,
      version: FILE_VERSION,
      exportedAt: new Date().toISOString(),
      customerName: customerName || null,
      mapping: currentMapping,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mapping-${sanitizeFilename(customerName || "customer")}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "Mapping exported" });
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // Accept either full envelope or a bare mapping
      const mapping = parsed?.mapping ?? parsed;
      if (parsed?.type && parsed.type !== FILE_TYPE) {
        toast({
          title: "Unrecognized file",
          description: `Expected a ${FILE_TYPE} export.`,
          variant: "destructive",
        });
        return;
      }
      if (!isValidMapping(mapping)) {
        toast({
          title: "Invalid mapping file",
          description: "The file does not contain a valid mapping structure.",
          variant: "destructive",
        });
        return;
      }
      onImport(mapping as ScriptMappingConfig);
      toast({
        title: "Mapping imported",
        description: parsed?.customerName
          ? `From "${parsed.customerName}". Review before saving.`
          : "Review the imported mapping before saving.",
      });
    } catch (e: any) {
      toast({
        title: "Import failed",
        description: e?.message || "Could not read file",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <Button type="button" size="sm" variant="outline" onClick={handleExport}>
        <Download className="h-3.5 w-3.5 mr-1" />
        Export JSON
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5 mr-1" />
        Import JSON
      </Button>
    </div>
  );
}
