import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { SystemUser, useUsers } from "@/context/UsersContext";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function Users() {
  const { users, addUser, updateUser, deleteUser } = useUsers();

  // Dialog and form state
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<SystemUser, "id">>({
    name: "",
    role: "Operator",
    email: "",
    status: "Active",
  });

  const title = useMemo(() => (mode === "add" ? "Add User" : "Edit User"), [mode]);

  const resetForm = () => {
    setForm({ name: "", role: "Operator", email: "", status: "Active" });
    setEditingId(null);
  };

  const handleAddClick = () => {
    setMode("add");
    resetForm();
    setOpen(true);
  };

  const handleEditClick = (u: SystemUser) => {
    setMode("edit");
    setEditingId(u.id);
    setForm({ name: u.name, role: u.role, email: u.email, status: u.status });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    const user = users.find((u) => u.id === id);
    if (!user) return;
    if (!window.confirm(`Delete user "${user.name}"? This cannot be undone.`)) return;
    await deleteUser(id);
    toast({ title: "User deleted", description: `${user.name} has been removed.` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Minimal validation
    if (!form.name.trim()) {
      toast({ title: "Name is required", description: "Please enter a name.", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email.", variant: "destructive" });
      return;
    }

    if (mode === "add") {
      const newUser = await addUser(form);
      if (newUser) {
        toast({ title: "User added", description: `${newUser.name} was created successfully.` });
      } else {
        toast({ title: "Error", description: "Failed to create user.", variant: "destructive" });
      }
    } else if (mode === "edit" && editingId) {
      await updateUser(editingId, form);
      toast({ title: "User updated", description: `${form.name} was updated.` });
    }

    setOpen(false);
    resetForm();
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Manage users to assign to tasks and to-do items." />
        <link rel="canonical" href={window.location.origin + "/config/users"} />
      </Helmet>

      <GradientBackdrop />

      <StandardNavigation currentPage="users" />

      <main className="container max-w-[2000px] px-3 py-4 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gradient">System Users</h1>
            <p className="text-muted-foreground">Manage users to assign to tasks and to-do items</p>
          </div>
        </div>
        <section>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>Users available for task and to-do assignment</CardDescription>
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleAddClick}>
                    <Plus className="h-4 w-4 mr-2" /> Add User
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleSubmit}>
                    <DialogHeader>
                      <DialogTitle>{title}</DialogTitle>
                      <DialogDescription>
                        {mode === "add" ? "Create a new user profile." : "Update user details."}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@example.com" />
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>Role</Label>
                          <Select value={form.role} onValueChange={(v: SystemUser["role"]) => setForm((f) => ({ ...f, role: v }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Operator">Operator</SelectItem>
                              <SelectItem value="Supervisor">Supervisor</SelectItem>
                              <SelectItem value="Admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label>Status</Label>
                          <Select value={form.status} onValueChange={(v: SystemUser["status"]) => setForm((f) => ({ ...f, status: v }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Active">Active</SelectItem>
                              <SelectItem value="On Leave">On Leave</SelectItem>
                              <SelectItem value="Inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                      <Button type="submit">{mode === "add" ? "Create" : "Save changes"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id} className="border-b last:border-0">
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell>{u.role}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email || 'Protected for security'}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            {u.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button asChild variant="ghost" size="sm">
                            <Link to="/todo#users-section">ToDo Users</Link>
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <Link to="/tasks#users-section">Task Users</Link>
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleEditClick(u)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(u.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
