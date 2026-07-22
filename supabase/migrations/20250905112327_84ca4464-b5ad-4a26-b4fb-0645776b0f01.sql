-- Create chat system tables with proper security

-- Create room types enum
CREATE TYPE chat_room_type AS ENUM ('general', 'dm');

-- Create chat rooms table
CREATE TABLE public.chat_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type chat_room_type NOT NULL DEFAULT 'general',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat room members table  
CREATE TABLE public.chat_room_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Create chat messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create message reads tracking table
CREATE TABLE public.chat_message_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_rooms
CREATE POLICY "Users can view rooms they are members of"
ON public.chat_rooms FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_room_members 
    WHERE room_id = chat_rooms.id AND user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can create rooms"
ON public.chat_rooms FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- RLS Policies for chat_room_members  
CREATE POLICY "Users can view members of rooms they belong to"
ON public.chat_room_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_room_members cm2 
    WHERE cm2.room_id = chat_room_members.room_id AND cm2.user_id = auth.uid()
  )
);

CREATE POLICY "Room creators can add members"
ON public.chat_room_members FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_rooms 
    WHERE id = room_id AND created_by = auth.uid()
  )
);

-- RLS Policies for chat_messages
CREATE POLICY "Users can view messages in rooms they belong to"
ON public.chat_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_room_members 
    WHERE room_id = chat_messages.room_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can send messages to rooms they belong to"
ON public.chat_messages FOR INSERT
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.chat_room_members 
    WHERE room_id = chat_messages.room_id AND user_id = auth.uid()
  )
);

-- RLS Policies for chat_message_reads
CREATE POLICY "Users can view their own read tracking"
ON public.chat_message_reads FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own read tracking"
ON public.chat_message_reads FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own read tracking updates"
ON public.chat_message_reads FOR UPDATE
USING (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX idx_chat_room_members_user_id ON public.chat_room_members(user_id);
CREATE INDEX idx_chat_room_members_room_id ON public.chat_room_members(room_id);
CREATE INDEX idx_chat_messages_room_id ON public.chat_messages(room_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at DESC);
CREATE INDEX idx_chat_message_reads_user_id ON public.chat_message_reads(user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_chat_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for timestamp updates
CREATE TRIGGER update_chat_rooms_timestamp
  BEFORE UPDATE ON public.chat_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_chat_timestamp();

CREATE TRIGGER update_chat_messages_timestamp
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_chat_timestamp();

-- Seed General room and add all existing users as members
INSERT INTO public.chat_rooms (name, type, created_by) 
VALUES ('General', 'general', (SELECT user_id FROM public.profiles LIMIT 1));

-- Get the General room ID and add all current users as members
INSERT INTO public.chat_room_members (room_id, user_id)
SELECT 
  (SELECT id FROM public.chat_rooms WHERE name = 'General' AND type = 'general'),
  p.user_id
FROM public.profiles p
WHERE p.status = 'Active';

-- Enable realtime for all chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reads;