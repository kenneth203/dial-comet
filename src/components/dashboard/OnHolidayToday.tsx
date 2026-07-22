import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plane, Thermometer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";


interface HolidayUser {
  request_id: string;
  name: string;
  absence_type: string;
  start_date: string;
  end_date: string;
  is_unpaid?: boolean;
}

const formatType = (t: string) => {
  if (!t) return "Holiday";
  return t
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function OnHolidayToday() {
  const [users, setUsers] = useState<HolidayUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc("get_users_on_holiday_today");
      if (cancelled) return;
      if (!error && Array.isArray(data)) {
        setUsers(data as HolidayUser[]);
      }
      setLoading(false);
    };
    void load();

    const channel = supabase
      .channel(`on-holiday-today-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "holiday_requests" },
        () => { void load(); }
      )
      .subscribe();

    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const poll = window.setInterval(() => void load(), 60000);

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(poll);
    };
  }, []);

  const sickUsers = users.filter((u) => u.absence_type === "sick_leave");
  const holidayUsers = users.filter((u) => u.absence_type !== "sick_leave");

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="w-4 h-4 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (users.length === 0) return null;

  return (
    <div className="space-y-3">
      {holidayUsers.length > 0 && (
        <div className="rounded-md border border-border bg-[hsl(var(--primary)/0.06)] px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Plane className="w-4 h-4 text-[hsl(var(--primary))]" />
            <h3 className="text-sm font-semibold text-foreground">On Holiday Today</h3>
          </div>
          <ul className="space-y-1.5">
            {holidayUsers.map((u) => (
              <li key={u.request_id} className="text-sm text-foreground">
                <span className="font-semibold">{u.name}</span>
                <span className="text-muted-foreground">
                  {" "}is on {formatType(u.absence_type)} until{" "}
                  {format(parseISO(u.end_date), "dd/MM/yyyy")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sickUsers.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="w-4 h-4 text-destructive" />
            <h3 className="text-sm font-semibold text-foreground">Off Sick Today</h3>
          </div>
          <ul className="space-y-1.5">
            {sickUsers.map((u) => (
              <li key={u.request_id} className="text-sm text-foreground">
                <span className="font-semibold">{u.name}</span>
                <span className="text-muted-foreground">
                  {u.start_date === u.end_date
                    ? " is off sick today"
                    : ` is off sick until ${format(parseISO(u.end_date), "dd/MM/yyyy")}`}
                </span>
                {u.is_unpaid && (
                  <Badge variant="destructive" className="ml-2 align-middle">
                    Unpaid
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
