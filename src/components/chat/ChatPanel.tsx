import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Plus, Users, CheckCheck, ArrowLeft, Loader2, RefreshCw, MoreVertical, Eraser, Trash2, CheckSquare, X, Hash, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useChat } from "@/hooks/useChat";
import { useChatUnread } from "@/hooks/useChatUnread";
import { useChatPanel } from "@/context/ChatPanelContext";
import { usePermissions } from "@/hooks/usePermissions";
import { ChannelDialog } from "./ChannelDialog";
import { MessagesList } from "./MessagesList";
import { MessageComposer } from "./MessageComposer";
import { NewDMDialog } from "./NewDMDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export function ChatPanel() {
  const { isOpen, closeChat } = useChatPanel();
  const { isSuperAdmin } = usePermissions();
  const isAdmin = isSuperAdmin;
  const {
    rooms,
    activeRoom,
    messages,
    loading,
    sending,
    reconcilingReceipts,
    sendMessage,
    selectRoom,
    createOrFindDMRoom,
    markAsRead,
    loadRooms,
    loadMessages,
    clearRoom,
    deleteRoom,
    createChannel,
    updateChannelMembers,
  } = useChat();
  const [showNewDM, setShowNewDM] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [manageMembersRoomId, setManageMembersRoomId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [confirmAction, setConfirmAction] = useState<null | "clear" | "delete">(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | "clear" | "delete">(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const { unreadByRoom, clearRoomUnread } = useChatUnread();

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const selectableIds = useMemo(() => rooms.map((r) => r.id), [rooms]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const runBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setBulkRunning(true);
    const ids = Array.from(selectedIds);
    let success = 0;
    let failed = 0;
    for (const id of ids) {
      const ok = bulkAction === "clear" ? await clearRoom(id) : await deleteRoom(id);
      if (ok) success += 1;
      else failed += 1;
    }
    setBulkRunning(false);
    setBulkAction(null);
    exitSelectionMode();
  };

  // Refresh rooms + active conversation when the panel opens or becomes
  // visible again — catches new DMs and messages that arrived while the
  // session was idle/backgrounded so nothing appears stale.
  useEffect(() => {
    if (!isOpen) return;
    const activeId = activeRoom?.id;
    const refresh = () => {
      void loadRooms();
      if (activeId) void loadMessages(activeId);
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [isOpen, activeRoom?.id, loadRooms, loadMessages]);

  useEffect(() => {
    if (!isOpen || !activeRoom) return;
    clearRoomUnread(activeRoom.id);
    void markAsRead(activeRoom.id);
    // Deliberately not keyed on messages.length: read receipts are written once
    // per room open/switch via the server-side RPC, not on every new message.
  }, [isOpen, activeRoom?.id, markAsRead, clearRoomUnread]);

  const generalRooms = rooms.filter((r) => r.type === "general");
  const dmRooms = rooms.filter((r) => r.type === "dm");

  const handleSelectRoom = async (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
      clearRoomUnread(room.id);
      selectRoom(room);
      setMobileView("chat");
    }
  };

  const handleCreateDM = async (userId: string) => {
    const room = await createOrFindDMRoom(userId);
    if (room) {
      setShowNewDM(false);
      setMobileView("chat");
      await markAsRead(room.id);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!activeRoom) return;
    await markAsRead(activeRoom.id);
    clearRoomUnread(activeRoom.id);
  };

  const activeUnread = activeRoom ? (unreadByRoom[activeRoom.id] ?? 0) : 0;

  const renderRoomItem = (room: typeof rooms[number], prefix?: string) => {
    const u = unreadByRoom[room.id] ?? 0;
    const isActive = activeRoom?.id === room.id;
    const isChecked = selectedIds.has(room.id);

    if (selectionMode) {
      return (
        <label
          key={room.id}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm cursor-pointer transition-colors",
            isChecked ? "bg-accent text-accent-foreground" : "hover:bg-accent/40 text-foreground"
          )}
        >
          <Checkbox
            checked={isChecked}
            onCheckedChange={() => toggleSelected(room.id)}
            aria-label={`Select ${room.name}`}
          />
          <span className="truncate font-medium flex-1">
            {prefix}
            {room.name}
          </span>
          {u > 0 && (
            <Badge className="h-5 min-w-5 px-1.5 bg-primary text-primary-foreground border-0 text-[10px] shrink-0 rounded-full">
              {u > 99 ? "99+" : u}
            </Badge>
          )}
        </label>
      );
    }

    return (
      <button
        key={room.id}
        type="button"
        onClick={() => handleSelectRoom(room.id)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-sm text-left transition-all duration-150 cursor-pointer",
          isActive
            ? "bg-accent text-accent-foreground shadow-sm"
            : "hover:bg-accent/40 text-foreground active:scale-[0.98]"
        )}
      >
        <span className="truncate font-medium">
          {prefix}
          {room.name}
        </span>
        {u > 0 && (
          <Badge className="h-5 min-w-5 px-1.5 bg-primary text-primary-foreground border-0 text-[10px] shrink-0 rounded-full">
            {u > 99 ? "99+" : u}
          </Badge>
        )}
      </button>
    );
  };

  const RoomList = (
    <div className="h-full flex flex-col bg-muted/30">
      <div className="px-3 py-3 border-b border-border flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1 min-w-0 truncate">
          {selectionMode ? `${selectedIds.size} selected` : "Chats"}
        </span>
        {selectionMode ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs shrink-0"
              onClick={() =>
                setSelectedIds(allSelected ? new Set() : new Set(selectableIds))
              }
            >
              {allSelected ? "None" : "All"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={exitSelectionMode}
              aria-label="Exit selection"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => setSelectionMode(true)}
              title="Bulk cleanup"
              disabled={rooms.length === 0}
              aria-label="Bulk cleanup"
            >
              <CheckSquare className="h-3.5 w-3.5" />
            </Button>
            {isAdmin && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 shrink-0"
                onClick={() => setShowNewChannel(true)}
                title="New channel"
              >
                <Hash className="h-3.5 w-3.5 mr-1" /> Channel
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 shrink-0"
              onClick={() => setShowNewDM(true)}
              title="New direct message"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> DM
            </Button>
          </>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {generalRooms.length > 0 && (
            <div>
              <div className="px-3 pb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Users className="h-3 w-3" /> Channels
              </div>
              <div className="space-y-0.5">
                {generalRooms.map((r) => renderRoomItem(r, "# "))}
              </div>
            </div>
          )}
          {dmRooms.length > 0 && (
            <div>
              <div className="px-3 pb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <MessageSquare className="h-3 w-3" /> Direct Messages
              </div>
              <div className="space-y-0.5">
                {dmRooms.map((r) => renderRoomItem(r))}
              </div>
            </div>
          )}
          {rooms.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No conversations yet.
            </div>
          )}
        </div>
      </ScrollArea>
      {selectionMode && (
        <div className="border-t border-border p-2 flex items-center gap-2 bg-background">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 h-8"
            disabled={selectedIds.size === 0 || bulkRunning}
            onClick={() => setBulkAction("clear")}
          >
            <Eraser className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="flex-1 h-8"
            disabled={selectedIds.size === 0 || bulkRunning}
            onClick={() => setBulkAction("delete")}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
        </div>
      )}
    </div>
  );

  const ChatArea = (
    <div className="h-full flex flex-col min-w-0">
      <div className="border-b border-border px-4 py-3 flex items-center gap-2 min-h-[56px]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 sm:hidden"
          onClick={() => setMobileView("list")}
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {activeRoom ? (
            <>
              <div className="font-semibold text-sm truncate">
                {activeRoom.type === "general" ? "# " : ""}
                {activeRoom.name}
              </div>
              {loading && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
              )}
              {reconcilingReceipts && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0" title="Syncing read receipts">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Syncing</span>
                </span>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No conversation selected</div>
          )}
        </div>
        {activeRoom && activeUnread > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            onClick={handleMarkAllAsRead}
            title="Mark all as read"
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline text-xs">Mark all read</span>
          </Button>
        )}
        {activeRoom && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Chat options"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isAdmin && activeRoom?.type === "general" && (
                <>
                  <DropdownMenuItem onClick={() => setManageMembersRoomId(activeRoom.id)}>
                    <UserCog className="h-4 w-4 mr-2" />
                    Manage members
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => setConfirmAction("clear")}>
                <Eraser className="h-4 w-4 mr-2" />
                Clear messages
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmAction("delete")}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeRoom ? (
          <MessagesList
            messages={messages}
            loading={loading}
            onReachBottom={() => {
              clearRoomUnread(activeRoom.id);
              void markAsRead(activeRoom.id);
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-center px-6">
            <div>
              <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Select a conversation</h3>
              <p className="text-sm text-muted-foreground">
                Pick a channel or DM from the list to start messaging.
              </p>
            </div>
          </div>
        )}
      </div>

      {activeRoom && (
        <div className="border-t border-border">
          <MessageComposer roomId={activeRoom.id} onSend={sendMessage} disabled={sending} />
        </div>
      )}
    </div>
  );

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(o) => !o && closeChat()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[90vw] sm:w-[90vw] lg:max-w-[55vw] lg:w-[55vw] p-0 flex flex-col gap-0"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Chat
            </SheetTitle>
          </SheetHeader>

          {/* Desktop: two-column. Mobile: single column toggled by mobileView */}
          <div className="flex-1 min-h-0 flex">
            <div
              className={cn(
                "w-full sm:w-64 sm:border-r sm:border-border shrink-0",
                mobileView === "list" ? "block" : "hidden sm:block"
              )}
            >
              {RoomList}
            </div>
            <div
              className={cn(
                "flex-1 min-w-0",
                mobileView === "chat" ? "block" : "hidden sm:block"
              )}
            >
              {ChatArea}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <NewDMDialog
        open={showNewDM}
        onOpenChange={setShowNewDM}
        onCreateDM={handleCreateDM}
      />

      {isAdmin && (
        <ChannelDialog
          open={showNewChannel}
          onOpenChange={setShowNewChannel}
          mode="create"
          onCreate={async (name, memberIds) => {
            await createChannel(name, memberIds);
          }}
        />
      )}

      {isAdmin && manageMembersRoomId && (
        <ChannelDialog
          open={!!manageMembersRoomId}
          onOpenChange={(o) => { if (!o) setManageMembersRoomId(null); }}
          mode="manage"
          roomId={manageMembersRoomId}
          onSaveMembers={async (memberIds) => {
            await updateChannelMembers(manageMembersRoomId, memberIds);
          }}
        />
      )}

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "delete" ? "Delete this chat?" : "Clear all messages?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "delete"
                ? "This will permanently remove the conversation and all of its messages for everyone. This cannot be undone."
                : "This will permanently delete every message in this conversation for everyone. The chat itself will remain. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!activeRoom) return;
                const action = confirmAction;
                setConfirmAction(null);
                if (action === "delete") {
                  await deleteRoom(activeRoom.id);
                  setMobileView("list");
                } else if (action === "clear") {
                  await clearRoom(activeRoom.id);
                }
              }}
            >
              {confirmAction === "delete" ? "Delete" : "Clear"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkAction !== null}
        onOpenChange={(open) => { if (!open && !bulkRunning) setBulkAction(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "delete"
                ? `Delete ${selectedIds.size} chat${selectedIds.size === 1 ? "" : "s"}?`
                : `Clear ${selectedIds.size} chat${selectedIds.size === 1 ? "" : "s"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "delete"
                ? "This will permanently remove the selected conversations and all of their messages for everyone. Channels you don't have permission to delete will be skipped. This cannot be undone."
                : "This will permanently delete every message in the selected conversations for everyone. The chats themselves will remain. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkRunning}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void runBulkAction(); }}
            >
              {bulkRunning ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Working…</>
              ) : bulkAction === "delete" ? "Delete all" : "Clear all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default ChatPanel;
