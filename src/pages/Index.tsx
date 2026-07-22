import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import NewsFeed from "@/components/news/NewsFeed";
import TodoList from "@/components/dashboard/TodoList";
import OverdueChecklistTasks from "@/components/dashboard/OverdueChecklistTasks";
import DailyChecklist from "@/components/dashboard/DailyChecklist";
import NoticeboardDisplay from "@/components/dashboard/NoticeboardDisplay";
import OnHolidayToday from "@/components/dashboard/OnHolidayToday";
import TeamAvailability from "@/components/dashboard/TeamAvailability";
import NotificationsCard from "@/components/dashboard/NotificationsCard";
import HeaderStatusButtons from "@/components/dashboard/HeaderStatusButtons";
import { useCustomers } from "@/context/CustomersContext";
import { useAuth } from "@/context/AuthContext";
import { useTasks } from "@/context/TasksContext";
import { CustomerScriptModal } from "@/components/customers/CustomerScriptModal";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerTrigger } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";


import { Clock, MessageCircle, Palmtree, ClipboardList, ListTodo, Megaphone, UserPlus, Receipt, ChevronDown } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsSmallScreen } from "@/hooks/use-is-small-screen";
import { useNavigate } from "react-router-dom";




import { CelebrationPopup } from "@/components/celebrations/CelebrationPopup";
import { useChatUnread } from "@/hooks/useChatUnread";
import { useChatPanel } from "@/context/ChatPanelContext";
import { useTabNotification } from "@/hooks/useTabNotification";
import { useTaskNotifications } from "@/hooks/useTaskNotifications";
import { getCustomerTaskHourlyRate } from "@/lib/taskBilling";
import { useDashboardBanner } from "@/hooks/useDashboardBanner";

export default function Index() {
  const { activeCustomers: customers } = useCustomers();
  const { user } = useAuth();
  const { tasks, stopTimer } = useTasks();
  const { totalUnread: chatUnreadCount } = useChatUnread();
  const { openChat } = useChatPanel();
  const taskNotifications = useTaskNotifications();
  const notifUnreadCount = taskNotifications?.unreadCount ?? 0;
  const isSmallScreen = useIsSmallScreen();
  useTabNotification(chatUnreadCount + notifUnreadCount);
  const currentBannerUrl = useDashboardBanner();
  const { can, canAccessPage } = usePermissions();
  const navigate = useNavigate();


  const [hideClosed, setHideClosed] = useState<boolean>(() => {
    try { return localStorage.getItem("dashboard.hideClosed") !== "0"; } catch { return true; }
  });






  const operationsActions = [
    { key: 'daily', label: 'New Daily Handover', icon: ClipboardList, path: '/todo?new=1', allowed: can('daily_handover', 'create') },
    { key: 'task', label: 'New Task', icon: ListTodo, path: '/tasks?new=1', allowed: can('task_manager', 'create') },
    { key: 'notice', label: 'New Announcement', icon: Megaphone, path: '/noticeboard?new=1', allowed: can('noticeboard', 'create') },
  ];

  const supervisorActions = [
    { key: 'lead', label: 'New Lead', icon: UserPlus, path: '/crm?new=1', allowed: can('crm_dashboard', 'create') },
    { key: 'billing', label: 'Billing & Invoicing', icon: Receipt, path: '/call-billing', allowed: canAccessPage('call_billing') },
  ];

  const [testCelebration, setTestCelebration] = useState<"welcome" | "birthday" | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showHourWarning, setShowHourWarning] = useState(false);
  const [warningShownFor, setWarningShownFor] = useState<string | null>(null);

  const runningTask = tasks.find((task) => task.isTimerRunning && task.startTime);

  useEffect(() => {
    if (!runningTask) return;
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [runningTask]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await Promise.resolve(
        supabase.from("profiles").select("role").eq("user_id", user.id).single()
      );
      setIsSuperAdmin(data?.role === "Super-Admin");
    })();
  }, [user]);

  useEffect(() => {
    if (!runningTask || !runningTask.startTime) return;
    const elapsedMinutes = (currentTime - runningTask.startTime) / (1000 * 60);
    if (elapsedMinutes >= 60 && warningShownFor !== runningTask.id) {
      setShowHourWarning(true);
      setWarningShownFor(runningTask.id);
    }
  }, [runningTask, currentTime, warningShownFor]);

  const formatElapsedTime = (startTime: number) => {
    const elapsed = Math.floor((currentTime - startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getCustomerName = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    return customer?.name || "Unknown Customer";
  };

  const handleContinueTimer = () => setShowHourWarning(false);

  const getCustomerHourlyRate = (customerId: string): number => {
    const customer = customers.find((c) => c.id === customerId);
    return getCustomerTaskHourlyRate(customer);
  };

  const handleStopTimer = () => {
    if (runningTask) {
      const hourlyRate = getCustomerHourlyRate(runningTask.customerId);
      stopTimer(runningTask.id, hourlyRate);
      setShowHourWarning(false);
      setWarningShownFor(null);
    }
  };

  const RunningTaskReminder = () => {
    if (!runningTask || !runningTask.startTime) return null;
    return (
      <div
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
        onClick={() => (window.location.href = "/tasks")}
        title={runningTask.title}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
        </span>
        <Clock className="w-4 h-4 text-primary" />
        <span className="font-mono text-sm font-semibold text-primary tabular-nums">
          {formatElapsedTime(runningTask.startTime)}
        </span>
      </div>
    );
  };

  const clientsForNewsFeed = customers.map((customer) => ({ id: customer.id, name: customer.name }));

  const [clientId, setClientId] = useState<string>("");
  const [quickScriptOpen, setQuickScriptOpen] = useState(false);
  const quickScriptContentRef = useRef<HTMLDivElement>(null);
  const savedDesktopScrollRef = useRef<number | null>(null);
  const desktopUserScrolledRef = useRef(false);
  const lastUserInteractionDesktopRef = useRef(0);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const mobileDrawerListRef = useRef<HTMLDivElement>(null);
  const savedMobileScrollRef = useRef<number | null>(null);
  const mobileUserScrolledRef = useRef(false);
  const lastUserInteractionMobileRef = useRef(0);
  const [showScriptModal, setShowScriptModal] = useState(false);

  const [customerFrequency, setCustomerFrequency] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("customerSelectionFrequency");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const selectedClient = useMemo(
    () => customers.find((c) => c.id === clientId) ?? null,
    [clientId, customers],
  );

  const sortedCustomers = useMemo(() => {
    return customers
      .filter((c) => c.hasInboundCallScript !== false)
      .sort((a, b) => {
        const freqA = customerFrequency[a.id] || 0;
        const freqB = customerFrequency[b.id] || 0;
        if (freqA !== freqB) return freqB - freqA;
        return a.name.localeCompare(b.name);
      });
  }, [customers, customerFrequency]);

  const handleCustomerSelect = (customerId: string) => {
    setClientId(customerId);
    if (customerId) {
      const newFrequency = { ...customerFrequency, [customerId]: (customerFrequency[customerId] || 0) + 1 };
      setCustomerFrequency(newFrequency);
      try {
        localStorage.setItem("customerSelectionFrequency", JSON.stringify(newFrequency));
      } catch (error) {
        console.error("Failed to save customer frequency:", error);
      }
      setShowScriptModal(true);
    }
  };

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
  }, []);

  // Auto-scroll the Quick Script customer dropdown so the selected customer is
  // centred in the visible viewport when possible.
  //
  // iOS Safari notes:
  // - `getBoundingClientRect()` is affected by ancestor CSS transforms (the
  //   vaul Drawer uses `translate3d` while opening/closing), which caused the
  //   selected item to land at the wrong offset. We instead walk `offsetTop`
  //   via the `offsetParent` chain, which is immune to transforms.
  // - `Element.scrollTo({ behavior: 'smooth' })` is unreliable on iOS Safari
  //   inside a still-animating container. We use a manual rAF tween so scrolling
  //   works consistently on iOS and desktop.
  const centerScrollToItem = useCallback(
    (container: HTMLElement | null, item: HTMLElement | null, focus = false) => {
      if (!container || !item) return;

      // Compute item's top relative to the scroll container without relying on
      // getBoundingClientRect (safe under CSS transforms).
      let offsetTop = 0;
      let node: HTMLElement | null = item;
      while (node && node !== container) {
        offsetTop += node.offsetTop;
        const parent = node.offsetParent as HTMLElement | null;
        if (!parent) break;
        node = parent;
      }

      const itemHeight = item.offsetHeight || item.clientHeight;
      const containerHeight = container.clientHeight;
      const maxScroll = Math.max(0, container.scrollHeight - containerHeight);
      const desired = offsetTop - containerHeight / 2 + itemHeight / 2;
      const target = Math.max(0, Math.min(maxScroll, desired));

      const start = container.scrollTop;
      const distance = target - start;

      if (focus) item.focus({ preventScroll: true });

      if (Math.abs(distance) < 1) {
        container.scrollTop = target;
        return;
      }

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) {
        container.scrollTop = target;
        return;
      }

      // Manual smooth scroll via rAF — reliable on iOS Safari.
      const duration = 260;
      const startTime = performance.now();
      const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
      const step = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        container.scrollTop = start + distance * ease(t);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    []
  );

  useEffect(() => {
    if (!quickScriptOpen) return;

    let rafId = 0;
    let timeoutId = 0;
    let enforcerId = 0;
    let scrollListener: (() => void) | null = null;
    let userInteractionCleanup: (() => void) | null = null;

    const setup = () => {
      const viewport = quickScriptContentRef.current?.querySelector(
        "[data-radix-select-viewport]"
      );
      if (!viewport || !(viewport instanceof HTMLElement)) return;

      // Reset the user-scrolled flag for each new open session so the
      // enforcer can protect the restored position from auto-scroll.
      desktopUserScrolledRef.current = false;
      lastUserInteractionDesktopRef.current = 0;

      const markUserScrolled = () => {
        desktopUserScrolledRef.current = true;
        lastUserInteractionDesktopRef.current = Date.now();
      };

      const userEvents = ["wheel", "touchstart"];
      userEvents.forEach((event) =>
        viewport.addEventListener(event, markUserScrolled, {
          passive: true,
          capture: true,
        })
      );
      const keydownHandler = (e: KeyboardEvent) => {
        if (
          ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(
            e.key
          )
        ) {
          markUserScrolled();
        }
      };
      viewport.addEventListener("keydown", keydownHandler, { capture: true });
      const pointerdownHandler = (e: PointerEvent) => {
        // Clicks on the viewport itself (scrollbar track) count as user scroll.
        if (e.target === viewport) markUserScrolled();
      };
      viewport.addEventListener("pointerdown", pointerdownHandler, {
        capture: true,
      });
      userInteractionCleanup = () => {
        userEvents.forEach((event) =>
          viewport.removeEventListener(event, markUserScrolled, {
            capture: true,
          })
        );
        viewport.removeEventListener("keydown", keydownHandler, {
          capture: true,
        });
        viewport.removeEventListener("pointerdown", pointerdownHandler, {
          capture: true,
        });
      };

      const onScroll = () => {
        // Only treat scrolls as user-driven if they closely follow a user
        // interaction (wheel, touch, keyboard). This prevents Radix's
        // auto-scroll/focus behaviour from overwriting the saved position.
        if (Date.now() - lastUserInteractionDesktopRef.current > 150) return;
        savedDesktopScrollRef.current = viewport.scrollTop;
      };
      viewport.addEventListener("scroll", onScroll);
      scrollListener = onScroll;

      const saved = savedDesktopScrollRef.current;
      if (saved != null) {
        const maxScroll = Math.max(
          0,
          viewport.scrollHeight - viewport.clientHeight
        );
        viewport.scrollTop = Math.max(0, Math.min(maxScroll, saved));
      } else if (clientId) {
        const selectedItem = viewport.querySelector('[data-state="checked"]');
        if (selectedItem instanceof HTMLElement) {
          centerScrollToItem(viewport, selectedItem);
        }
      } else {
        viewport.scrollTop = 0;
      }
    };

    const runEnforcer = () => {
      const viewport = quickScriptContentRef.current?.querySelector(
        "[data-radix-select-viewport]"
      );
      if (!viewport || !(viewport instanceof HTMLElement)) return;
      const saved = savedDesktopScrollRef.current;
      if (saved == null || desktopUserScrolledRef.current) return;

      let attempts = 0;
      const maxAttempts = 20; // ~1s of protection
      enforcerId = window.setInterval(() => {
        attempts++;
        const currentViewport = quickScriptContentRef.current?.querySelector(
          "[data-radix-select-viewport]"
        );
        if (!currentViewport || !(currentViewport instanceof HTMLElement)) {
          window.clearInterval(enforcerId);
          return;
        }
        if (desktopUserScrolledRef.current || attempts > maxAttempts) {
          window.clearInterval(enforcerId);
          return;
        }
        if (Math.abs(currentViewport.scrollTop - saved) > 2) {
          currentViewport.scrollTop = saved;
        }
      }, 50);
    };

    timeoutId = window.setTimeout(() => {
      rafId = requestAnimationFrame(() => {
        setup();
        runEnforcer();
      });
    }, 50);

    return () => {
      window.clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
      window.clearInterval(enforcerId);
      if (userInteractionCleanup) userInteractionCleanup();
      if (scrollListener) {
        const viewport = quickScriptContentRef.current?.querySelector(
          "[data-radix-select-viewport]"
        );
        if (viewport instanceof HTMLElement) {
          viewport.removeEventListener("scroll", scrollListener);
        }
      }
    };
  }, [quickScriptOpen, clientId, centerScrollToItem]);

  // Mobile bottom sheet: restore the last scroll position when reopening, or
  // scroll to the selected customer and centre it on the first open. Falls back
  // to the top of the list when no customer is selected.
  useEffect(() => {
    if (!mobileDrawerOpen) return;

    let rafId = 0;
    let timeoutId = 0;
    let enforcerId = 0;
    let scrollListener: (() => void) | null = null;
    let userInteractionCleanup: (() => void) | null = null;

    const setup = () => {
      const list = mobileDrawerListRef.current;
      if (!list) return;

      // Reset the user-scrolled flag for each new open session so the
      // enforcer can protect the restored position from auto-scroll.
      mobileUserScrolledRef.current = false;
      lastUserInteractionMobileRef.current = 0;

      const markUserScrolled = () => {
        mobileUserScrolledRef.current = true;
        lastUserInteractionMobileRef.current = Date.now();
      };

      const userEvents = ["wheel", "touchstart"];
      userEvents.forEach((event) =>
        list.addEventListener(event, markUserScrolled, {
          passive: true,
          capture: true,
        })
      );
      const keydownHandler = (e: KeyboardEvent) => {
        if (
          ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(
            e.key
          )
        ) {
          markUserScrolled();
        }
      };
      list.addEventListener("keydown", keydownHandler, { capture: true });
      const pointerdownHandler = (e: PointerEvent) => {
        if (e.target === list) markUserScrolled();
      };
      list.addEventListener("pointerdown", pointerdownHandler, { capture: true });
      userInteractionCleanup = () => {
        userEvents.forEach((event) =>
          list.removeEventListener(event, markUserScrolled, { capture: true })
        );
        list.removeEventListener("keydown", keydownHandler, { capture: true });
        list.removeEventListener("pointerdown", pointerdownHandler, {
          capture: true,
        });
      };

      const onScroll = () => {
        if (Date.now() - lastUserInteractionMobileRef.current > 150) return;
        savedMobileScrollRef.current = list.scrollTop;
      };
      list.addEventListener("scroll", onScroll);
      scrollListener = onScroll;

      const saved = savedMobileScrollRef.current;
      if (saved != null) {
        const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
        list.scrollTop = Math.max(0, Math.min(maxScroll, saved));
      } else if (clientId) {
        const selectedItem = list.querySelector(`[data-value="${clientId}"]`);
        if (selectedItem instanceof HTMLElement) {
          centerScrollToItem(list, selectedItem, true);
        }
      } else {
        list.scrollTop = 0;
        const firstItem = list.querySelector<HTMLButtonElement>('[role="option"]');
        firstItem?.focus({ preventScroll: true });
      }
    };

    const runEnforcer = () => {
      const list = mobileDrawerListRef.current;
      if (!list) return;
      const saved = savedMobileScrollRef.current;
      if (saved == null || mobileUserScrolledRef.current) return;

      let attempts = 0;
      const maxAttempts = 20;
      enforcerId = window.setInterval(() => {
        attempts++;
        const currentList = mobileDrawerListRef.current;
        if (!currentList) {
          window.clearInterval(enforcerId);
          return;
        }
        if (mobileUserScrolledRef.current || attempts > maxAttempts) {
          window.clearInterval(enforcerId);
          return;
        }
        if (Math.abs(currentList.scrollTop - saved) > 2) {
          currentList.scrollTop = saved;
        }
      }, 50);
    };

    // The vaul Drawer animates via translate3d; iOS Safari returns transformed
    // rects during that window. Wait for the transform to settle before
    // measuring so the selected item lands at the correct offset.
    timeoutId = window.setTimeout(() => {
      rafId = requestAnimationFrame(() => {
        setup();
        runEnforcer();
      });
    }, 380);

    let resizeRaf = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        const list = mobileDrawerListRef.current;
        if (!list) return;
        const saved = savedMobileScrollRef.current;
        if (saved != null) {
          const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
          list.scrollTop = Math.max(0, Math.min(maxScroll, saved));
        }
      });
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      window.clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(resizeRaf);
      window.clearInterval(enforcerId);
      if (userInteractionCleanup) userInteractionCleanup();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (scrollListener) {
        const list = mobileDrawerListRef.current;
        if (list) list.removeEventListener("scroll", scrollListener);
      }
    };
  }, [mobileDrawerOpen, clientId, centerScrollToItem]);


  return (
    <>
      <CelebrationPopup forceType={testCelebration} onForceComplete={() => setTestCelebration(null)} />
      <Helmet>
        <title>The VA Team Portal</title>
        <meta
          name="description"
          content="Operator dashboard for multi-client telephone answering: scripts, messages, tasks, and stats."
        />
        <link rel="canonical" href={window.location.origin + "/"} />
      </Helmet>


      {/* Rotating hero banner (changes every 5 days) — full width, responsive */}
      <div className="px-4 lg:px-6 pt-4">
        <img
          src={currentBannerUrl}
          alt="The VA Team services banner"
          className="block w-full h-auto rounded-lg"
          loading="eager"
        />
      </div>


      {/* Start-call bar */}
      <div className="px-4 lg:px-6 pt-4">

        <Card className="border-border shadow-[var(--shadow-card)]">
          <CardContent className="p-3 lg:p-4 flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <label className="text-sm font-medium text-foreground shrink-0 pt-1 sm:pt-0">Quick Script</label>
              <div className="flex-1 flex items-center gap-2 w-full min-w-0">
                {isSmallScreen ? (
                  <Drawer open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
                    <DrawerTrigger asChild>
                      <button
                        type="button"
                        aria-label="Select a customer"
                        className="flex h-10 flex-1 min-w-0 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <span className="truncate">{selectedClient ? selectedClient.name : "Please Select a customer…"}</span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                      </button>
                    </DrawerTrigger>
                    <DrawerContent className="h-[85vh] px-0 pb-0">
                      <DrawerHeader className="px-4 pb-2">
                        <DrawerTitle>Select a customer</DrawerTitle>
                        <DrawerDescription>Choose a customer to load their call script</DrawerDescription>
                      </DrawerHeader>
                      <div
                        ref={mobileDrawerListRef}
                        role="listbox"
                        aria-label="Customers"
                        aria-activedescendant={clientId ? `customer-opt-${clientId}` : undefined}
                        tabIndex={-1}
                        onKeyDown={(e) => {
                          const list = mobileDrawerListRef.current;
                          if (!list) return;
                          const items = Array.from(
                            list.querySelectorAll<HTMLButtonElement>('[role="option"]')
                          );
                          if (items.length === 0) return;
                          const active = document.activeElement as HTMLElement | null;
                          const currentIdx = items.findIndex((el) => el === active);
                          const move = (idx: number) => {
                            e.preventDefault();
                            const target = items[(idx + items.length) % items.length];
                            target?.focus();
                            target?.scrollIntoView({ block: "nearest" });
                          };
                          if (e.key === "ArrowDown") move(currentIdx + 1);
                          else if (e.key === "ArrowUp") move(currentIdx - 1);
                          else if (e.key === "Home") move(0);
                          else if (e.key === "End") move(items.length - 1);
                          else if (e.key === "Escape") {
                            e.preventDefault();
                            setMobileDrawerOpen(false);
                          }
                        }}
                        className="flex-1 overflow-y-auto px-4 pb-4 focus:outline-none"
                      >
                        {sortedCustomers.map((c) => (
                          <button
                            key={c.id}
                            id={`customer-opt-${c.id}`}
                            type="button"
                            role="option"
                            aria-selected={clientId === c.id}
                            data-value={c.id}
                            onClick={() => {
                              setMobileDrawerOpen(false);
                              handleCustomerSelect(c.id);
                            }}
                            className={cn(
                              "w-full rounded-md px-4 py-3 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              clientId === c.id
                                ? "bg-primary/10 text-primary font-medium"
                                : "hover:bg-muted focus:bg-accent"
                            )}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </DrawerContent>
                  </Drawer>
                ) : (
                  <Select
                    value={clientId}
                    onValueChange={handleCustomerSelect}
                    onOpenChange={setQuickScriptOpen}
                  >
                    <SelectTrigger className="flex-1 min-w-0 lg:max-w-md bg-background">
                      <SelectValue placeholder="Please Select a customer…" />
                    </SelectTrigger>
                    <SelectContent
                      ref={quickScriptContentRef}
                      className="bg-background border shadow-lg z-50 max-h-[60vh]"
                      position="popper"
                      side="bottom"
                      avoidCollisions={false}
                      sideOffset={4}
                    >
                      {sortedCustomers.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="hover:bg-muted cursor-pointer">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="hero" disabled={!selectedClient} className="shrink-0">
                  Start Call
                </Button>

              </div>
            </div>
            <div className="flex items-center gap-2 lg:ml-auto">
              <RunningTaskReminder />
              {isSuperAdmin && (
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setTestCelebration("welcome")} title="Test Welcome Popup">
                    🎉
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setTestCelebration("birthday")} title="Test Birthday Popup">
                    🎂
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main grid */}
      <section className="px-4 lg:px-6 py-4 lg:py-6">
        <h1 className="sr-only">Telephone Answering Management System Dashboard</h1>

        <article className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left rail: announcements + availability */}
          <aside id="news" className="lg:col-span-1 order-2 lg:order-1 space-y-4">
            <OnHolidayToday />
            <Card className="border-border shadow-[var(--shadow-card)]">
              <NewsFeed
                clients={clientsForNewsFeed}
                showForm={false}
                showExpired={false}
                heading="Company Announcements"
                showActions={false}
                showManageLink={false}
              />
            </Card>

            <Card id="team-availability" className="border-border shadow-[var(--shadow-card)]">
              <CardHeader className="pb-3">
                <CardTitle>Team Availability</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4">
                <TeamAvailability />
              </CardContent>
            </Card>
          </aside>

          {/* Main column: daily tasks */}
          <section className="lg:col-span-2 order-1 lg:order-2 space-y-4">
            <Card className="border-border shadow-[var(--shadow-card)]">
              <CardContent className="py-2 px-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-1">Dashboard filter</span>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[#b73235]"
                    checked={hideClosed}
                    onChange={(e) => {
                      setHideClosed(e.target.checked);
                      try { localStorage.setItem("dashboard.hideClosed", e.target.checked ? "1" : "0"); } catch {}
                    }}
                  />
                  <span>Hide closed tasks &amp; checklist items</span>
                </label>
                <span className="text-[10px] text-muted-foreground ml-2">
                  Applied instantly, even if realtime sync is delayed.
                </span>
              </CardContent>
            </Card>
            <div id="daily-checklist">
              <DailyChecklist hideTabs hideClosed={hideClosed} />
            </div>
            <Card id="daily-handover" className="border-border shadow-[var(--shadow-card)]">
              <CardContent className="max-h-[55vh] overflow-y-auto pt-4 px-4">
                <TodoList showDelete={false} hidePriorityFilter headerTitle="Daily Handover" hideCompletedOverride={hideClosed} />
              </CardContent>
            </Card>
          </section>

          {/* Right rail: noticeboard, quick access, notifications */}
          <aside className="lg:col-span-1 order-3">
            <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] overflow-y-auto space-y-4">
              <Card id="notifications" className="border-border shadow-[var(--shadow-card)]">
                <CardContent className="pt-6 px-4">
                  <NotificationsCard />
                </CardContent>
              </Card>

              <Card id="noticeboard" className="border-border shadow-[var(--shadow-card)]">
                <CardHeader className="pb-3">
                  <CardTitle>Noticeboard</CardTitle>
                </CardHeader>
                <CardContent className="overflow-y-auto text-sm leading-relaxed pt-0 px-4">
                  <NoticeboardDisplay />
                </CardContent>
              </Card>

              <Card id="quick-access" className="border-border shadow-[var(--shadow-card)]">
                <CardHeader className="pb-3">
                  <CardTitle>Quick Access</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-3 space-y-4">
                  {/* Section 1: Status */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Status</p>
                    <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 gap-x-1 gap-y-3 justify-items-stretch items-start">
                      <HeaderStatusButtons />
                    </div>
                  </div>

                  {/* Section 2: Operations */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Operations</p>
                    <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 gap-x-1 gap-y-3 justify-items-stretch items-start">
                      <button
                        type="button"
                        onClick={() => openChat()}
                        className="relative flex flex-col items-center gap-1 group w-full min-w-0 px-0.5"
                      >
                        <MessageCircle
                          className="w-8 h-8 text-[hsl(var(--primary))] group-hover:opacity-80 transition-opacity"
                          strokeWidth={1.75}
                        />
                        <span className="text-[11px] font-semibold text-foreground text-center leading-tight break-words w-full">Chat</span>
                        {chatUnreadCount > 0 && (
                          <Badge className="absolute -top-1 right-0 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground border-2 border-background">
                            {chatUnreadCount > 9 ? "9+" : chatUnreadCount}
                          </Badge>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => (window.location.href = "/holidays")}
                        className="flex flex-col items-center gap-1 group w-full min-w-0 px-0.5"
                      >
                        <Palmtree
                          className="w-8 h-8 text-[hsl(var(--primary-variant))] group-hover:opacity-80 transition-opacity"
                          strokeWidth={1.75}
                        />
                        <span className="text-[11px] font-semibold text-foreground text-center leading-tight break-words w-full">Holiday</span>
                      </button>
                      {operationsActions.filter((a) => a.allowed).map((action, idx) => (
                        <button
                          key={action.key}
                          type="button"
                          onClick={() => navigate(action.path)}
                          className="flex flex-col items-center gap-1 group w-full min-w-0 px-0.5"
                        >
                          <action.icon
                            className={cn(
                              "w-8 h-8 group-hover:opacity-80 transition-opacity",
                              idx % 2 === 0 ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--primary-variant))]"
                            )}
                            strokeWidth={1.75}
                          />
                          <span className="text-[11px] font-semibold text-foreground text-center leading-tight break-words w-full">{action.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Section 3: Supervisor */}
                  {supervisorActions.some((a) => a.allowed) && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Supervisor</p>
                      <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 gap-x-1 gap-y-3 justify-items-stretch items-start">
                        {supervisorActions.filter((a) => a.allowed).map((action, idx) => (
                          <button
                            key={action.key}
                            type="button"
                            onClick={() => navigate(action.path)}
                            className="flex flex-col items-center gap-1 group w-full min-w-0 px-0.5"
                          >
                            <action.icon
                              className={cn(
                                "w-8 h-8 group-hover:opacity-80 transition-opacity",
                                idx % 2 === 0 ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--primary-variant))]"
                              )}
                              strokeWidth={1.75}
                            />
                            <span className="text-[11px] font-semibold text-foreground text-center leading-tight break-words w-full">{action.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </aside>
        </article>
      </section>

      <CustomerScriptModal
        isOpen={showScriptModal}
        onClose={() => {
          setShowScriptModal(false);
          setClientId("");
        }}
        customer={selectedClient}
      />

      <Dialog open={showHourWarning} onOpenChange={setShowHourWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Timer Running for 1+ Hour
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>Your task timer has been running for over an hour:</p>
              {runningTask && (
                <div className="bg-muted p-3 rounded-lg">
                  <p className="font-medium">{runningTask.title}</p>
                  <p className="text-sm text-muted-foreground">
                    Customer: {getCustomerName(runningTask.customerId)}
                  </p>
                  <p className="text-sm font-mono">
                    Elapsed: {runningTask.startTime ? formatElapsedTime(runningTask.startTime) : "0:00"}
                  </p>
                </div>
              )}
              <p>Do you want to continue timing this task?</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleStopTimer} className="w-full sm:w-auto">
              Stop Timer
            </Button>
            <Button onClick={handleContinueTimer} className="w-full sm:w-auto">
              Continue Timer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
