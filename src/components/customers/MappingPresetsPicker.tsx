import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Layers, Save, Star, StarOff, Trash2, Loader2, GitCompare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ScriptMappingConfig } from "@/lib/scriptImport";
import { MappingPresetsDiffDialog } from "./MappingPresetsDiffDialog";

interface Preset {
  id: string;
  name: string;
  description: string | null;
  mapping: ScriptMappingConfig;
  form_template_id: string | null;
  is_default: boolean;
  updated_at: string;
}

interface Props {
  customerId: string;
  currentMapping: ScriptMappingConfig;
  formTemplateId?: string | null;
  onApply: (mapping: ScriptMappingConfig) => void;
}

export function MappingPresetsPicker({
  customerId,
  currentMapping,
  formTemplateId,
  onApply,
}: Props) {
  const { toast } = useToast();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveDefault, setSaveDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("customer_mapping_presets" as any)
      .select("id,name,description,mapping,form_template_id,is_default,updated_at")
      .eq("customer_id", customerId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: "Failed to load layouts", description: error.message, variant: "destructive" });
      return;
    }
    setPresets((data || []) as unknown as Preset[]);
  }, [customerId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApply = (id: string) => {
    setSelectedId(id);
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    onApply(p.mapping);
    toast({ title: "Layout applied", description: p.name });
  };

  const handleSave = async () => {
    if (!saveName.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("customer_mapping_presets" as any).insert({
      customer_id: customerId,
      name: saveName.trim(),
      description: saveDescription.trim() || null,
      mapping: currentMapping as any,
      form_template_id: formTemplateId ?? null,
      is_default: saveDefault,
      created_by: auth.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Layout saved", description: saveName });
    setSaveOpen(false);
    setSaveName("");
    setSaveDescription("");
    setSaveDefault(false);
    load();
  };

  const handleSetDefault = async (id: string, next: boolean) => {
    const { error } = await supabase
      .from("customer_mapping_presets" as any)
      .update({ is_default: next })
      .eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from("customer_mapping_presets" as any)
      .delete()
      .eq("id", deleteId);
    setDeleteId(null);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Layout deleted" });
    if (selectedId === deleteId) setSelectedId("");
    load();
  };

  const selected = presets.find((p) => p.id === selectedId);

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Layers className="h-4 w-4 text-primary" />
          Saved layouts
          <span className="text-xs text-muted-foreground">
            ({presets.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCompareOpen(true)}
            disabled={presets.length < 1}
            title="Compare two saved layouts"
          >
            <GitCompare className="h-3.5 w-3.5 mr-1" />
            Compare
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSaveOpen(true)}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Save current
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select value={selectedId} onValueChange={handleApply}>
          <SelectTrigger className="h-9 flex-1">
            <SelectValue
              placeholder={
                loading
                  ? "Loading…"
                  : presets.length
                  ? "Choose a saved layout to apply…"
                  : "No saved layouts yet"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex items-center gap-2">
                  {p.is_default && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                  {p.name}
                  {p.description && (
                    <span className="text-muted-foreground text-xs">— {p.description}</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              title={selected.is_default ? "Unset default" : "Set as default"}
              onClick={() => handleSetDefault(selected.id, !selected.is_default)}
            >
              {selected.is_default ? (
                <StarOff className="h-4 w-4" />
              ) : (
                <Star className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              title="Delete layout"
              onClick={() => setDeleteId(selected.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Save the current field mapping as a named layout, then reuse it for future imports of the same document type.
      </p>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save layout mapping</DialogTitle>
            <DialogDescription>
              Store the current field mapping so you can reapply it to future imports.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="preset-name">Layout name</Label>
              <Input
                id="preset-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Onboarding form v2"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="preset-desc">Description (optional)</Label>
              <Textarea
                id="preset-desc"
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="Notes about when to use this layout…"
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={saveDefault}
                onCheckedChange={(v) => setSaveDefault(Boolean(v))}
              />
              Make this the default layout for this customer
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this layout?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved mapping. Existing imports are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MappingPresetsDiffDialog
        customerId={customerId}
        open={compareOpen}
        onOpenChange={setCompareOpen}
        currentMapping={currentMapping}
        initialLeftId={selectedId || undefined}
        onApply={(m) => onApply(m)}
      />
    </div>
  );
}
