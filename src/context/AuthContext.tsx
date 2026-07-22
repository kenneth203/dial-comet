import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { reconcileSignedInStatus } from '@/lib/statusSync';
import { asPromise } from '@/lib/supabaseRpc';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const reconciledUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const syncSignedInStatus = (signedInUserId: string) => {
      if (reconciledUserIdRef.current === signedInUserId) return;
      reconciledUserIdRef.current = signedInUserId;

      setTimeout(() => {
        void reconcileSignedInStatus(signedInUserId);
      }, 0);
    };

    const setOfflineOnSignOut = (userId: string) => {
      // Defer so we don't block the auth state change callback
      setTimeout(() => {
        void (async () => {
          try {
            await supabase
              .from('user_statuses')
              .upsert(
                {
                  user_id: userId,
                  status: 'offline',
                  status_emoji: '⛔',
                  auto_reset_at: null,
                },
                { onConflict: 'user_id' }
              );
          } catch (error) {
            console.error('Error setting status to offline on sign out:', error);
          }
        })();
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Capture previous user id before we overwrite state (needed for SIGNED_OUT)
        const previousUserId = reconciledUserIdRef.current;

        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        if (event === 'SIGNED_OUT') {
          // Auto-set status to offline for ANY sign-out (idle timeout, token expiry,
          // manual sign-out, etc.) so we never leave a stale online status behind.
          if (previousUserId) {
            setOfflineOnSignOut(previousUserId);
          }
          reconciledUserIdRef.current = null;
        }

        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
          syncSignedInStatus(session.user.id);
        }
      }
    );

    void asPromise(supabase.auth.getSession())
      .then(({ data: { session } }) => {
        setSession((current) => current ?? session);
        setUser((current) => current ?? (session?.user ?? null));
        setIsLoading(false);

        if (session?.user) {
          syncSignedInStatus(session.user.id);
        }
      })
      .catch((error) => {
        console.error('Error loading auth session:', error);
        setIsLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (user) {
      try {
        // Get current user status to check if they have ongoing toilet/coffee breaks
        const { data: currentStatus } = await supabase
          .from('user_statuses')
          .select('*')
          .eq('user_id', user.id)
          .single();

        // If user has ongoing toilet or coffee break, log the end time
        if (currentStatus && (currentStatus.status === 'toilet' || currentStatus.status === 'coffee')) {
          await supabase
            .from('status_timing_logs')
            .insert({
              user_id: user.id,
              status: currentStatus.status,
              action: 'end',
              timestamp: new Date().toISOString()
            });
        }

        // Set user status to offline
        await supabase
          .from('user_statuses')
          .upsert({
            user_id: user.id,
            status: 'offline',
            status_emoji: '⛔',
            auto_reset_at: null,
          }, {
            onConflict: 'user_id'
          });
      } catch (error) {
        console.error('Error updating status during sign out:', error);
        // Continue with sign out even if status update fails
      }
    }

    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}