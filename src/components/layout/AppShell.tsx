import { Outlet, useLocation } from "react-router-dom";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ChatPanelProvider } from "@/context/ChatPanelContext";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ChatMessageAlertModal } from "@/components/chat/ChatMessageAlertModal";
import { StatusAlertModal } from "@/components/status/StatusAlertModal";
import { MentionAlertModal } from "@/components/dashboard/MentionAlertModal";

import { useStatusHeartbeat } from "@/hooks/useStatusHeartbeat";
import { useGlobalLiveAlerts } from "@/hooks/useGlobalLiveAlerts";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { RealtimeStatusBadge } from "@/components/layout/RealtimeStatusBadge";

export function AppShell() {
  useLocation();
  useStatusHeartbeat();
  useGlobalLiveAlerts();
  useVersionCheck();


  return (
    <SidebarProvider defaultOpen>
      <ChatPanelProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex flex-col min-w-0">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:h-16 lg:px-6">
              <SidebarTrigger className="h-9 w-9 rounded-lg border border-border bg-card text-foreground hover:bg-muted" />
              <div className="ml-auto flex items-center gap-2">
                <RealtimeStatusBadge />
              </div>
            </header>


            <main className="flex-1 min-w-0 w-full overflow-x-hidden">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
        <ChatPanel />
        <ChatMessageAlertModal />
        <StatusAlertModal />
        <MentionAlertModal />
      </ChatPanelProvider>

    </SidebarProvider>
  );
}

export default AppShell;
