import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { formatDisplayName } from "@/lib/nameUtils";

interface Candidate {
  user_id: string;
  name: string;
}

interface ChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "manage";
  roomId?: string;
  initialName?: string;
  onCreate?: (name: string, memberIds: string[]) => Promise<void>;
  onSaveMembers?: (memberIds: string[]) => Promise<void>;
}

export function ChannelDialog({
  open,
  onOpenChange,
  mode,
  roomId,
  initialName = "",
  onCreate,
  onSaveMembers,
}: ChannelDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState(initialName);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setSearch("");

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Load all eligible users
        const { data: users, error } = await supabase.rpc("get_active_users_for_admin");
        if (error) throw error;
        const mapped: Candidate[] = (users || [])
          .filter((u: any) => u.user_id)
          .map((u: any) => ({ user_id: u.user_id, name: u.name }));

        // Preselect existing members (manage mode)
        let initialSelected = new Set<string>();
        if (mode === "manage" && roomId) {
          const { data: members } = await supabase.rpc("get_channel_members" as any, { p_room_id: roomId });
          initialSelected = new Set<string>(((members as any[]) || []).map((m) => m.user_id));
        }
        if (cancelled) return;
        setCandidates(mapped);
        setSelected(initialSelected);
      } catch (e) {
        console.error("Failed to load users", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, roomId, initialName]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(q));
  }, [candidates, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const ids = Array.from(selected).filter((id) => id !== user?.id);
      if (mode === "create" && onCreate) {
        if (!name.trim()) return;
        await onCreate(name.trim(), ids);
      } else if (mode === "manage" && onSaveMembers) {
        // include creator (current selection) — server keeps creator anyway
        await onSaveMembers(Array.from(selected));
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            {mode === "create" ? "New Channel" : "Manage Members"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="channel-name">Channel name</Label>
              <Input
                id="channel-name"
                placeholder="e.g. Typing Channel"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Assigned members</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="border rounded-md">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ScrollArea className="h-64">
                  <div className="p-1">
                    {filtered.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground py-6">
                        No users found
                      </div>
                    ) : (
                      filtered.map((c) => (
                        <label
                          key={c.user_id}
                          className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent cursor-pointer"
                        >
                          <Checkbox
                            checked={selected.has(c.user_id)}
                            onCheckedChange={() => toggle(c.user_id)}
                          />
                          <span className="text-sm">{formatDisplayName(c.name)}</span>
                        </label>
                      ))
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {selected.size} selected. Only assigned members can see this channel or its messages.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || loading || (mode === "create" && !name.trim())}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {mode === "create" ? "Create channel" : "Save members"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
