import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface AdminGuardProps {
  children: ReactNode;
  /** Where to send non-admins. Defaults to /holidays. */
  redirectTo?: string;
}

/**
 * Server-authoritative guard for admin-only routes.
 * Renders a blank loading state until `is_admin_or_higher()` resolves.
 * Nothing inside `children` mounts unless the RPC confirms admin access,
 * so client-side state cannot be tampered with to flash admin UI.
 */
export default function AdminGuard({ children, redirectTo = "/holidays" }: AdminGuardProps) {
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
        const { data, error } = await supabase.rpc("is_admin_or_higher");
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
