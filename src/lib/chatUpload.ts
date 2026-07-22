import { supabase } from '@/integrations/supabase/client';

export interface UploadedAttachment {
  path: string;
  file_name: string;
  content_type: string | null;
  file_size: number;
}

export interface UploadOptions {
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Upload a file to the chat-attachments bucket with real progress reporting via XHR.
 * Returns the uploaded path + metadata so it can be attached to a message on send.
 */
export async function uploadChatAttachment(
  roomId: string,
  file: File,
  opts: UploadOptions = {}
): Promise<UploadedAttachment> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  // Random per-file path so two uploads don't collide and we don't need a message id yet.
  const uid = (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${roomId}/uploads/${uid}_${safeName(file.name)}`;
  const url = `${SUPABASE_URL}/storage/v1/object/chat-attachments/${path}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('x-upsert', 'false');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(100);
        resolve();
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.message) msg = body.message;
          else if (body?.error) msg = body.error;
        } catch { /* noop */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
      } else {
        opts.signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }
    }

    xhr.send(file);
  });

  return {
    path,
    file_name: file.name,
    content_type: file.type || null,
    file_size: file.size,
  };
}

export async function removeChatAttachment(path: string) {
  try {
    await supabase.storage.from('chat-attachments').remove([path]);
  } catch {
    /* best-effort */
  }
}
