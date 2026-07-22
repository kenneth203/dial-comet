import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Plus, Users, Loader2 } from 'lucide-react';
import { ChatRoom } from '@/hooks/useChat';
import { NewDMDialog } from './NewDMDialog';
import { cn } from '@/lib/utils';

interface ChatSidebarProps {
  rooms: ChatRoom[];
  activeRoom: ChatRoom | null;
  onSelectRoom: (room: ChatRoom) => void;
  onCreateDM: (userId: string) => Promise<ChatRoom | null>;
  loading: boolean;
}

export function ChatSidebar({ 
  rooms, 
  activeRoom, 
  onSelectRoom, 
  onCreateDM, 
  loading 
}: ChatSidebarProps) {
  const [showNewDM, setShowNewDM] = useState(false);

  const generalRooms = rooms.filter(room => room.type === 'general');
  const dmRooms = rooms.filter(room => room.type === 'dm');

  const handleCreateDM = async (userId: string) => {
    const room = await onCreateDM(userId);
    if (room) {
      setShowNewDM(false);
    }
  };

  if (loading && rooms.length === 0) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
        </CardHeader>
        
        <CardContent className="flex-1 p-0">
          <ScrollArea className="h-full px-4">
            {/* General Channels */}
            {generalRooms.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3 px-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Channels
                  </span>
                </div>
                <div className="space-y-1">
                  {generalRooms.map(room => (
                    <Button
                      key={room.id}
                      variant="ghost"
                      className={cn(
                        "w-full justify-start h-auto p-3",
                        activeRoom?.id === room.id && "bg-muted"
                      )}
                      onClick={() => onSelectRoom(room)}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <div className="flex-1 text-left">
                          <div className="font-medium text-sm">
                            # {room.name}
                          </div>
                        </div>
                        {/* TODO: Add unread badge when useChatUnread per-room logic is implemented */}
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Direct Messages */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3 px-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Direct Messages
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewDM(true)}
                  className="h-6 w-6 p-0"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              
              <div className="space-y-1">
                {dmRooms.map(room => (
                  <Button
                    key={room.id}
                    variant="ghost"
                    className={cn(
                      "w-full justify-start h-auto p-3",
                      activeRoom?.id === room.id && "bg-muted"
                    )}
                    onClick={() => onSelectRoom(room)}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">
                          {room.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-sm">
                          {room.name}
                        </div>
                      </div>
                      {/* TODO: Add unread badge when useChatUnread per-room logic is implemented */}
                    </div>
                  </Button>
                ))}
                
                {dmRooms.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      No direct messages yet
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewDM(true)}
                      className="h-8"
                    >
                      <Plus className="h-3 w-3 mr-2" />
                      Start DM
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <NewDMDialog
        open={showNewDM}
        onOpenChange={setShowNewDM}
        onCreateDM={handleCreateDM}
      />
    </>
  );
}