import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface TaskAttachment {
  id: string;
  task_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  content_type: string | null;
  uploaded_by: string;
  created_at: string;
}

export function useTaskAttachments(taskId: string | null) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fetchAttachments = useCallback(async () => {
    if (!taskId || !user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_attachments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAttachments((data || []) as unknown as TaskAttachment[]);
    } catch (err) {
      console.error('Error fetching attachments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [taskId, user]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  // Realtime: refetch whenever attachments for this task change (any user).
  useEffect(() => {
    if (!taskId) return;
    const channel = supabase
      .channel(`task_attachments:${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_attachments', filter: `task_id=eq.${taskId}` },
        () => { fetchAttachments(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [taskId, fetchAttachments]);

  const uploadFile = useCallback(async (file: File) => {
    if (!taskId || !user) return;
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${taskId}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('task-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: insertError } = await (supabase
        .from('task_attachments') as any)
        .insert({
          task_id: taskId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          content_type: file.type || fileExt || null,
          uploaded_by: user.id,
        });

      if (insertError) throw insertError;

      toast({ title: 'File uploaded', description: file.name });
      fetchAttachments();
    } catch (err: any) {
      console.error('Upload error:', err);
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [taskId, user, fetchAttachments]);

  const deleteAttachment = useCallback(async (attachment: TaskAttachment) => {
    try {
      const { error: dbError } = await supabase
        .from('task_attachments')
        .delete()
        .eq('id', attachment.id);

      if (dbError) throw dbError;

      supabase.storage
        .from('task-attachments')
        .remove([attachment.file_path])
        .then(({ error }) => {
          if (error) console.warn('Storage cleanup warning:', error);
        });

      setAttachments(prev => prev.filter(a => a.id !== attachment.id));
      toast({ title: 'Attachment removed', description: attachment.file_name });
    } catch (err: any) {
      console.error('Delete error:', err);
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  }, []);

  const downloadFile = useCallback(async (attachment: TaskAttachment) => {
    try {
      const { data, error } = await supabase.storage
        .from('task-attachments')
        .download(attachment.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    }
  }, []);

  return {
    attachments,
    isLoading,
    isUploading,
    uploadFile,
    deleteAttachment,
    downloadFile,
    refetch: fetchAttachments,
  };
}
