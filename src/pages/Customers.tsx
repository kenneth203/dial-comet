import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCustomers } from "@/context/CustomersContext";
import { CustomerDetailsForm } from "@/components/customers/CustomerDetailsForm";
import { MergeCustomersDialog } from "@/components/customers/MergeCustomersDialog";
import { MoreHorizontal, Plus, Merge, Edit, Trash, Filter, Download, Upload, PhoneCall, PhoneOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ImportCustomersDialog } from "@/components/customers/ImportCustomersDialog";
import { usePermissions } from "@/hooks/usePermissions";

export default function Customers() {
  const { customers, loading, addCustomer, updateCustomer, deleteCustomer, mergeCustomers } = useCustomers();
  const { can, isOperator } = usePermissions();
  const canCreate = can('customer_directory', 'create');
  const canEdit = can('customer_directory', 'edit');
  const canDelete = can('customer_directory', 'delete');
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{
    customerData: any;
    duplicates: Array<{ name: string; reasons: string[] | null; score: number }>;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Paused' | 'Lead'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkScriptAction, setBulkScriptAction] = useState<'enable' | 'disable' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const baseCustomers = isOperator ? customers.filter(c => c.status !== 'Lead') : customers;
  const effectiveStatusFilter = isOperator && statusFilter === 'Lead' ? 'all' : statusFilter;
  const visibleCustomers = baseCustomers.filter(c => effectiveStatusFilter === 'all' || c.status === effectiveStatusFilter);
  const allVisibleSelected = visibleCustomers.length > 0 && visibleCustomers.every(c => selectedIds.has(c.id));
  const someVisibleSelected = visibleCustomers.some(c => selectedIds.has(c.id));

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      visibleCustomers.forEach(c => { if (checked) next.add(c.id); else next.delete(c.id); });
      return next;
    });
  };

  const applyBulkScriptToggle = async (enable: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const id of ids) {
      const res = await updateCustomer(id, { hasInboundCallScript: enable } as any);
      if (res) ok++; else fail++;
    }
    setBulkBusy(false);
    setBulkScriptAction(null);
    setSelectedIds(new Set());
    toast({
      title: `Updated ${ok} customer${ok === 1 ? '' : 's'}`,
      description: fail > 0
        ? `${fail} failed. "Has inbound call script" set to ${enable ? 'ON' : 'OFF'}.`
        : `"Has inbound call script" set to ${enable ? 'ON' : 'OFF'}.`,
      variant: fail > 0 ? 'destructive' : undefined,
    });
  };

  const handleEdit = (customer: any) => {
    setSelectedCustomer(customer);
    setShowEditForm(true);
  };

  const handleDelete = (customer: any) => {
    setSelectedCustomer(customer);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (selectedCustomer) {
      deleteCustomer(selectedCustomer.id);
      toast({
        title: "Customer deleted",
        description: `${selectedCustomer.name} has been removed.`,
      });
      setShowDeleteDialog(false);
      setSelectedCustomer(null);
    }
  };

  const handleAddCustomer = async (customerData: any, opts?: { skipDuplicateCheck?: boolean }) => {
    const result = await addCustomer(customerData, opts);
    if (result && (result as any).duplicates && (result as any).duplicates.length > 0) {
      setDuplicateConfirm({ customerData, duplicates: (result as any).duplicates });
      return false;
    }
    setDuplicateConfirm(null);
    toast({
      title: "Customer added",
      description: `${customerData.name} has been added successfully.`,
    });
    return true;
  };

  const handleUpdateCustomer = async (customerData: any) => {
    if (selectedCustomer) {
      const success = await updateCustomer(selectedCustomer.id, customerData);
      if (!success) {
        toast({
          title: "Customer not saved",
          description: "Your changes were kept as a local draft. Please sign in and try again.",
          variant: "destructive",
        });
        return false;
      }
      toast({
        title: "Customer updated",
        description: `${customerData.name} has been updated successfully.`,
      });
      // Form will stay open automatically now - no need to close it
      return true;
    }
    return false;
  };

  const handleMergeCustomers = (targetId: string, sourceId: string) => {
    const target = customers.find(c => c.id === targetId);
    const source = customers.find(c => c.id === sourceId);
    
    mergeCustomers(targetId, sourceId);
    toast({
      title: "Customers merged",
      description: `${source?.name} has been merged into ${target?.name}.`,
    });
  };

  const handleExportCsv = () => {
    if (!customers.length) {
      toast({ title: "No customers to export", variant: "destructive" });
      return;
    }
    const flatten = (v: any): string => {
      if (v === null || v === undefined) return '';
      if (v instanceof Date) return v.toISOString();
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    };
    const keySet = new Set<string>();
    customers.forEach(c => Object.keys(c).forEach(k => keySet.add(k)));
    const keys = Array.from(keySet);
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = [
      keys.map(escape).join(','),
      ...customers.map(c => keys.map(k => escape(flatten((c as any)[k]))).join(',')),
    ];
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-directory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Export ready", description: `${customers.length} customers exported.` });
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Manage customer information: contacts, accounts, and statuses." />
        <link rel="canonical" href={window.location.origin + "/config/customers"} />
      </Helmet>

      <GradientBackdrop />

      <StandardNavigation currentPage="customers" />

      <main className="container max-w-[2000px] py-3 sm:py-6 px-3 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 sm:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gradient">Customer Directory</h1>
            <p className="text-muted-foreground">Manage customer information, contacts, accounts, and statuses</p>
          </div>
        </div>
        <section>
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div>
                <CardTitle>Customer Directory</CardTitle>
                <CardDescription>All customers with key contact details</CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                {canCreate && (
                  <Button onClick={() => setShowAddForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Customer
                  </Button>
                )}
                <Button variant="outline" onClick={handleExportCsv}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                {canCreate && (
                  <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import CSV
                  </Button>
                )}
                {canEdit && (
                  <Button variant="outline" onClick={() => setShowMergeDialog(true)}>
                    <Merge className="h-4 w-4 mr-2" />
                    Merge
                  </Button>
                )}
                <div className="flex items-center gap-1 border rounded-md px-1">
                  {(['all', 'Active', 'Paused', 'Lead'] as const)
                    .filter(s => !(isOperator && s === 'Lead'))
                    .map((s) => (
                    <Button
                      key={s}
                      variant={statusFilter === s ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setStatusFilter(s)}
                      className="h-7 text-xs"
                    >
                      {s === 'all' ? 'All' : s}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {canEdit && selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-md border bg-muted/40">
                  <span className="text-sm font-medium">
                    {selectedIds.size} selected
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkBusy}
                    onClick={() => setBulkScriptAction('enable')}
                  >
                    <PhoneCall className="h-4 w-4 mr-2" />
                    Enable call script
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkBusy}
                    onClick={() => setBulkScriptAction('disable')}
                  >
                    <PhoneOff className="h-4 w-4 mr-2" />
                    Disable call script
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={bulkBusy}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear
                  </Button>
                </div>
              )}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading customers...</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {canEdit && (
                          <TableHead className="w-10">
                            <Checkbox
                              checked={allVisibleSelected ? true : (someVisibleSelected ? 'indeterminate' : false)}
                              onCheckedChange={(v) => toggleAllVisible(!!v)}
                              aria-label="Select all visible customers"
                            />
                          </TableHead>
                        )}
                        <TableHead>Name</TableHead>
                        <TableHead>Primary Contact</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleCustomers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={canEdit ? 7 : 6} className="text-center py-8 text-muted-foreground">
                            No customers found. Click "Add Customer" to get started.
                          </TableCell>
                        </TableRow>
                      ) : (
                        visibleCustomers.map((customer) => (
                          <TableRow key={customer.id} className="border-b last:border-0">
                            {canEdit && (
                              <TableCell className="w-10">
                                <Checkbox
                                  checked={selectedIds.has(customer.id)}
                                  onCheckedChange={(v) => toggleOne(customer.id, !!v)}
                                  aria-label={`Select ${customer.name}`}
                                />
                              </TableCell>
                            )}
                            <TableCell className="font-medium">{customer.name}</TableCell>
                            <TableCell>{customer.contact}</TableCell>
                            <TableCell className="text-muted-foreground">{customer.email}</TableCell>
                            <TableCell>{customer.phone}</TableCell>
                            <TableCell>
                              <Badge variant={
                                customer.status === 'Active' ? 'default' :
                                customer.status === 'Lead' ? 'secondary' : 'outline'
                              } className={
                                customer.status === 'Active' ? 'bg-green-600 hover:bg-green-700' :
                                customer.status === 'Lead' ? 'bg-blue-600 hover:bg-blue-700 text-white' :
                                ''
                              }>
                                {customer.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 justify-end">
                                {canEdit && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleEdit(customer)}
                                    aria-label="Edit customer"
                                    title="Edit"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => handleDelete(customer)}
                                    aria-label="Delete customer"
                                    title="Delete"
                                  >
                                    <Trash className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <ImportCustomersDialog
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
        />

        <CustomerDetailsForm
          isOpen={showAddForm}
          onClose={() => setShowAddForm(false)}
          onSubmit={handleAddCustomer}
          title="Add New Customer"
        />

        <CustomerDetailsForm
          isOpen={showEditForm}
          onClose={() => {
            setShowEditForm(false);
            setSelectedCustomer(null);
          }}
          onSubmit={handleUpdateCustomer}
          initialData={selectedCustomer}
          title="Edit Customer"
        />

        <MergeCustomersDialog
          isOpen={showMergeDialog}
          onClose={() => setShowMergeDialog(false)}
          onMerge={handleMergeCustomers}
          customers={customers}
        />

        <AlertDialog
          open={!!bulkScriptAction}
          onOpenChange={(open) => { if (!open && !bulkBusy) setBulkScriptAction(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {bulkScriptAction === 'enable' ? 'Enable' : 'Disable'} call script for {selectedIds.size} customer{selectedIds.size === 1 ? '' : 's'}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {bulkScriptAction === 'enable'
                  ? 'These customers will appear in the call-script dropdown on the main screen.'
                  : 'These customers will be hidden from the call-script dropdown on the main screen. They remain in the directory, billing, and tasks.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={bulkBusy}
                onClick={(e) => { e.preventDefault(); applyBulkScriptToggle(bulkScriptAction === 'enable'); }}
              >
                {bulkBusy ? 'Updating…' : 'Confirm'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={!!duplicateConfirm}
          onOpenChange={(open) => { if (!open) setDuplicateConfirm(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Possible Duplicate Customer</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    "{duplicateConfirm?.customerData?.name}" looks similar to an existing customer.
                    Review the matches below and choose whether to continue.
                  </p>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    {duplicateConfirm?.duplicates?.slice(0, 5).map((d, i) => {
                      const reasons = (d.reasons && d.reasons.length > 0)
                        ? d.reasons.join(', ')
                        : `similarity ${Math.round((d.score || 0) * 100)}%`;
                      return (
                        <li key={i}>
                          <span className="font-medium">{d.name}</span> — matched on {reasons}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    If this is genuinely a separate company (for example, two businesses with the
                    same owner), click <span className="font-medium">Continue &amp; Add</span> to
                    save it anyway.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!duplicateConfirm) return;
                  const data = duplicateConfirm.customerData;
                  setDuplicateConfirm(null);
                  await handleAddCustomer(data, { skipDuplicateCheck: true });
                }}
              >
                Continue &amp; Add
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Customer</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {selectedCustomer?.name}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSelectedCustomer(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
