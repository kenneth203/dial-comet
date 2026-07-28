import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IdleTimeoutGuard } from '@/components/common/IdleTimeoutGuard';
import { beginSuspendedSession, useSuspensionStatus } from '@/hooks/useSuspensionStatus';
import { hasSuspensionDisplayState } from '@/lib/suspensionSession';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { phase, status, retry } = useSuspensionStatus(user?.id ?? null);
  const handledSuspensionRef = useRef(false);

  useEffect(() => {
    if (!isLoading && !user) {
      // A confirmed suspended session owns the /account-suspended screen and
      // must not be bounced back to the standard login page.
      if (hasSuspensionDisplayState()) return;
      navigate('/auth');
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    if (phase !== 'suspended' || !status || handledSuspensionRef.current) return;
    handledSuspensionRef.current = true;
    navigate('/account-suspended', { replace: true });
    void beginSuspendedSession(status);
  }, [phase, status, navigate]);

  const isEnforcing = !!user && (phase === 'resolving' || phase === 'suspended');

  if (isLoading || isEnforcing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (user && phase === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 rounded-lg border border-border bg-card p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
          <div className="space-y-1">
            <h1 className="text-base font-semibold text-foreground">Unable to verify account access</h1>
            <p className="text-sm text-muted-foreground">
              We could not confirm your account status. This is a temporary technical problem, not a
              suspension. Please try again.
            </p>
          </div>
          <Button onClick={retry} className="w-full">Retry</Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <IdleTimeoutGuard enabled={!!user && !isLoading} />
      {children}
    </>
  );
}
