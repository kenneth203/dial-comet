import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

export type Client = { id: string; name: string };

type NewsItem = {
  id: string;
  title: string;
  clientId: string;
  description: string;
  date: string; // ISO
  validUntil: string; // ISO
  createdAt: string; // ISO
  category: string;
  userId: string;
};

const NEWS_CATEGORIES = [
  "Customer Update",
  "Important News", 
  "New Customers"
] as const;

const CATEGORY_ORDER: string[] = ["Customer Update", "Important News", "New Customers"];

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export default function NewsFeed({ clients, id, showForm = true, showExpired = true, limit, heading, showActions = true, showManageLink = true, autoScroll = false, autoScrollVisibleCount = 3, autoScrollIntervalMs = 3500 }: { clients: Client[]; id?: string; showForm?: boolean; showExpired?: boolean; limit?: number; heading?: string; showActions?: boolean; showManageLink?: boolean; autoScroll?: boolean; autoScrollVisibleCount?: number; autoScrollIntervalMs?: number }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  
  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(NEWS_CATEGORIES[0]);
  const [isInternal, setIsInternal] = useState<boolean>(false);
  const [dateLocal, setDateLocal] = useState<string>(toLocalInputValue(new Date()));
  const [validUntilLocal, setValidUntilLocal] = useState<string>(
    toLocalInputValue(new Date(Date.now() + 1000 * 60 * 60 * 24)) // +24h
  );

  // Load news items from Supabase
  useEffect(() => {
    if (!user) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    loadNewsItems();
    
    // Set up real-time subscription for news updates
    const channel = supabase
      .channel('news-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'news_items'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newItem: NewsItem = {
              id: payload.new.id,
              title: payload.new.title,
              clientId: payload.new.client_id,
              description: payload.new.description || '',
              date: payload.new.date,
              validUntil: payload.new.valid_until,
              createdAt: payload.new.created_at_iso,
              category: payload.new.category,
              userId: payload.new.user_id,
            };
            setItems(prev => [newItem, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setItems(prev => prev.map(item => 
              item.id === payload.new.id 
                ? {
                    ...item,
                    title: payload.new.title,
                    clientId: payload.new.client_id,
                    description: payload.new.description || '',
                    date: payload.new.date,
                    validUntil: payload.new.valid_until,
                    category: payload.new.category,
                    userId: payload.new.user_id,
                  }
                : item
            ));
          } else if (payload.eventType === 'DELETE') {
            setItems(prev => prev.filter(item => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadNewsItems = async () => {
    try {
      const { data, error } = await supabase
        .from('news_items')
        .select('*')
        .order('created_at_iso', { ascending: false });

      if (error) {
        console.error('Error loading news items:', error);
        return;
      }

      const mappedItems: NewsItem[] = (data || [])
        .filter(row => row.category !== 'status_update')
        .map(row => ({
          id: row.id,
          title: row.title,
          clientId: row.client_id,
          description: row.description || '',
          date: row.date,
          validUntil: row.valid_until,
          createdAt: row.created_at_iso,
          category: row.category,
          userId: row.user_id,
        }));

      setItems(mappedItems);
    } catch (error) {
      console.error('Error loading news items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Dashboard filters removed as per request

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        // Primary sort by created_at_iso (newest first)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [items]
  );

  // Group items by category
  const groupedItems = useMemo(() => {
    const filtered = showExpired ? sortedItems : sortedItems.filter((it) => new Date(it.validUntil).getTime() >= Date.now());
    const groups: Record<string, NewsItem[]> = {};
    
    filtered.forEach(item => {
      const itemCategory = item.category || "Other";
      if (!groups[itemCategory]) {
        groups[itemCategory] = [];
      }
      groups[itemCategory].push(item);
    });
    
    return groups;
  }, [sortedItems, showExpired]);

  const displayGroups = useMemo(() => {
    if (autoScroll) return groupedItems; // show all groups when auto-scrolling
    if (typeof limit === "number") {
      // Apply limit across all categories
      const flatItems = Object.values(groupedItems).flat();
      const limitedItems = flatItems.slice(0, limit);
      const newGroups: Record<string, NewsItem[]> = {};
      limitedItems.forEach(item => {
        const itemCategory = item.category || "Other";
        if (!newGroups[itemCategory]) {
          newGroups[itemCategory] = [];
        }
        newGroups[itemCategory].push(item);
      });
      return newGroups;
    }
    return groupedItems;
  }, [groupedItems, autoScroll, limit]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setClientId(clients[0]?.id ?? "");
    setDescription("");
    setCategory(NEWS_CATEGORIES[0]);
    setIsInternal(false);
    setDateLocal(toLocalInputValue(new Date()));
    setValidUntilLocal(toLocalInputValue(new Date(Date.now() + 1000 * 60 * 60 * 24)));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || (!isInternal && !clientId) || !dateLocal || !validUntilLocal || !category || !user) return;

    const nowISO = new Date().toISOString();
    const payload = {
      title: title.trim(),
      client_id: isInternal ? "" : clientId,
      description: description.trim(),
      date: new Date(dateLocal).toISOString(),
      valid_until: new Date(validUntilLocal).toISOString(),
      category,
      created_at_iso: nowISO,
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from('news_items')
          .update(payload)
          .eq('id', editingId);

        if (error) {
          console.error('Error updating news item:', error);
          return;
        }

        setItems((prev) => prev.map((it) => (it.id === editingId ? { 
          ...it, 
          title: payload.title,
          clientId: payload.client_id,
          description: payload.description,
          date: payload.date,
          validUntil: payload.valid_until,
          category: payload.category,
        } : it)));
      } else {
        const { data, error } = await supabase
          .from('news_items')
          .insert({
            user_id: user.id,
            ...payload,
          })
          .select()
          .single();

        if (error) {
          console.error('Error adding news item:', error);
          return;
        }

        // Item will be added via the realtime subscription — no manual state update needed
      }

      resetForm();
    } catch (error) {
      console.error('Error saving news item:', error);
    }
  };

  const onEdit = (id: string) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    setEditingId(id);
    setTitle(it.title);
    setClientId(it.clientId || clients[0]?.id || "");
    setDescription(it.description);
    setCategory(it.category || NEWS_CATEGORIES[0]);
    setIsInternal(!it.clientId);
    setDateLocal(toLocalInputValue(new Date(it.date)));
    setValidUntilLocal(toLocalInputValue(new Date(it.validUntil)));
  };

  const onDelete = async (id: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('news_items')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting news item:', error);
        return;
      }

      setItems((prev) => prev.filter((i) => i.id !== id));
      if (editingId === id) resetForm();
    } catch (error) {
      console.error('Error deleting news item:', error);
    }
  };

  const isExpired = (it: NewsItem) => new Date(it.validUntil).getTime() < Date.now();
  const clientName = (id: string) => id ? (clients.find((c) => c.id === id)?.name ?? id) : "Internal";

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Auto-scroll logic for dashboard ticker
  useEffect(() => {
    if (!autoScroll) return;
    const container = listRef.current;
    if (!container) return;

    const children = Array.from(container.children) as HTMLElement[];
    if (children.length <= autoScrollVisibleCount) return;

    const cutoff = Math.min(autoScrollVisibleCount, children.length) - 1;
    const newHeight = children[cutoff].offsetTop + children[cutoff].offsetHeight;
    setContainerHeight(newHeight);

    let idx = 0;
    const maxIdx = children.length - autoScrollVisibleCount;
    const interval = window.setInterval(() => {
      idx = idx < maxIdx ? idx + 1 : 0;
      const target = children[idx];
      if (target) {
        container.scrollTo({ top: target.offsetTop, behavior: "smooth" });
      }
    }, autoScrollIntervalMs);

    return () => clearInterval(interval);
  }, [autoScroll, displayGroups, autoScrollVisibleCount, autoScrollIntervalMs]);

  // Ensure list starts at top when not auto-scrolling
  useEffect(() => {
    if (autoScroll) return;
    const container = listRef.current;
    if (container) container.scrollTop = 0;
  }, [displayGroups, autoScroll]);

  if (isLoading) {
    return (
      <Card className={id ? "h-full" : ""}>
        <CardHeader>
          <CardTitle>{heading || "Company Announcements"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id={id}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{heading || "Company Announcements"}</CardTitle>
          {!showForm && showManageLink && (
            <Link to="/news" className="text-sm text-primary hover:underline">Manage</Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="news-title">Title</Label>
              <Input id="news-title" placeholder="e.g. System maintenance" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {NEWS_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Customer</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="internal-news"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="internal-news" className="text-sm font-normal">
                    Internal news (no customer)
                  </Label>
                </div>
                {!isInternal && (
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="news-date">Date</Label>
              <Input id="news-date" type="datetime-local" value={dateLocal} onChange={(e) => setDateLocal(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="news-until">Valid until</Label>
              <Input id="news-until" type="datetime-local" value={validUntilLocal} onChange={(e) => setValidUntilLocal(e.target.value)} />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="news-desc">Description</Label>
              <Textarea id="news-desc" placeholder="Details, links, instructions..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <Button type="submit">{editingId ? "Update" : "Create"}</Button>
              {editingId && (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}

        {/* List grouped by category */}
        <div
          className="space-y-4"
          ref={listRef}
          style={autoScroll && Object.values(displayGroups).flat().length > autoScrollVisibleCount && containerHeight ? { maxHeight: containerHeight, overflowY: "auto" } : undefined}
        >
          {Object.keys(displayGroups).length === 0 ? (
            <p className="text-sm text-muted-foreground">No announcements yet. {showForm ? "Create your first announcement above." : "Go to the Company Announcements page to create one."}</p>
          ) : (
            [...Object.entries(displayGroups)].sort(([a], [b]) => {
              const ai = CATEGORY_ORDER.indexOf(a);
              const bi = CATEGORY_ORDER.indexOf(b);
              return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
            }).map(([categoryName, categoryItems]) => (
              <div key={categoryName} className="space-y-2">
                  <h3 className="font-semibold text-sm border-b border-border/50 pb-1 text-primary">
                    {categoryName}
                  </h3>
                <div className="space-y-2">
                  {categoryItems.map((it) => (
                    <div key={it.id} className="flex items-start justify-between border-b last:border-0 pb-2">
                      <div
                        className="flex-1 pr-3 cursor-pointer rounded-md transition-colors hover:bg-muted/50 p-1 -m-1"
                        onClick={() => toggleExpanded(it.id)}
                        role="button"
                        aria-expanded={expanded.has(it.id)}
                        aria-label={`${expanded.has(it.id) ? "Collapse" : "Expand"} ${it.title}`}
                      >
                        <div className="flex items-center gap-2">
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200",
                              expanded.has(it.id) && "rotate-180"
                            )}
                          />
                          <p className="font-medium text-sm">{it.title}</p>
                          {isExpired(it) ? (
                            <Badge variant="secondary">Expired</Badge>
                          ) : (
                            <Badge>Active</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(it.date).toLocaleString()} • {clientName(it.clientId)}
                        </p>
                        {expanded.has(it.id) && (
                          <>
                            {it.description && (
                              <p className="mt-2 text-xs whitespace-pre-wrap">{it.description}</p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                              Valid until: {new Date(it.validUntil).toLocaleString()}
                            </p>
                          </>
                        )}
                      </div>
                      {showActions && (
                        <div className="flex-shrink-0 space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(it.id);
                            }}
                            aria-label={`Edit ${it.title}`}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(it.id);
                            }}
                            aria-label={`Delete ${it.title}`}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

