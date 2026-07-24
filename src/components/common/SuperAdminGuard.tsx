import { ReactNode, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { withTimeout } from "@/lib/withTimeout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const SUPER_ADMIN_CHECK_TIMEOUT_MS = 8_000;

interface SuperAdminGuardProps {
  children: ReactNode;
  redirectTo?: string;
}

type Status = "checking" | "allowed" | "denied" | "error";

/**
 * Server-authoritative guard restricting access to Super-Admin users only.
 */
export default function SuperAdminGuard({ children, redirectTo = "/" }: SuperAdminGuardProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<Status>("checking");

  const check = useCallback(async () => {
    if (!user) return;
    setStatus("checking");
    try {
      const result = await withTimeout<{ data: unknown; error: unknown }>(
        supabase.rpc("is_super_admin") as unknown as Promise<{ data: unknown; error: unknown }>,
        SUPER_ADMIN_CHECK_TIMEOUT_MS,
        "rpc:is_super_admin",
      );
      if (result.error) {
        console.warn("[SuperAdminGuard] rpc error");
        setStatus("error");
        return;
      }
      setStatus(result.data === true ? "allowed" : "denied");
    } catch (err) {
      console.warn("[SuperAdminGuard] check failed:", (err as Error)?.name);
      setStatus("error");
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setStatus("denied");
      return;
    }
    void check();
  }, [user, authLoading, check]);

  if (authLoading || status === "checking") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Couldn't verify permissions</h2>
            <p className="text-sm text-muted-foreground">
              We couldn't confirm your access just now. This is a technical error, not a denial.
            </p>
            <Button onClick={() => void check()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (status === "denied") return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
