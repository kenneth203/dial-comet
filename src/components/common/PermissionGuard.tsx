import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions, ModuleKey } from '@/hooks/usePermissions';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ShieldX, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PermissionGuardProps {
  module: ModuleKey;
  children: React.ReactNode;
  fallbackRoute?: string;
}

export function PermissionGuard({ module, children, fallbackRoute = '/' }: PermissionGuardProps) {
  const { canAccessPage, isLoading, isError, refreshPermissions } = usePermissions();
  const { user } = useAuth();
  const navigate = useNavigate();
  const loggedRef = useRef(false);

  const hasAccess = canAccessPage(module);

  useEffect(() => {
    if (!isLoading && !isError && !hasAccess && user && !loggedRef.current) {
      loggedRef.current = true;
      void (async () => {
        const { error } = await Promise.resolve(
          supabase.from('staff_data_access_audit').insert({
            accessed_by: user.id,
            data_type: 'unauthorized_page_access',
            action: `Attempted access to restricted module: ${module}`,
          } as any)
        );
        if (error) console.error('Audit log insert failed');
      })();
    }
  }, [isLoading, isError, hasAccess, user, module]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Technical failure — do NOT redirect. Timeout is not proof of denial.
  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Couldn't load your permissions</h2>
            <p className="text-sm text-muted-foreground">
              This is a technical error, not a denial. Please try again.
            </p>
            <Button onClick={() => refreshPermissions()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <ShieldX className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">
              You don't have permission to access this page. Contact your Super Admin if you need access.
            </p>
            <Button onClick={() => navigate(fallbackRoute)} variant="default">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
