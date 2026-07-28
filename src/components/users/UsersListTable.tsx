import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Edit, Trash2, Search, Eye, Plus, UserPlus, Shield, RefreshCw, Bell, ShieldAlert, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EnhancedUserDialog } from "./EnhancedUserDialog";
import { PresenceAlertSettingsDialog } from "./PresenceAlertSettingsDialog";
import { UserSuspensionDialog, type SuspensionOverviewRow } from "./UserSuspensionDialog";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SystemUser {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

interface PresenceInfo {
  status: string;
  last_heartbeat_at: string | null;
  last_updated: string | null;
}

const formatRelative = (iso: string | null) => {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Never';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB');
};

const formatExact = (iso: string | null) => {
  if (!iso) return 'No record';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No record';
  return d.toLocaleString('en-GB');
};

export function UsersListTable() {
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [presence, setPresence] = useState<Record<string, PresenceInfo>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [, setTick] = useState(0);
  const [alertSettingsOpen, setAlertSettingsOpen] = useState(false);
  const [suspensionDialogOpen, setSuspensionDialogOpen] = useState(false);
  const [suspensionTarget, setSuspensionTarget] = useState<SystemUser | null>(null);
  const [suspensions, setSuspensions] = useState<Record<string, SuspensionOverviewRow>>({});
  const { user: currentAuthUser } = useAuth();
  const { isSuperAdmin, userRole } = usePermissions();
  const canManageAlerts = isSuperAdmin || userRole === "Admin";

  // Refresh relative timestamps every 30s
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const loadPresence = async () => {
    const { data } = await supabase
      .from('user_statuses')
      .select('user_id, status, last_heartbeat_at, updated_at');
    const map: Record<string, PresenceInfo> = {};
    (data ?? []).forEach((s: any) => {
      map[s.user_id] = {
        status: s.status,
        last_heartbeat_at: s.last_heartbeat_at ?? null,
        last_updated: s.updated_at ?? null,
      };
    });
    setPresence(map);
  };

  const loadSuspensions = async () => {
    const { data, error } = await supabase.rpc('get_user_suspension_overview');
    if (error) return; // non-authorised administrators simply see no controls
    const map: Record<string, SuspensionOverviewRow> = {};
    ((data as SuspensionOverviewRow[] | null) ?? []).forEach((row) => {
      map[row.user_id] = row;
    });
    setSuspensions(map);
  };

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_all_system_users_for_management_secure');
      
      if (error) {
        console.error('Error loading users:', error);
        toast.error('Failed to load users. Please ensure you have the required permissions.');
        return;
      }
      
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users. Please ensure you have the required permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadPresence();
    loadSuspensions();
    const channel = supabase
      .channel(`users-list-presence-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_statuses' }, () => {
        loadPresence();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleUserCreated = async () => {
    await loadUsers();
    setSelectedUser(null);
    setIsEditing(false);
  };

  const handleEdit = (user: SystemUser) => {
    setSelectedUser(user);
    setIsEditing(true);
    setDialogOpen(true);
  };

  const handleAddNew = () => {
    setSelectedUser(null);
    setIsEditing(false);
    setDialogOpen(true);
  };

  const handleDelete = async (userId: string) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      try {
        const { data, error } = await supabase.rpc('admin_delete_system_user', {
          p_id: userId
        });

        if (error) {
          console.error('Error deleting user:', error);
          toast.error('Failed to delete user. Please ensure you have the required permissions.');
          return;
        }
        
        toast.success('User deleted successfully');
        loadUsers();
      } catch (error: any) {
        console.error('Error deleting user:', error);
        toast.error('Failed to delete user. Please ensure you have the required permissions.');
      }
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "Active":
        return "default";
      case "On Leave":
        return "secondary";
      case "Inactive":
        return "destructive";
      default:
        return "outline";
    }
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h3 className="text-lg font-semibold">System Users</h3>
          <Button disabled className="gap-2">
            <Plus className="h-4 w-4" />
            Add New User
          </Button>
        </div>
        <div className="text-center py-8">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Create Button */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-semibold">System Users</h3>
        <div className="flex gap-2">
          <Button 
            onClick={loadUsers} 
            variant="outline" 
            size="sm"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          {canManageAlerts && (
            <Button
              onClick={() => setAlertSettingsOpen(true)}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Bell className="h-4 w-4" />
              Alert settings
            </Button>
          )}
          <Button onClick={handleAddNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Add New User
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredUsers.length} of {users.length} users
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">User</TableHead>
              <TableHead className="hidden md:table-cell">Role</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Presence</TableHead>
              <TableHead className="hidden lg:table-cell">Last seen</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'No users found matching your search.' : 'No users found.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="min-w-[200px]">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="text-xs">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{user.name}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {user.email}
                        </div>
                        {/* Mobile: Show additional info */}
                        <div className="md:hidden mt-1 space-y-1">
                          <Badge variant="outline" className="text-xs">
                            {user.role}
                          </Badge>
                          {(() => {
                            const p = presence[user.user_id];
                            const isOnline = p && p.status !== 'offline';
                            return (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span
                                  className={`inline-block h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                                  aria-hidden
                                />
                                <span>{isOnline ? 'Online' : 'Offline'} · {formatRelative(p?.last_heartbeat_at ?? p?.last_updated ?? null)}</span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {suspensions[user.user_id]?.is_suspended ? (
                      <div className="space-y-1">
                        <Badge variant="destructive" className="text-xs">Suspended</Badge>
                        <div className="text-xs text-muted-foreground max-w-[220px]">
                          <div className="truncate" title={suspensions[user.user_id]?.reason ?? ''}>
                            {suspensions[user.user_id]?.reason || 'No reason recorded'}
                          </div>
                          <div>{formatExact(suspensions[user.user_id]?.state_entered_at ?? null)}</div>
                          <div>By {suspensions[user.user_id]?.actor_name || 'Unknown'}</div>
                          {suspensions[user.user_id]?.suspend_until && (
                            <div>Until {formatExact(suspensions[user.user_id]?.suspend_until ?? null)}</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <Badge variant={getStatusVariant(user.status) as any} className="text-xs">
                        {user.status}
                      </Badge>
                    )}
                  </TableCell>
                  {(() => {
                    const p = presence[user.user_id];
                    const isOnline = p && p.status !== 'offline';
                    const lastIso = p?.last_heartbeat_at ?? p?.last_updated ?? null;
                    return (
                      <>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-2" title={isOnline ? 'Online' : 'Offline'}>
                            <span
                              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                              aria-hidden
                            >
                              {isOnline && (
                                <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-60 animate-ping" />
                              )}
                            </span>
                            <span className={`text-xs font-medium ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                              {isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span
                            className="text-xs text-muted-foreground"
                            title={formatExact(lastIso)}
                          >
                            {formatRelative(lastIso)}
                          </span>
                        </TableCell>
                      </>
                    );
                  })()}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(user)}
                        className="h-8 w-8 p-0"
                        title="Edit User"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {canManageSuspension && user.user_id !== currentAuthUser?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setSuspensionTarget(user); setSuspensionDialogOpen(true); }}
                          className="h-8 w-8 p-0"
                          title={suspensions[user.user_id]?.is_suspended ? 'Reinstate User' : 'Suspend User'}
                        >
                          {suspensions[user.user_id]?.is_suspended
                            ? <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            : <ShieldAlert className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(user.id)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        title="Delete User"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg border p-4">
          <div className="text-2xl font-bold text-center">{users.length}</div>
          <div className="text-sm text-muted-foreground text-center">Total Users</div>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <div className="text-2xl font-bold text-center">
            {users.filter(u => u.status === 'Active').length}
          </div>
          <div className="text-sm text-muted-foreground text-center">Active Users</div>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <div className="text-2xl font-bold text-center">
            {users.filter(u => u.role === 'Admin' || u.role === 'Super-Admin').length}
          </div>
          <div className="text-sm text-muted-foreground text-center">Administrators</div>
        </div>
      </div>


      <EnhancedUserDialog
        open={dialogOpen}
        setOpen={setDialogOpen}
        user={selectedUser}
        onUserSaved={handleUserCreated}
      />

      {canManageAlerts && currentAuthUser?.id && (
        <PresenceAlertSettingsDialog
          userId={currentAuthUser.id}
          open={alertSettingsOpen}
          onOpenChange={setAlertSettingsOpen}
        />
      )}
    </div>
  );
}