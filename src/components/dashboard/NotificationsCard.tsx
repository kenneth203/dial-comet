import { Bell, Phone, Calendar, FileText, MessageSquare, AtSign, CheckCircle2, Plane, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useTaskNotifications, type TaskNotification } from "@/hooks/useTaskNotifications";

type Style = {
  icon: typeof Bell;
  bg: string; // tailwind bg class
  fg: string; // icon color
  dot: string; // status dot color
};

function styleFor(n: TaskNotification): Style {
  const msg = (n.message || "").toLowerCase();
  const type = (n.type || "").toLowerCase();

  if (msg.includes("missed call") || msg.includes("call")) {
    return { icon: Phone, bg: "bg-brand-red", fg: "text-white", dot: "bg-brand-red" };
  }
  if (msg.includes("booking") || msg.includes("meeting") || msg.includes("calendar")) {
    return { icon: Calendar, bg: "bg-brand-navy", fg: "text-white", dot: "bg-brand-navy" };
  }
  if (msg.includes("holiday")) {
    return { icon: Plane, bg: "bg-brand-navy", fg: "text-white", dot: "bg-brand-navy" };
  }
  if (msg.includes("document") || msg.includes("file") || msg.includes("upload") || msg.includes("attachment")) {
    return { icon: FileText, bg: "bg-muted", fg: "text-foreground", dot: "bg-muted-foreground" };
  }
  if (type === "mention" || msg.includes("mention")) {
    return { icon: AtSign, bg: "bg-brand-navy", fg: "text-white", dot: "bg-brand-navy" };
  }
  if (msg.includes("invoice") || msg.includes("proposal")) {
    return { icon: FileText, bg: "bg-brand-navy", fg: "text-white", dot: "bg-brand-navy" };
  }
  if (msg.includes("complete") || msg.includes("done")) {
    return { icon: CheckCircle2, bg: "bg-brand-navy", fg: "text-white", dot: "bg-muted-foreground" };
  }
  return { icon: MessageSquare, bg: "bg-brand-navy", fg: "text-white", dot: "bg-brand-navy" };
}

function titleFor(n: TaskNotification): { title: string; subtitle: string; role?: string } {
  const m = n.message || "";

  // Extract requester role from "Holiday Approval Required [Role]: ..." pattern
  const roleMatch = m.match(/^Holiday Approval Required\s*\[([^\]]+)\]\s*:\s*(.*)$/i);
  if (roleMatch) {
    const role = roleMatch[1].trim();
    const rest = roleMatch[2].trim();
    const sep = rest.indexOf(" - ");
    if (sep > 0) {
      return { title: `Holiday Approval Required: ${rest.slice(0, sep).trim()}`, subtitle: rest.slice(sep + 3).trim(), role };
    }
    return { title: `Holiday Approval Required: ${rest}`, subtitle: "", role };
  }

  // split on ":" or " - " for title/subtitle split
  const sepIdx = m.indexOf(":");
  if (sepIdx > 0 && sepIdx < 60) {
    return { title: m.slice(0, sepIdx).trim(), subtitle: m.slice(sepIdx + 1).trim() };
  }
  const dashIdx = m.indexOf(" - ");
  if (dashIdx > 0) {
    return { title: m.slice(0, dashIdx).trim(), subtitle: m.slice(dashIdx + 3).trim() };
  }
  return { title: m, subtitle: "" };
}

function roleBadgeClasses(role: string): string {
  const r = role.toLowerCase();
  if (r === 'super-admin') return 'bg-brand-red/10 text-brand-red border-brand-red/20';
  if (r === 'admin') return 'bg-brand-navy/10 text-brand-navy border-brand-navy/20';
  if (r === 'supervisor') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (r === 'hr') return 'bg-purple-100 text-purple-800 border-purple-200';
  if (r === 'operator') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-muted text-foreground border-border';
}

export default function NotificationsCard() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useTaskNotifications();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'holiday'>('all');

  const isHoliday = (n: TaskNotification) =>
    (n.message || '').toLowerCase().includes('holiday') ||
    (n.type || '').toLowerCase().includes('holiday');

  const activeNotifications = notifications.filter(n => !n.is_read);
  const filtered = filter === 'holiday'
    ? activeNotifications.filter(isHoliday)
    : activeNotifications;

  const items = filtered.slice(0, 5);
  const hasUnread = unreadCount > 0;
  const holidayUnreadCount = activeNotifications.filter(isHoliday).length;
  const isApprovalRequired = (n: TaskNotification) =>
    (n.message || '').toLowerCase().includes('approval required') ||
    (n.type || '').toLowerCase() === 'holiday_approval';
  const approvalUnreadCount = activeNotifications.filter(isApprovalRequired).length;

  const handleClick = (n: TaskNotification) => {
    if (!n.is_read) markAsRead(n.id);
    const msg = (n.message || '').toLowerCase();
    if (msg.includes('holiday approval required')) navigate('/holidays/admin');
    else if (msg.includes('holiday')) navigate('/holidays');
    else if (msg.includes('invoice') || msg.includes('proposal')) navigate('/crm');
    else if (n.task_id) navigate(`/tasks?task=${n.task_id}`);
    else navigate('/tasks');
  };

  // Auto-mark as read on hover/focus dwell
  const hoverTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const dwellMarkRead = (n: TaskNotification) => {
    if (n.is_read || hoverTimers.current[n.id]) return;
    hoverTimers.current[n.id] = setTimeout(() => {
      markAsRead(n.id);
      delete hoverTimers.current[n.id];
    }, 600);
  };
  const cancelDwell = (id: string) => {
    if (hoverTimers.current[id]) {
      clearTimeout(hoverTimers.current[id]);
      delete hoverTimers.current[id];
    }
  };
  useEffect(() => () => {
    Object.values(hoverTimers.current).forEach(clearTimeout);
    hoverTimers.current = {};
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" strokeWidth={1.75} />
          <h3 className="text-base font-semibold text-foreground">Notifications</h3>
          {hasUnread && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-red text-white text-[10px] font-semibold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          {approvalUnreadCount > 0 && (
            <span
              className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-brand-red/10 text-brand-red border border-brand-red/20 text-[10px] font-semibold"
              title={`${approvalUnreadCount} approval${approvalUnreadCount === 1 ? '' : 's'} awaiting your action`}
            >
              {approvalUnreadCount} Approval{approvalUnreadCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setFilter(prev => (prev === 'holiday' ? 'all' : 'holiday'))}
            className={`inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-1 transition-colors ${
              filter === 'holiday'
                ? 'bg-brand-navy text-white'
                : 'text-brand-navy hover:bg-muted'
            }`}
            title="Filter by holiday notifications"
          >
            <Plane className="w-3.5 h-3.5" strokeWidth={2} />
            Holidays
            {holidayUnreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-brand-red text-white text-[9px] font-semibold">
                {holidayUnreadCount}
              </span>
            )}
          </button>
          {hasUnread && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-xs font-medium text-brand-navy hover:underline"
            >
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className="text-sm font-medium text-brand-navy hover:underline"
          >
            View All
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {filter === 'holiday' ? 'No holiday notifications' : 'No notifications'}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => {
            const s = styleFor(n);
            const Icon = s.icon;
            const { title, subtitle, role } = titleFor(n);
            const isApproval = isApprovalRequired(n);
            return (
              <li key={n.id} className="relative group">
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  onMouseEnter={() => dwellMarkRead(n)}
                  onMouseLeave={() => cancelDwell(n.id)}
                  onFocus={() => dwellMarkRead(n)}
                  onBlur={() => cancelDwell(n.id)}
                  className="w-full flex items-center gap-3 text-left hover:bg-muted/40 rounded-md p-1 -m-1 transition-colors"
                >
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${s.bg}`}>
                    <Icon className={`w-5 h-5 ${s.fg}`} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isApproval && (
                        <span className="inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold uppercase tracking-wide bg-brand-red text-white flex-shrink-0">
                          Action
                        </span>
                      )}
                      {role && (
                        <span
                          className={`inline-flex items-center h-4 px-1.5 rounded border text-[9px] font-semibold uppercase tracking-wide flex-shrink-0 ${roleBadgeClasses(role)}`}
                        >
                          {role}
                        </span>
                      )}
                      <p className={`text-sm truncate ${!n.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
                        {title}
                      </p>
                    </div>
                    {subtitle && (
                      <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: false })}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${!n.is_read ? s.dot : 'bg-muted'}`} />
                  </div>
                </button>
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                    className="absolute top-1 right-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Dismiss notification"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
