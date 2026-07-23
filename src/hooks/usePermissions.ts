import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PostgrestSingleResponse } from '@supabase/supabase-js';
import { useAuth } from '@/context/AuthContext';
import { asPromise } from '@/lib/supabaseRpc';
import { withTimeout } from '@/lib/withTimeout';

const PERMISSIONS_TIMEOUT_MS = 8_000;

export type PermissionFeature =
  | 'menu_visible' | 'page_access' | 'view' | 'create'
  | 'edit' | 'delete' | 'assign' | 'approve'
  | 'export' | 'manage_settings' | 'view_billing_data'
  | 'script_view' | 'script_edit' | 'contact_ooo_edit';

export type PermissionScope = 'all' | 'team' | 'own' | 'assigned' | 'none';

export type ModuleKey =
  | 'home_page' | 'daily_handover' | 'task_manager' | 'noticeboard'
  | 'news' | 'customer_directory' | 'crm_dashboard' | 'call_billing'
  | 'shift_scheduler' | 'user_management' | 'holiday_management'
  | 'holiday_admin_panel' | 'leave_types_config' | 'packages_pricing'
   | 'status_reports' | 'chat'
   | 'database_reset'
   | 'daily_checklist';

interface PermissionEntry {
  section: string;
  feature: string;
  granted: boolean;
  scope: string;
}

// Route to module key mapping
export const ROUTE_MODULE_MAP: Record<string, ModuleKey> = {
  '/': 'home_page',
  '/todo': 'daily_handover',
  '/tasks': 'task_manager',
  '/noticeboard': 'noticeboard',
  '/news': 'news',
  '/config/customers': 'customer_directory',
  '/crm': 'crm_dashboard',
  '/call-billing': 'call_billing',
  '/scheduler': 'shift_scheduler',
  '/user-management': 'user_management',
  '/config/users': 'user_management',
  '/holidays': 'holiday_management',
  '/holidays/admin': 'holiday_admin_panel',
  '/holidays/settings': 'holiday_admin_panel',
  '/leave-types': 'leave_types_config',
  '/config/packages': 'packages_pricing',
  '/reports': 'status_reports',
  '/chat': 'chat',
  '/database-reset': 'database_reset',
  '/checklist-templates': 'daily_checklist',
};

interface PermissionsPayload {
  permissions: PermissionEntry[];
  role: string | null;
}

export function usePermissions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  type ProfileRoleResponse = PostgrestSingleResponse<{ role: string | null }>;
  type PermissionsResponse = PostgrestSingleResponse<PermissionEntry[]>;

  const { data, isLoading, isError } = useQuery<PermissionsPayload>({
    queryKey: ['permissions', user?.id ?? null],
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
    queryFn: async () => {
      if (!user) return { permissions: [], role: null };
      // Bounded: if the RPC/query stalls, throw so react-query surfaces
      // `isError` and the guard can render a Retry panel (not redirect).
      const profileRes = await withTimeout(
        asPromise(
          supabase.from('profiles').select('role').eq('user_id', user.id).single()
        ) as Promise<ProfileRoleResponse>,
        PERMISSIONS_TIMEOUT_MS,
        'profiles.select(role)',
      );
      const permsRes = await withTimeout(
        asPromise(supabase.rpc('get_my_permissions')) as Promise<PermissionsResponse>,
        PERMISSIONS_TIMEOUT_MS,
        'rpc:get_my_permissions',
      );
      if (permsRes.error) {
        console.error('Error loading permissions');
        throw new Error('permissions_rpc_error');
      }
      return {
        permissions: (permsRes.data as PermissionEntry[] | null) ?? [],
        role: profileRes.data?.role ?? null,
      };
    },
  });

  const permissions = data?.permissions ?? [];
  const userRole = data?.role ?? null;

  const permissionMap = useMemo(() => {
    const map = new Map<string, PermissionEntry>();
    permissions.forEach((p) => {
      map.set(`${p.section}:${p.feature}`, p);
    });
    return map;
  }, [permissions]);

  const can = useCallback(
    (module: ModuleKey, feature: PermissionFeature): boolean => {
      if (userRole === 'Super-Admin') return true;
      const entry = permissionMap.get(`${module}:${feature}`);
      return entry?.granted ?? false;
    },
    [permissionMap, userRole]
  );

  const getScope = useCallback(
    (module: ModuleKey): PermissionScope => {
      if (userRole === 'Super-Admin') return 'all';
      const entry = permissionMap.get(`${module}:view`);
      return (entry?.scope as PermissionScope) ?? 'none';
    },
    [permissionMap, userRole]
  );

  const isMenuVisible = useCallback(
    (module: ModuleKey): boolean => can(module, 'menu_visible'),
    [can]
  );

  const canAccessPage = useCallback(
    (module: ModuleKey): boolean => can(module, 'page_access'),
    [can]
  );

  const isSuperAdmin = userRole === 'Super-Admin';
  const isSupervisor = userRole === 'Supervisor';
  const isOperator = userRole === 'Operator';

  const refreshPermissions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['permissions', user?.id ?? null] });
  }, [queryClient, user?.id]);

  return {
    can,
    getScope,
    isMenuVisible,
    canAccessPage,
    isLoading,
    isError,
    userRole,
    isSuperAdmin,
    isSupervisor,
    isOperator,
    refreshPermissions,
  };
}
