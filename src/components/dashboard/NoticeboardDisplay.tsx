import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeHtml } from "@/lib/sanitize";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";


export default function NoticeboardDisplay() {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadNoticeboard();
    
    // Set up real-time subscription to get updates
    const subscription = supabase
      .channel(`noticeboard_changes-${Date.now()}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'noticeboard' 
        }, 
        (payload) => {
          // Realtime update received
          if (payload.new && typeof payload.new === 'object' && 'content' in payload.new) {
            setContent(payload.new.content as string || '');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  useAutoRefresh(() => loadNoticeboard());


  const loadNoticeboard = async () => {
    try {
      const { data, error } = await supabase
        .from('noticeboard')
        .select('content')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const loadedContent = data?.content || '';
      setContent(loadedContent);
    } catch (error) {
      setContent('<p style="color: red; font-weight: bold;">⚠️ Unable to load noticeboard content. Please refresh the page.</p>');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-muted rounded w-1/2"></div>
      </div>
    );
  }

  // Simple fallback for testing
  if (!content) {
    return (
      <div className="p-4 border border-dashed border-muted-foreground rounded">
        <p className="text-muted-foreground text-sm">No noticeboard content available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Sanitized content to prevent XSS */}
      <div 
        className="text-sm"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
      />
    </div>
  );
}