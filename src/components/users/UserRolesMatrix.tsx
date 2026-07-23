import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { 
  Check, X, Shield, Users, Calendar, CreditCard, Building, FileText, 
  UserCheck, MessageCircle, Settings, LayoutDashboard, RefreshCw, Edit, 
  Save, Eye, Plus, Trash2, Database, Lock, Phone, Package, BarChart3, Clock
} from 'lucide-react';

interface PermissionMatrixRow {
  id: string;
  section: string;
  feature: string;
  icon: string;
  description: string;
  role: string;
  granted: boolean;
  scope: string;
}

interface SystemUserForRoles {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

const iconComponents: { [key: string]: React.ComponentType<any> } = {
  LayoutDashboard, Users, UserCheck, BarChart3, MessageCircle, Shield,
  Eye, Calendar, Settings, CreditCard, Phone, FileText, Building, Edit,
  Trash2, Plus, Check, Database, Lock, Package, Clock
};

const MODULE_LABELS: Record<string, string> = {
  home_page: 'Home Page',
  daily_handover: 'Daily Handover',
  daily_checklist: 'Daily Checklist Templates',
  task_manager: 'Task Manager',
  noticeboard: 'Noticeboard',
  news: 'Company Announcements',
  customer_directory: 'Customer Directory',
  crm_dashboard: 'CRM Dashboard',
  call_billing: 'Call Billing',
  shift_scheduler: 'Shift Scheduler',
  user_management: 'User Management',
  holiday_management: 'Holiday Management',
  holiday_admin_panel: 'Holiday Admin Panel',
  leave_types_config: 'Leave Types Config',
  packages_pricing: 'Packages & Pricing',
  status_reports: 'Status Reports',
  chat: 'Chat',
  documents: 'Documents',
  database_reset: 'Database Reset',
};

const FEATURE_LABELS: Record<string, string> = {
  menu_visible: 'Menu',
  page_access: 'Access',
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  assign: 'Assign',
  approve: 'Approve',
  export: 'Export',
  manage_settings: 'Settings',
};

const FEATURE_ORDER = ['menu_visible', 'page_access', 'view', 'create', 'edit', 'delete', 'assign', 'approve', 'export', 'manage_settings'];
const ROLES = ['Super-Admin', 'Supervisor', 'Operator'];
const SCOPES = ['all', 'team', 'own', 'assigned', 'none'];

export function UserRolesMatrix() {
  const [matrixData, setMatrixData] = useState<PermissionMatrixRow[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUserForRoles[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingModule, setEditingModule] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<string, { granted?: boolean; scope?: string }>>(new Map());
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [matrixResult, usersResult, profileResult] = await Promise.all([
        (supabase as any).rpc('get_permissions_matrix_secure'),
        (supabase as any).rpc('get_all_system_users_for_management_secure'),
        supabase.from('profiles').select('role').eq('user_id', user?.id || '').single(),
      ]);

      if (matrixResult.error) throw matrixResult.error;
      setMatrixData(matrixResult.data || []);
      setSystemUsers(usersResult.data || []);
      setCurrentUserRole(profileResult.data?.role || '');
    } catch (error) {
      console.error('Error loading permissions:', error);
      toast({ title: "Error", description: "Failed to load permissions matrix", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingUserId(userId);
    try {
      const { error } = await supabase.rpc('admin_update_system_user', { p_id: userId, p_role: newRole });
      if (error) throw error;

      const userToUpdate = systemUsers.find(u => u.id === userId);
      if (userToUpdate) {
        await supabase.from('profiles').update({ role: newRole as any }).eq('user_id', userToUpdate.user_id);
      }

      toast({ title: "Success", description: "User role updated successfully" });
      await fetchData();
    } catch (error) {
      console.error('Error updating role:', error);
      toast({ title: "Error", description: "Failed to update user role", variant: "destructive" });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggle = (permId: string, role: string, field: 'granted' | 'scope', value: boolean | string) => {
    const key = `${permId}:${role}`;
    setPendingChanges((previous) => {
      const existing = previous.get(key) || {};
      const updated = new Map(previous);
      updated.set(key, { ...existing, [field]: value });
      return updated;
    });
  };

  const saveChanges = async (module: string) => {
    setIsSaving(true);
    // Only server-confirmed outcomes (ok / noop) clear their pending change.
    // Denied outcomes and any technical failure (RPC error, network failure,
    // empty result) preserve the pending change so the user can review it.
    const confirmedClearKeys = new Set<string>();
    const denials: string[] = [];
    let okCount = 0;
    let noopCount = 0;
    let technicalFailure = false;

    try {
      for (const [key, changes] of pendingChanges.entries()) {
        const [permId, role] = key.split(':');
        const row = matrixData.find(r => r.id === permId && r.role === role);
        if (!row) continue;
        if (row.section !== module) continue;

        const { data, error } = await supabase.rpc('update_permission_grant', {
          p_permission_id: permId,
          p_role: role,
          p_granted: changes.granted ?? row.granted,
          p_scope: changes.scope ?? row.scope,
        });
        if (error) throw error;

        const result = Array.isArray(data) ? data[0] : data;
        // Empty RPC response is a hard technical failure.
        if (!result) {
          throw new Error(`Permission update returned no result for ${row.feature} / ${role}`);
        }

        if (result.outcome === 'ok') {
          okCount++;
          confirmedClearKeys.add(key);
        } else if (result.outcome === 'noop') {
          noopCount++;
          confirmedClearKeys.add(key);
        } else {
          denials.push(`${row.feature} / ${role}: ${result.outcome_message ?? result.outcome_code}`);
        }
      }
    } catch (error) {
      technicalFailure = true;
      console.error('Error saving:', error);
      toast({
        title: 'Error',
        description: 'Failed to save permissions. Unconfirmed changes have been preserved.',
        variant: 'destructive',
      });
    }

    if (confirmedClearKeys.size > 0) {
      setPendingChanges(prev => {
        const next = new Map(prev);
        for (const k of confirmedClearKeys) next.delete(k);
        return next;
      });
    }

    if (!technicalFailure) {
      setEditingModule(null);
      if (denials.length > 0) {
        toast({
          title: `${MODULE_LABELS[module]}: ${denials.length} change(s) denied`,
          description:
            denials.slice(0, 4).join(' • ') +
            (denials.length > 4 ? ` (+${denials.length - 4} more)` : ''),
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Success',
          description: `${MODULE_LABELS[module]} permissions saved (${okCount} updated, ${noopCount} unchanged)`,
        });
      }
    }

    await fetchData();
    setIsSaving(false);
  };


  const cancelEditing = () => {
    if (editingModule) {
      const updated = new Map(pendingChanges);
      for (const [key] of updated.entries()) {
        const [permId] = key.split(':');
        const row = matrixData.find(r => r.id === permId);
        if (row?.section === editingModule) updated.delete(key);
      }
      setPendingChanges(updated);
    }
    setEditingModule(null);
  };

  const getEffectiveValue = (permId: string, role: string, field: 'granted' | 'scope') => {
    const key = `${permId}:${role}`;
    const pending = pendingChanges.get(key);
    if (pending && field in pending) return pending[field];
    const row = matrixData.find(r => r.id === permId && r.role === role);
    return field === 'granted' ? (row?.granted ?? false) : (row?.scope ?? 'none');
  };

  // Group data by module
  const modules = [...new Set(matrixData.map(r => r.section))].sort();
  const isSuperAdmin = currentUserRole === 'Super-Admin';

  if (isLoading) {
    return <div className="text-center py-8">Loading permissions matrix...</div>;
  }

  return (
    <div className="space-y-6">
      {/* User Role Assignment - Super Admin only */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Assign User Roles
            </CardTitle>
            <CardDescription>Change user roles. Only Super-Admin, Supervisor, and Operator roles are available.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Current Role</TableHead>
                    <TableHead>Change Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemUsers.map(su => (
                    <TableRow key={su.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{su.name}</p>
                          <p className="text-xs text-muted-foreground">{su.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={su.role === 'Super-Admin' ? 'destructive' : su.role === 'Supervisor' ? 'default' : 'outline'}>
                          {su.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={su.role}
                          onValueChange={(val) => handleRoleChange(su.id, val)}
                          disabled={updatingUserId === su.id}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map(role => (
                              <SelectItem key={role} value={role}>{role}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={su.status === 'Active' ? 'outline' : 'secondary'}>{su.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Permissions Matrix by Module */}
      {modules.map(module => {
        const modulePerms = matrixData.filter(r => r.section === module);
        const features = [...new Set(modulePerms.map(r => r.feature))].sort(
          (a, b) => FEATURE_ORDER.indexOf(a) - FEATURE_ORDER.indexOf(b)
        );
        const isEditing = editingModule === module;
        const firstRow = modulePerms[0];
        const IconComp = iconComponents[firstRow?.icon || 'Settings'] || Settings;

        return (
          <Card key={module}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <IconComp className="h-4 w-4" />
                  {MODULE_LABELS[module] || module}
                </CardTitle>
                {isSuperAdmin && (
                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <Button size="sm" variant="outline" onClick={cancelEditing} disabled={isSaving}>Cancel</Button>
                        <Button size="sm" onClick={() => saveChanges(module)} disabled={isSaving}>
                          <Save className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setEditingModule(module)}>
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Role</TableHead>
                      {features.map(f => (
                        <TableHead key={f} className="text-center text-xs px-1 min-w-[60px]">
                          {FEATURE_LABELS[f] || f}
                        </TableHead>
                      ))}
                      <TableHead className="text-center text-xs min-w-[90px]">Scope</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ROLES.map(role => {
                      // Find the permission IDs for this module+role
                      const rolePerms = features.map(feature => {
                        return modulePerms.find(r => r.feature === feature && r.role === role);
                      });

                      // Get scope from the first permission for this role
                      const scopePerm = rolePerms.find(r => r);
                      const currentScope = scopePerm ? getEffectiveValue(scopePerm.id, role, 'scope') as string : 'none';

                      return (
                        <TableRow key={role}>
                          <TableCell>
                            <Badge 
                              variant={role === 'Super-Admin' ? 'destructive' : role === 'Supervisor' ? 'default' : 'outline'}
                              className="text-xs"
                            >
                              {role}
                            </Badge>
                          </TableCell>
                          {rolePerms.map((perm, idx) => {
                            if (!perm) return <TableCell key={idx} className="text-center">-</TableCell>;
                            const granted = getEffectiveValue(perm.id, role, 'granted') as boolean;
                            const canEdit = isEditing && role !== 'Super-Admin';

                            return (
                              <TableCell key={perm.feature} className="text-center px-1">
                                {canEdit ? (
                                  <Switch
                                    checked={granted}
                                    onCheckedChange={(val) => handleToggle(perm.id, role, 'granted', val)}
                                    className="mx-auto"
                                  />
                                ) : (
                                  granted ? (
                                    <Check className="h-4 w-4 text-green-600 mx-auto" />
                                  ) : (
                                    <X className="h-4 w-4 text-red-400 mx-auto" />
                                  )
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center">
                            {isEditing && role !== 'Super-Admin' && scopePerm ? (
                              <Select
                                value={currentScope}
                                onValueChange={(val) => {
                                  // Apply scope to all perms for this role+module
                                  rolePerms.forEach(p => {
                                    if (p) handleToggle(p.id, role, 'scope', val);
                                  });
                                }}
                              >
                                <SelectTrigger className="w-20 h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {SCOPES.map(s => (
                                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline" className="text-xs capitalize">{currentScope}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh All
        </Button>
      </div>
    </div>
  );
}
