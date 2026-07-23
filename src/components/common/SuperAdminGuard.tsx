import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { withTimeout } from "@/lib/withTimeout";

const SUPER_ADMIN_CHECK_TIMEOUT_MS = 8_000;

interface SuperAdminGuardProps {
  children: ReactNode;
  redirectTo?: string;
}

/**
 * Server-authoritative guard restricting access to Super-Admin users only.
 */
export default function SuperAdminGuard({ children, redirectTo = "/" }: SuperAdminGuardProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setChecking(false);
      setAllowed(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc("is_super_admin");
        if (cancelled) return;
        setAllowed(!error && data === true);
      } catch {
        if (!cancelled) setAllowed(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!allowed) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
