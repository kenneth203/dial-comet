import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTaskNotifications } from "@/hooks/useTaskNotifications";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useTaskNotifications();
  const navigate = useNavigate();

  const handleNotificationClick = (n: typeof notifications[0]) => {
    if (!n.is_read) markAsRead(n.id);
    const msg = (n.message || '').toLowerCase();
    if (msg.includes('holiday approval required')) {
      navigate("/holidays/admin");
    } else if (msg.includes('holiday')) {
      navigate("/holidays");
    } else if ((n as any).type === 'checklist_reminder' || msg.toLowerCase().includes('checklist')) {
      navigate("/todo");
    } else if ((n as any).type === 'invoice_review' || msg.includes('invoice') || msg.includes('proposal')) {
      navigate("/crm");
    } else if (n.task_id) {
      navigate(`/tasks?task=${n.task_id}`);
    } else {
      navigate("/tasks");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-10 w-10">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-destructive text-destructive-foreground border-2 border-background"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(320px,calc(100vw-2rem))] p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllAsRead}>
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.filter(n => !n.is_read).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No unread notifications
            </div>
          ) : (
            <div className="divide-y">
              {notifications.filter(n => !n.is_read).map((n) => (
                <div
                  key={n.id}
                  className="px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 bg-primary/5"
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-1 h-2 w-2 rounded-full flex-shrink-0 bg-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {n.message}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
