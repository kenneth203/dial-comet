import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { reconcileSignedInStatus } from '@/lib/statusSync';
import { asPromise } from '@/lib/supabaseRpc';
import { withTimeout } from '@/lib/withTimeout';
import { clearProjectAuthStorage } from '@/lib/boot-storage-guard';

const AUTH_BOOTSTRAP_TIMEOUT_MS = 8_000;

function signalAuthReady() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('app:auth-ready'));
  }
}

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
    let mounted = true;
    const syncSignedInStatus = (signedInUserId: string) => {
      if (reconciledUserIdRef.current === signedInUserId) return;
      reconciledUserIdRef.current = signedInUserId;

      setTimeout(() => {
        void reconcileSignedInStatus(signedInUserId);
      }, 0);
    };

    const setOfflineOnSignOut = (userId: string) => {
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

    const finishBootstrap = () => {
      if (!mounted) return;
      setIsLoading(false);
      signalAuthReady();
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        const previousUserId = reconciledUserIdRef.current;

        setSession(session);
        setUser(session?.user ?? null);
        finishBootstrap();

        if (event === 'SIGNED_OUT') {
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

    // Bounded settlement: getSession() is not AbortSignal-cancellable, but
    // this guarantees the AuthProvider reaches a terminal loaded state within
    // AUTH_BOOTSTRAP_TIMEOUT_MS regardless of the SDK's internal behaviour.
    withTimeout(
      asPromise(supabase.auth.getSession()),
      AUTH_BOOTSTRAP_TIMEOUT_MS,
      'supabase.auth.getSession',
    )
      .then(({ data: { session } }) => {
        if (!mounted) return;
        setSession((current) => current ?? session);
        setUser((current) => current ?? (session?.user ?? null));
        if (session?.user) {
          syncSignedInStatus(session.user.id);
        }
      })
      .catch((error) => {
        console.error('[AuthProvider] session bootstrap failed:', error?.name);
        // On timeout or hard failure, defensively drop any persisted state
        // that might be causing the stall so the next boot starts clean.
        try { clearProjectAuthStorage(); } catch { /* ignore */ }
      })
      .finally(() => {
        finishBootstrap();
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
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