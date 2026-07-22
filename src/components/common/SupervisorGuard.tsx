import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

interface SupervisorGuardProps {
  children: ReactNode;
  redirectTo?: string;
}

/**
 * Restricts access to Supervisor and Super-Admin roles only.
 * Other roles (Operator, Admin, HR) are redirected.
 */
export default function SupervisorGuard({ children, redirectTo = "/" }: SupervisorGuardProps) {
  const { user, isLoading: authLoading } = useAuth();
  const { isLoading, isSuperAdmin, isSupervisor } = usePermissions();

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!(isSuperAdmin || isSupervisor)) return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}
