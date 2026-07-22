import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home,
  ListTodo,
  CheckSquare,
  Megaphone,
  Newspaper,
  Users as UsersIcon,
  Briefcase,
  ArrowRightCircle,
  PhoneCall,
  Receipt,
  CalendarDays,
  Palmtree,
  ShieldCheck,
  Settings,
  BarChart3,
  MessageCircle,
  LifeBuoy,
  LogOut,
  Package,
  Database,
  ClipboardCheck,
  Inbox,
  Image as ImageIcon,
  Github,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermissions, type ModuleKey } from "@/hooks/usePermissions";
import { useChatUnread } from "@/hooks/useChatUnread";
import { useAuth } from "@/context/AuthContext";
import { useChatPanel } from "@/context/ChatPanelContext";
import { supabase } from "@/integrations/supabase/client";

type NavItem = {
  title: string;
  to: string;
  icon: LucideIcon;
  module?: ModuleKey;
  badgeKey?: "chat";
  adminOnly?: boolean;
  superAdminOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Home", to: "/", icon: Home },
      { title: "Daily Handover", to: "/todo", icon: ListTodo, module: "daily_handover" },
      { title: "Task Manager", to: "/tasks", icon: CheckSquare, module: "task_manager" },
      { title: "Noticeboard", to: "/noticeboard", icon: Megaphone, module: "noticeboard" },
      { title: "Announcements", to: "/news", icon: Newspaper, module: "news" },
      { title: "Chat", to: "/chat", icon: MessageCircle, module: "chat", badgeKey: "chat" },
    ],
  },
  {
    label: "Clients",
    items: [
      { title: "Customers", to: "/config/customers", icon: UsersIcon, module: "customer_directory" },
      { title: "CRM", to: "/crm", icon: Briefcase, module: "crm_dashboard" },
      { title: "Convert Leads", to: "/crm/convert-leads", icon: ArrowRightCircle, module: "crm_dashboard", adminOnly: true },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Billing & Invoicing", to: "/call-billing", icon: Receipt, module: "call_billing" },
      { title: "Packages", to: "/config/packages", icon: Package, module: "packages_pricing" },
    ],
  },
  {
    label: "Team",
    items: [
      { title: "Operator Dashboard", to: "/operator-dashboard", icon: PhoneCall },
      { title: "Scheduler", to: "/scheduler", icon: CalendarDays, module: "shift_scheduler" },
      { title: "Holidays", to: "/holidays", icon: Palmtree, module: "holiday_management" },
      { title: "Holiday Admin", to: "/holidays/admin", icon: ShieldCheck, module: "holiday_admin_panel" },
      { title: "Leave Types", to: "/leave-types", icon: Settings, module: "leave_types_config" },
      { title: "Reports", to: "/reports", icon: BarChart3, module: "status_reports" },
      { title: "Berkshire Compliance", to: "/reports/checklist-compliance", icon: ClipboardCheck, adminOnly: true },
    ],
  },
  {
    label: "System",
    items: [
      { title: "User Management", to: "/user-management", icon: UsersIcon, module: "user_management" },
      { title: "Checklist Templates", to: "/checklist-templates", icon: ClipboardCheck, module: "daily_checklist" },
      { title: "Email Intake", to: "/config/email-intake", icon: Inbox, adminOnly: true },
      { title: "Database Reset", to: "/database-reset", icon: Database, module: "database_reset" },
      { title: "Dashboard Banners", to: "/system/banners", icon: ImageIcon, superAdminOnly: true },
      { title: "GitHub Status", to: "/system/github", icon: Github, superAdminOnly: true },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { isMenuVisible, isSuperAdmin, isSupervisor } = usePermissions();
  const isAdminOrHigher = isSuperAdmin || isSupervisor;
  const { totalUnread: chatUnread } = useChatUnread();
  const { signOut, user } = useAuth();
  const { openChat } = useChatPanel();

  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/");

  const COLLAPSIBLE_GROUPS = ["Clients", "Finance", "Team", "System"];
  const STORAGE_KEY = "sidebar-groups-state";

  type LocalEnvelope = { state: Record<string, boolean>; updatedAt: number };

  const readLocal = (): LocalEnvelope => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { state: {}, updatedAt: 0 };
      const parsed = JSON.parse(raw);
      // Backwards compat: old format was a bare Record<string, boolean>
      if (parsed && typeof parsed === "object" && "state" in parsed) {
        return {
          state: (parsed.state ?? {}) as Record<string, boolean>,
          updatedAt: Number(parsed.updatedAt) || 0,
        };
      }
      return { state: parsed as Record<string, boolean>, updatedAt: 0 };
    } catch {
      return { state: {}, updatedAt: 0 };
    }
  };

  const writeLocal = (state: Record<string, boolean>, updatedAt: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, updatedAt }));
    } catch {
      /* ignore */
    }
  };

  const initial = readLocal();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initial.state);
  const localUpdatedAtRef = useRef<number>(initial.updatedAt);
  const [hydratedFromRemote, setHydratedFromRemote] = useState(false);
  const [conflict, setConflict] = useState<{
    local: Record<string, boolean>;
    remote: Record<string, boolean>;
    keys: string[];
  } | null>(null);

  // Load remote preferences when user signs in, and detect conflicts
  useEffect(() => {
    if (!user) {
      setHydratedFromRemote(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("sidebar_groups_state, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;

      const local = readLocal();
      const hasRemote =
        !error && data?.sidebar_groups_state && typeof data.sidebar_groups_state === "object";
      const remoteState = hasRemote
        ? (data.sidebar_groups_state as Record<string, boolean>)
        : null;
      const remoteUpdatedAt = hasRemote ? new Date(data.updated_at as string).getTime() : 0;

      if (!remoteState) {
        // No remote yet — push local up if we have anything
        setHydratedFromRemote(true);
        return;
      }

      // Find keys where both sides defined a value and they disagree
      const conflictingKeys: string[] = [];
      const keys = new Set([...Object.keys(local.state), ...Object.keys(remoteState)]);
      for (const k of keys) {
        const inLocal = k in local.state;
        const inRemote = k in remoteState;
        if (inLocal && inRemote && !!local.state[k] !== !!remoteState[k]) {
          conflictingKeys.push(k);
        }
      }

      if (conflictingKeys.length === 0) {
        // Safe auto-merge: union of keys, remote wins where defined
        const merged = { ...local.state, ...remoteState };
        setOpenGroups(merged);
        localUpdatedAtRef.current = Math.max(local.updatedAt, remoteUpdatedAt);
        writeLocal(merged, localUpdatedAtRef.current);
        setHydratedFromRemote(true);
        return;
      }

      // Real conflict — ask the user which to keep
      setConflict({ local: local.state, remote: remoteState, keys: conflictingKeys });
      // Don't hydrate (and don't sync) until the user resolves
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Persist locally always; persist remotely once hydrated and signed in
  useEffect(() => {
    localUpdatedAtRef.current = Date.now();
    writeLocal(openGroups, localUpdatedAtRef.current);
    if (!user || !hydratedFromRemote) return;
    const handle = setTimeout(() => {
      void supabase
        .from("user_preferences")
        .upsert(
          { user_id: user.id, sidebar_groups_state: openGroups },
          { onConflict: "user_id" },
        );
    }, 400);
    return () => clearTimeout(handle);
  }, [openGroups, user, hydratedFromRemote]);

  useEffect(() => {
    const activeGroup = groups.find((g) =>
      COLLAPSIBLE_GROUPS.includes(g.label) && g.items.some((i) => isActive(i.to)),
    );
    if (activeGroup) {
      setOpenGroups((prev) => (prev[activeGroup.label] ? prev : { ...prev, [activeGroup.label]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const resolveConflict = (choice: "local" | "remote" | "merge") => {
    if (!conflict) return;
    let next: Record<string, boolean>;
    if (choice === "local") {
      next = { ...conflict.remote, ...conflict.local };
    } else if (choice === "remote") {
      next = { ...conflict.local, ...conflict.remote };
    } else {
      // Merge: prefer expanded (true) on either side
      next = { ...conflict.local };
      for (const k of new Set([...Object.keys(conflict.local), ...Object.keys(conflict.remote)])) {
        next[k] = !!conflict.local[k] || !!conflict.remote[k];
      }
    }
    setOpenGroups(next);
    setConflict(null);
    setHydratedFromRemote(true); // allow the persist effect to push the resolution
  };

  return (
    <>
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border/60 px-3 py-4">
        <NavLink to="/" className="flex items-center gap-2.5">
          <img
            src="/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png"
            alt="The VA Team"
            className="h-8 w-8 rounded bg-white p-1 shrink-0"
          />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-sidebar-foreground">The VA Team</span>
              <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                Virtual Assistant Services
              </span>
            </div>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {groups.map((group) => {
          const visibleItems = group.items.filter(
            (item) =>
              (!item.module || isMenuVisible(item.module)) &&
              (!item.adminOnly || isAdminOrHigher) &&
              (!item.superAdminOnly || isSuperAdmin),
          );
          if (visibleItems.length === 0) return null;

          const isCollapsible = COLLAPSIBLE_GROUPS.includes(group.label);
          // When the sidebar itself is icon-collapsed, always show items so the
          // user can still navigate via icons + tooltips.
          const isOpen = collapsed || !isCollapsible || !!openGroups[group.label];

          return (
            <SidebarGroup key={group.label}>
              {!collapsed && (
                isCollapsible ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={isOpen}
                    className="flex items-center justify-between w-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`}
                    />
                  </button>
                ) : (
                  <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/50">
                    {group.label}
                  </SidebarGroupLabel>
                )
              )}
              {isOpen && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {visibleItems.map((item) => {
                      const active = isActive(item.to);
                      const badgeValue = item.badgeKey === "chat" ? chatUnread : 0;
                      const isChat = item.to === "/chat";
                      const inner = (
                        <>
                          <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                          {!collapsed && (
                            <span className="text-sm flex-1 truncate">{item.title}</span>
                          )}
                          {!collapsed && badgeValue > 0 && (
                            <Badge className="ml-auto h-5 min-w-5 px-1.5 bg-primary text-primary-foreground border-0 text-[10px]">
                              {badgeValue > 99 ? "99+" : badgeValue}
                            </Badge>
                          )}
                          {collapsed && badgeValue > 0 && (
                            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
                          )}
                        </>
                      );
                      return (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton
                            asChild
                            isActive={active && !isChat}
                            tooltip={item.title}
                            className="group/item h-10 rounded-lg text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:font-semibold data-[active=true]:shadow-sm"
                          >
                            {isChat ? (
                              <button
                                type="button"
                                onClick={() => openChat()}
                                className="flex items-center gap-3 w-full text-left"
                              >
                                {inner}
                              </button>
                            ) : (
                              <NavLink to={item.to} className="flex items-center gap-3">
                                {inner}
                              </NavLink>
                            )}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 p-3 gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start gap-2 text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.9} />
          {!collapsed && <span className="text-sm">Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
    <AlertDialog open={!!conflict}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sidebar settings out of sync</AlertDialogTitle>
          <AlertDialogDescription>
            This device and your saved profile disagree on{" "}
            <span className="font-medium text-foreground">
              {conflict?.keys.join(", ")}
            </span>
            . Which version would you like to keep?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 text-sm">
          <div className="rounded-md border p-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This device</div>
            <div>{conflict?.keys.map((k) => `${k}: ${conflict.local[k] ? "expanded" : "collapsed"}`).join(" · ")}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Synced profile</div>
            <div>{conflict?.keys.map((k) => `${k}: ${conflict.remote[k] ? "expanded" : "collapsed"}`).join(" · ")}</div>
          </div>
        </div>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel onClick={() => resolveConflict("merge")}>
            Merge (keep expanded)
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => resolveConflict("local")}>
            Use this device
          </AlertDialogAction>
          <AlertDialogAction onClick={() => resolveConflict("remote")}>
            Use synced profile
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

export default AppSidebar;
