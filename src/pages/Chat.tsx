import { useState } from 'react';
import { StandardNavigation } from '@/components/common/StandardNavigation';
import { Card } from '@/components/ui/card';
import { useChat } from '@/hooks/useChat';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { MessagesList } from '@/components/chat/MessagesList';
import { MessageComposer } from '@/components/chat/MessageComposer';
import { Button } from '@/components/ui/button';
import { MessageSquare, Users } from 'lucide-react';

export default function Chat() {
  const { 
    rooms, 
    activeRoom, 
    messages, 
    loading, 
    sending, 
    sendMessage, 
    selectRoom, 
    createOrFindDMRoom,
    markAsRead 
  } = useChat();

  const handleSendMessage: React.ComponentProps<typeof MessageComposer>['onSend'] = async (content, files) => {
    await sendMessage(content, files as any);
  };

  const handleMarkAsRead = async () => {
    if (activeRoom) {
      await markAsRead(activeRoom.id);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <StandardNavigation currentPage="Chat" />
      
      <main className="container max-w-7xl mx-auto px-3 py-4 sm:px-4 sm:py-6">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gradient mb-2">Chat</h1>
          <p className="text-muted-foreground">
            Communicate with your team in real-time
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:h-[calc(100vh-12rem)]">
          {/* Sidebar */}
          <div className="lg:col-span-1 max-h-64 lg:max-h-none">
            <ChatSidebar
              rooms={rooms}
              activeRoom={activeRoom}
              onSelectRoom={selectRoom}
              onCreateDM={createOrFindDMRoom}
              loading={loading}
            />
          </div>

          {/* Main Chat Area */}
          <div className="lg:col-span-3 min-h-[400px] lg:min-h-0">
            <Card className="flex flex-col h-full min-h-[400px] lg:min-h-0">
              {activeRoom ? (
                <>
                  {/* Chat Header */}
                  <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-3">
                      {activeRoom.type === 'general' ? (
                        <Users className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <h2 className="font-semibold">{activeRoom.name}</h2>
                        <p className="text-sm text-muted-foreground">
                      {activeRoom.type === 'general' ? 'Team chat' : 'Direct message'}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleMarkAsRead}>
                      Mark as Read
                    </Button>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-hidden">
                    <MessagesList
                      messages={messages}
                      loading={loading}
                    />
                  </div>

                  {/* Composer */}
                  <div className="border-t">
                    {activeRoom && (
                      <MessageComposer
                        roomId={activeRoom.id}
                        onSend={handleSendMessage}
                        disabled={sending}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center">
                  <div>
                    <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Select a conversation</h3>
                    <p className="text-muted-foreground">
                      Choose a chat from the sidebar to start messaging
                    </p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}