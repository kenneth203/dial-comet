import { supabase } from "@/integrations/supabase/client";
import { asPromise } from "@/lib/supabaseRpc";

export type PresenceStatus = 'online' | 'toilet' | 'coffee' | 'meeting' | 'offline';

interface PersistStatusParams {
  userId: string;
  status: PresenceStatus;
  emoji: string;
  label: string;
  timeoutMinutes?: number;
}

export async function reconcileSignedInStatus(userId: string) {
  try {
    // On sign-in, always force the user to Online — regardless of any
    // stale status (meeting/toilet/coffee/offline) left over from a
    // previous session. Login is an explicit "I'm here now" signal.
    const { data: currentStatus } = await asPromise(supabase
      .from('user_statuses')
      .select('status')
      .eq('user_id', userId)
      .maybeSingle());

    // Sign-in is an explicit "I'm here now" signal — always flip to Online,
    // even if a previous session left the user Offline. Logout is the only
    // automatic way back to Offline; otherwise the user must change it manually.


    // Close out any open toilet/coffee break timing logs so they don't stay open.
    if (currentStatus && (currentStatus.status === 'toilet' || currentStatus.status === 'coffee')) {
      try {
        await asPromise(supabase
          .from('status_timing_logs')
          .insert({
            user_id: userId,
            status: currentStatus.status,
            action: 'end',
            timestamp: new Date().toISOString(),
          }));
      } catch (logError) {
        console.error('Error closing break timing log on sign-in:', logError);
      }
    }

    await asPromise(supabase
      .from('user_statuses')
      .upsert({
        user_id: userId,
        status: 'online',
        status_emoji: '✅',
        auto_reset_at: null,
      }, { onConflict: 'user_id' }));
  } catch (error) {
    console.error('Error syncing online status:', error);
  }
}

export async function persistStatusWithNews({ userId, status, emoji, timeoutMinutes }: PersistStatusParams) {
  const autoResetAt = timeoutMinutes
    ? new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString()
    : null;

  const { error } = await asPromise(supabase
    .from('user_statuses')
    .upsert({
      user_id: userId,
      status,
      status_emoji: emoji,
      auto_reset_at: autoResetAt,
    }, {
      onConflict: 'user_id'
    }));

  if (error) throw error;
}