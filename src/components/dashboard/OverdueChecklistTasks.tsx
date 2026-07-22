import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

interface OverdueItem {
  id: string;
  title: string;
  task_date: string;
  due_time: string | null;
  priority: string;
}

const formatDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

export default function OverdueChecklistTasks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<OverdueItem[]>([]);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("checklist_instances")
      .select("id,title,task_date,due_time,priority")
      .eq("user_id", user.id)
      .eq("status", "overdue")
      .order("task_date", { ascending: false })
      .limit(20);
    setItems((data as OverdueItem[]) || []);
  }, [user]);

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel(`overdue_checklist_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "checklist_instances", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  if (items.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        aria-expanded={expanded}
      >
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="text-sm font-semibold text-destructive">
          Overdue Daily Checklist
        </span>
        <Badge variant="destructive" className="ml-1 text-[10px]">
          {items.length}
        </Badge>
        <span className="ml-auto">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-destructive" />
          ) : (
            <ChevronDown className="h-4 w-4 text-destructive" />
          )}
        </span>
      </button>

      {expanded && (
        <ul className="px-3 pb-2 space-y-1">
          {(() => {
            const groups = new Map<string, OverdueItem[]>();
            const order: string[] = [];
            items.forEach((it) => {
              const key = it.title.includes(" - ") ? it.title.split(" - ")[0].trim() : it.title;
              if (!groups.has(key)) { groups.set(key, []); order.push(key); }
              groups.get(key)!.push(it);
            });
            return order.map((name) => {
              const groupItems = groups.get(name)!;
              if (groupItems.length === 1) {
                const it = groupItems[0];
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => navigate("/todo")}
                      className="w-full flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-destructive/10 text-left"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive flex-shrink-0" />
                      <span className="font-medium text-foreground truncate flex-1">{it.title}</span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {formatDate(it.task_date)}
                        {it.due_time ? ` · ${it.due_time.slice(0, 5)}` : ""}
                      </span>
                    </button>
                  </li>
                );
              }
              return <OverdueGroup key={name} groupName={name} groupItems={groupItems} onOpen={() => navigate("/todo")} />;
            });
          })()}
        </ul>
      )}
    </div>
  );
}

function OverdueGroup({
  groupName,
  groupItems,
  onOpen,
}: {
  groupName: string;
  groupItems: OverdueItem[];
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-destructive/10 text-left"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-destructive flex-shrink-0" />
        <span className="font-medium text-foreground truncate flex-1">{groupName}</span>
        <Badge variant="destructive" className="text-[10px]">{groupItems.length}</Badge>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-destructive" />
        )}
      </button>
      {open && (
        <ul className="pl-4 mt-1 space-y-1 border-l border-destructive/30 ml-2">
          {groupItems.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={onOpen}
                className="w-full flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-destructive/10 text-left"
              >
                <span className="text-foreground truncate flex-1">{it.title}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {formatDate(it.task_date)}
                  {it.due_time ? ` · ${it.due_time.slice(0, 5)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
