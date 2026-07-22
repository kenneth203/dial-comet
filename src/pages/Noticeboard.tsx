import { useState, useEffect, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Save, Edit, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/common/ProtectedRoute";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { sanitizeHtml } from "@/lib/sanitize";
import { secureLog } from "@/lib/secureLogger";

export default function Noticeboard() {
  const [content, setContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveAttemptRef = useRef<string>("");

  useEffect(() => {
    loadNoticeboard();
    if (user) {
      checkUserRole();
    }
  }, [user]);

  // Auto-save functionality
  useEffect(() => {
    if (isEditing && content !== lastSavedContent && content.trim()) {
      setHasUnsavedChanges(true);
      
      // Clear existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      
      // Set new auto-save timeout
      autoSaveTimeoutRef.current = setTimeout(() => {
        if (content !== lastSaveAttemptRef.current) {
          lastSaveAttemptRef.current = content;
          autoSaveNoticeboard();
        }
      }, 2000); // Auto-save after 2 seconds of no typing
    }
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [content, isEditing, lastSavedContent]);

  const checkUserRole = async () => {
    if (!user) return;
    
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        console.error('Error fetching user role:', error);
        return;
      }
      
      secureLog.debug('User role fetched');
      setUserRole(profile?.role || null);
    } catch (error) {
      console.error('Error in checkUserRole:', error);
    }
  };

  const canEdit = userRole && ['Admin', 'Super-Admin', 'Supervisor'].includes(userRole);

  const loadNoticeboard = async () => {
    try {
      secureLog.debug('Loading noticeboard');
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
      setLastSavedContent(loadedContent);
      setHasUnsavedChanges(false);
      
      secureLog.debug('Noticeboard loaded successfully');
    } catch (error) {
      console.error('Error loading noticeboard:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      toast({
        title: "Error",
        description: `Failed to load noticeboard: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const autoSaveNoticeboard = useCallback(async () => {
    if (!user || !canEdit) return;
    
    try {
      secureLog.debug('Auto-saving noticeboard');
      
      // Check if content exists, update or insert
      const { data: existing, error: fetchError } = await supabase
        .from('noticeboard')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        console.error('Error checking existing noticeboard:', fetchError);
        return;
      }

      if (existing) {
        const { error } = await supabase
          .from('noticeboard')
          .update({ 
            content,
            updated_by: user.id 
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('noticeboard')
          .insert({ 
            content,
            updated_by: user.id 
          });

        if (error) throw error;
      }

      setLastSavedContent(content);
      setHasUnsavedChanges(false);
      secureLog.debug('Auto-save successful');
    } catch (error) {
      console.error('Error auto-saving noticeboard:', error);
      // Don't show toast for auto-save errors to avoid spam
    }
  }, [content, user, canEdit]);

  const saveNoticeboard = async () => {
    setIsSaving(true);
    try {
      if (!user) {
        throw new Error('Not authenticated');
      }

      if (!content.trim()) {
        toast({
          title: "Warning",
          description: "Cannot save empty content",
          variant: "destructive",
        });
        return;
      }

      secureLog.debug('Manual save initiated');

      // Check if content exists, update or insert
      const { data: existing, error: fetchError } = await supabase
        .from('noticeboard')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      if (existing) {
        const { error } = await supabase
          .from('noticeboard')
          .update({ 
            content,
            updated_by: user.id 
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('noticeboard')
          .insert({ 
            content,
            updated_by: user.id 
          });

        if (error) throw error;
      }

      setLastSavedContent(content);
      setHasUnsavedChanges(false);
      setIsEditing(false);
      
      toast({
        title: "Success",
        description: "Noticeboard saved successfully",
      });
      
      secureLog.debug('Manual save successful');
    } catch (error) {
      console.error('Error saving noticeboard:', error);
      toast({
        title: "Error",
        description: `Failed to save noticeboard: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };


  // Prevent data loss on page refresh/navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        const message = "You have unsaved changes. Are you sure you want to leave?";
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <>
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Manage team noticeboard content and announcements" />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        <GradientBackdrop />
        
        <StandardNavigation currentPage="noticeboard" />

        <main className="container max-w-[2000px] px-3 py-4 sm:px-6 sm:py-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gradient">Noticeboard</h1>
              <p className="text-muted-foreground">Manage team announcements and information</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>Team Noticeboard</CardTitle>
                  <CardDescription>
                    {canEdit 
                      ? "Update important information and announcements for the team"
                      : "View team announcements and important information"
                    }
                  </CardDescription>
                </div>
                {canEdit && (
                  <div className="flex gap-2 items-center flex-wrap">
                    {hasUnsavedChanges && isEditing && (
                      <div className="flex items-center gap-1 text-orange-600 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        <span>Auto-saving...</span>
                      </div>
                    )}
                    {!isEditing ? (
                      <Button onClick={() => setIsEditing(true)} variant="outline">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    ) : (
                      <>
                        <Button 
                          onClick={() => {
                            if (hasUnsavedChanges) {
                              const confirmClose = window.confirm("You have unsaved changes. Are you sure you want to cancel?");
                              if (!confirmClose) return;
                            }
                            setContent(lastSavedContent);
                            setIsEditing(false);
                            setHasUnsavedChanges(false);
                          }} 
                          variant="outline"
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={saveNoticeboard}
                          disabled={isSaving || !content.trim()}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {isSaving ? "Saving..." : "Save"}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-4">
                  <RichTextEditor
                    value={content}
                    onChange={setContent}
                    placeholder="Enter noticeboard content..."
                    minHeight="400px"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div 
                    className="rich-text-content prose prose-sm max-w-none min-h-[200px] p-4 border rounded-md bg-muted/50"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
                  />
                </div>
              )}
              
              {!canEdit && (
                <div className="mt-4 p-3 bg-muted rounded-md">
                  <p className="text-sm text-muted-foreground">
                    ℹ️ Only Admin and Supervisor users can edit the noticeboard content.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </>
    </ProtectedRoute>
  );
}