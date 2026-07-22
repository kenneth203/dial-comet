import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Clock, TrendingUp, AlertTriangle, PoundSterling, Users, Search,
  ChevronDown, ChevronRight, Download, FileText, Filter,
  CheckCircle, AlertCircle, XCircle, Calendar, Receipt, Send
} from "lucide-react";
import { useCustomers, type Customer } from "@/context/CustomersContext";
import { useTasks, type TMTask } from "@/context/TasksContext";
import { useUsers } from "@/context/UsersContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths, addMonths } from "date-fns";
import { formatGBP } from "@/lib/currency";

type BillingStatus = "within_package" | "near_limit" | "over_package" | "no_package";
type SortOption = "name" | "time_used" | "overage_amount" | "over_first";

interface CustomerBillingData {
  customer: Customer;
  tasks: TMTask[];
  totalTimeUsedSeconds: number;
  totalTimeUsedHours: number;
  packageAllowanceHours: number;
  remainingHours: number;
  overageHours: number;
  overageRate: number;
  extraBillableAmount: number;
  billingStatus: BillingStatus;
  packageName: string;
  usagePercent: number;
}

function getMonthOptions() {
  const options = [];
  for (let i = -2; i <= 1; i++) {
    const d = i === 0 ? new Date() : (i < 0 ? subMonths(new Date(), Math.abs(i)) : addMonths(new Date(), i));
    options.push({ value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") });
  }
  return options;
}

export default function InvoiceTasksDashboard() {
  const { customers } = useCustomers();
  const { tasks } = useTasks();
  const { users } = useUsers();

  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTeamMember, setFilterTeamMember] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("over_first");
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [invoicingCustomerId, setInvoicingCustomerId] = useState<string | null>(null);
  const [invoicingAll, setInvoicingAll] = useState(false);
  const [invoicedCustomers, setInvoicedCustomers] = useState<Set<string>>(new Set());

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const periodStart = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return startOfMonth(new Date(y, m - 1));
  }, [selectedMonth]);

  const periodEnd = useMemo(() => endOfMonth(periodStart), [periodStart]);

  // Filter tasks for the selected month - exclude already invoiced tasks for this period
  const periodTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.isInternal) return false;
      if (!t.totalTime || t.totalTime === 0) return false;
      // Exclude tasks already invoiced for this period
      const row = t as any;
      if (row.invoicedAt && row.invoicedPeriod === selectedMonth) return false;
      return true;
    });
  }, [tasks, periodStart, periodEnd, selectedMonth]);

  // Build customer billing data
  const customerBillingData: CustomerBillingData[] = useMemo(() => {
    const activeCustomers = customers.filter(c => c.status === "Active");

    return activeCustomers.map(customer => {
      const customerTasks = periodTasks.filter(t => t.customerId === customer.id);
      const totalTimeUsedSeconds = customerTasks.reduce((sum, t) => sum + (t.totalTime || 0), 0);
      const totalTimeUsedHours = totalTimeUsedSeconds / 3600;

      const packageAllowanceHours = customer.vaPackagedHours || 0;
      const overageRate = customer.vaHourlyOverageRate || 0;
      const packageName = customer.vaPackage || customer.virtualAssistantPlan || "No Package";

      const remainingHours = Math.max(0, packageAllowanceHours - totalTimeUsedHours);
      const overageHours = Math.max(0, totalTimeUsedHours - packageAllowanceHours);
      const extraBillableAmount = Math.round(overageHours * overageRate * 100) / 100;

      const usagePercent = packageAllowanceHours > 0
        ? Math.min(100, (totalTimeUsedHours / packageAllowanceHours) * 100)
        : 0;

      let billingStatus: BillingStatus = "within_package";
      if (packageAllowanceHours === 0) {
        billingStatus = "no_package";
      } else if (overageHours > 0) {
        billingStatus = "over_package";
      } else if (usagePercent >= 80) {
        billingStatus = "near_limit";
      }

      return {
        customer,
        tasks: customerTasks,
        totalTimeUsedSeconds,
        totalTimeUsedHours,
        packageAllowanceHours,
        remainingHours,
        overageHours,
        overageRate,
        extraBillableAmount,
        billingStatus,
        packageName,
        usagePercent,
      };
    }).filter(d => d.tasks.length > 0 || d.packageAllowanceHours > 0);
  }, [customers, periodTasks]);

  // Apply filters and sorting
  const filteredData = useMemo(() => {
    let data = customerBillingData;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(d => d.customer.name.toLowerCase().includes(term));
    }

    if (filterStatus !== "all") {
      data = data.filter(d => d.billingStatus === filterStatus);
    }

    if (filterTeamMember !== "all") {
      data = data.filter(d => d.tasks.some(t => t.assigneeId === filterTeamMember));
    }

    // Sort
    switch (sortBy) {
      case "name":
        data.sort((a, b) => a.customer.name.localeCompare(b.customer.name));
        break;
      case "time_used":
        data.sort((a, b) => b.totalTimeUsedHours - a.totalTimeUsedHours);
        break;
      case "overage_amount":
        data.sort((a, b) => b.extraBillableAmount - a.extraBillableAmount);
        break;
      case "over_first":
        data.sort((a, b) => {
          const statusOrder: Record<BillingStatus, number> = { over_package: 0, near_limit: 1, within_package: 2, no_package: 3 };
          return (statusOrder[a.billingStatus] - statusOrder[b.billingStatus]) || (b.totalTimeUsedHours - a.totalTimeUsedHours);
        });
        break;
    }

    return data;
  }, [customerBillingData, searchTerm, filterStatus, filterTeamMember, sortBy]);

  // Summary calculations
  const summary = useMemo(() => {
    const totalTrackedHours = customerBillingData.reduce((s, d) => s + d.totalTimeUsedHours, 0);
    const totalPackageHours = customerBillingData.reduce((s, d) => s + Math.min(d.totalTimeUsedHours, d.packageAllowanceHours), 0);
    const totalOverageHours = customerBillingData.reduce((s, d) => s + d.overageHours, 0);
    const totalExtraBillable = customerBillingData.reduce((s, d) => s + d.extraBillableAmount, 0);
    const customersOver = customerBillingData.filter(d => d.billingStatus === "over_package").length;
    const customersNearLimit = customerBillingData.filter(d => d.billingStatus === "near_limit").length;
    return { totalTrackedHours, totalPackageHours, totalOverageHours, totalExtraBillable, customersOver, customersNearLimit };
  }, [customerBillingData]);

  const toggleCustomer = (id: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getAssigneeName = (id: string) => users.find(u => u.id === id)?.name ?? "Unassigned";

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const statusBadge = (status: BillingStatus) => {
    switch (status) {
      case "within_package":
        return <Badge className="bg-green-500/15 text-green-700 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Within Package</Badge>;
      case "near_limit":
        return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30"><AlertCircle className="h-3 w-3 mr-1" />Near Limit</Badge>;
      case "over_package":
        return <Badge className="bg-red-500/15 text-red-700 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Over Package</Badge>;
      case "no_package":
        return <Badge variant="outline" className="text-muted-foreground"><AlertTriangle className="h-3 w-3 mr-1" />No Package</Badge>;
    }
  };

  const exportCSV = () => {
    const headers = ["Customer", "Package", "Allowance (hrs)", "Used (hrs)", "Remaining (hrs)", "Overage (hrs)", "Rate (£/hr)", "Extra Billable (£)", "Status"];
    const rows = filteredData.map(d => [
      d.customer.name,
      d.packageName,
      d.packageAllowanceHours.toFixed(1),
      d.totalTimeUsedHours.toFixed(2),
      d.remainingHours.toFixed(2),
      d.overageHours.toFixed(2),
      d.overageRate.toFixed(2),
      d.extraBillableAmount.toFixed(2),
      d.billingStatus.replace("_", " "),
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-tasks-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Invoice a single customer's overage
  const invoiceCustomer = async (data: CustomerBillingData) => {
    if (data.extraBillableAmount <= 0) return;
    setInvoicingCustomerId(data.customer.id);
    try {
      const taskIds = data.tasks.map(t => t.id);
      // Mark all tasks for this customer as invoiced for this period
      const { error } = await (supabase.from('project_tasks' as any) as any)
        .update({ invoiced_at: new Date().toISOString(), invoiced_period: selectedMonth })
        .in('id', taskIds);

      if (error) throw error;

      setInvoicedCustomers(prev => new Set(prev).add(data.customer.id));
      toast({
        title: "Invoiced Successfully",
        description: `${formatGBP(data.extraBillableAmount)} overage invoiced for ${data.customer.name}. Tasks marked as billed for ${selectedMonth}.`,
      });
      // Reload tasks to reflect changes
      window.location.reload();
    } catch (err: any) {
      console.error('Invoice error:', err);
      toast({ title: "Invoice Failed", description: err.message || "Could not invoice this customer.", variant: "destructive" });
    } finally {
      setInvoicingCustomerId(null);
    }
  };

  // Invoice all customers with overages
  const invoiceAll = async () => {
    const overageCustomers = filteredData.filter(d => d.extraBillableAmount > 0 && !invoicedCustomers.has(d.customer.id));
    if (overageCustomers.length === 0) return;
    setInvoicingAll(true);
    try {
      const allTaskIds = overageCustomers.flatMap(d => d.tasks.map(t => t.id));
      const { error } = await (supabase.from('project_tasks' as any) as any)
        .update({ invoiced_at: new Date().toISOString(), invoiced_period: selectedMonth })
        .in('id', allTaskIds);

      if (error) throw error;

      const totalBilled = overageCustomers.reduce((s, d) => s + d.extraBillableAmount, 0);
      toast({
        title: "All Overages Invoiced",
        description: `${formatGBP(totalBilled)} total invoiced across ${overageCustomers.length} customer(s) for ${selectedMonth}.`,
      });
      window.location.reload();
    } catch (err: any) {
      console.error('Invoice all error:', err);
      toast({ title: "Invoice Failed", description: err.message || "Could not invoice all customers.", variant: "destructive" });
    } finally {
      setInvoicingAll(false);
    }
  };
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <Clock className="h-3.5 w-3.5" />
              Tracked Hours
            </div>
            <p className="text-2xl font-bold">{summary.totalTrackedHours.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <CheckCircle className="h-3.5 w-3.5" />
              Package Hours
            </div>
            <p className="text-2xl font-bold">{summary.totalPackageHours.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Overage Hours
            </div>
            <p className="text-2xl font-bold text-destructive">{summary.totalOverageHours.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <PoundSterling className="h-3.5 w-3.5" />
              Extra Billable
            </div>
            <p className="text-2xl font-bold text-destructive">{formatGBP(summary.totalExtraBillable)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <XCircle className="h-3.5 w-3.5" />
              Over Package
            </div>
            <p className="text-2xl font-bold text-destructive">{summary.customersOver}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <AlertCircle className="h-3.5 w-3.5" />
              Near Limit
            </div>
            <p className="text-2xl font-bold text-amber-600">{summary.customersNearLimit}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-full md:w-44">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Month</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-40">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="within_package">Within Package</SelectItem>
                  <SelectItem value="near_limit">Near Limit</SelectItem>
                  <SelectItem value="over_package">Over Package</SelectItem>
                  <SelectItem value="no_package">No Package</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-40">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Team Member</label>
              <Select value={filterTeamMember} onValueChange={setFilterTeamMember}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  {users.filter(u => u.status === "Active").map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-44">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Sort By</label>
              <Select value={sortBy} onValueChange={v => setSortBy(v as SortOption)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="over_first">Over Package First</SelectItem>
                  <SelectItem value="time_used">Most Time Used</SelectItem>
                  <SelectItem value="overage_amount">Highest Overage</SelectItem>
                  <SelectItem value="name">Customer Name</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={exportCSV} className="flex-shrink-0">
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Customer Billing Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Customer Invoice Usage — {monthOptions.find(o => o.value === selectedMonth)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredData.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No billing data found</p>
              <p className="text-sm mt-1">No tasks with tracked time for this period, or no matching filters.</p>
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div className="hidden lg:grid grid-cols-[1fr_130px_100px_100px_100px_90px_90px_110px_120px_90px] px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b bg-muted/30">
                <span>Customer</span>
                <span>Package</span>
                <span className="text-right">Allowance</span>
                <span className="text-right">Used</span>
                <span className="text-right">Remaining</span>
                <span className="text-right">Overage</span>
                <span className="text-right">Rate</span>
                <span className="text-right">Extra Bill</span>
                <span className="text-center">Status</span>
                <span className="text-center">Invoice</span>
              </div>

              {filteredData.map(data => {
                const isExpanded = expandedCustomers.has(data.customer.id);
                return (
                  <div key={data.customer.id} className="border-b last:border-b-0">
                    {/* Customer row */}
                    <div
                      className="grid grid-cols-1 lg:grid-cols-[1fr_130px_100px_100px_100px_90px_90px_110px_120px_90px] px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors items-center gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0" onClick={() => toggleCustomer(data.customer.id)}>
                        {isExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{data.customer.name}</p>
                          <p className="text-xs text-muted-foreground">{data.tasks.length} task{data.tasks.length !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <span className="text-xs truncate hidden lg:block">{data.packageName}</span>
                      <span className="text-sm text-right hidden lg:block">{data.packageAllowanceHours > 0 ? formatHours(data.packageAllowanceHours) : "—"}</span>
                      <span className="text-sm font-medium text-right hidden lg:block">{formatHours(data.totalTimeUsedHours)}</span>
                      <span className="text-sm text-right hidden lg:block">{data.packageAllowanceHours > 0 ? formatHours(data.remainingHours) : "—"}</span>
                      <span className={`text-sm text-right font-medium hidden lg:block ${data.overageHours > 0 ? "text-destructive" : ""}`}>
                        {data.overageHours > 0 ? formatHours(data.overageHours) : "—"}
                      </span>
                      <span className="text-sm text-right hidden lg:block">{data.overageRate > 0 ? `${formatGBP(data.overageRate)}` : "—"}</span>
                      <span className={`text-sm text-right font-semibold hidden lg:block ${data.extraBillableAmount > 0 ? "text-destructive" : ""}`}>
                        {data.extraBillableAmount > 0 ? `${formatGBP(data.extraBillableAmount)}` : "—"}
                      </span>
                      <div className="hidden lg:flex justify-center">
                        {statusBadge(data.billingStatus)}
                      </div>
                      <div className="hidden lg:flex justify-center">
                        {data.extraBillableAmount > 0 && !invoicedCustomers.has(data.customer.id) ? (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            disabled={invoicingCustomerId === data.customer.id}
                            onClick={(e) => { e.stopPropagation(); invoiceCustomer(data); }}
                          >
                            <Receipt className="h-3 w-3 mr-1" />
                            {invoicingCustomerId === data.customer.id ? "..." : "Invoice"}
                          </Button>
                        ) : invoicedCustomers.has(data.customer.id) ? (
                          <Badge className="bg-green-500/15 text-green-700 border-green-500/30 text-[10px]">
                            <CheckCircle className="h-3 w-3 mr-1" />Invoiced
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>

                      {/* Mobile summary */}
                      <div className="lg:hidden flex flex-wrap gap-2 items-center mt-1">
                        {statusBadge(data.billingStatus)}
                        <span className="text-xs text-muted-foreground">Used: {formatHours(data.totalTimeUsedHours)}</span>
                        {data.packageAllowanceHours > 0 && (
                          <span className="text-xs text-muted-foreground">of {formatHours(data.packageAllowanceHours)}</span>
                        )}
                        {data.extraBillableAmount > 0 && (
                          <span className="text-xs font-semibold text-destructive">+{formatGBP(data.extraBillableAmount)}</span>
                        )}
                      </div>
                    </div>

                    {/* Usage bar */}
                    {data.packageAllowanceHours > 0 && (
                      <div className="px-4 pb-2">
                        <Progress
                          value={data.usagePercent}
                          className={`h-1.5 ${data.billingStatus === "over_package" ? "[&>div]:bg-destructive" : data.billingStatus === "near_limit" ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500"}`}
                        />
                      </div>
                    )}

                    {/* Expanded task detail */}
                    {isExpanded && (
                      <div className="bg-muted/20 border-t">
                        <div className="hidden md:grid grid-cols-[1fr_120px_120px_100px_120px] px-8 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          <span>Task</span>
                          <span>Team Member</span>
                          <span>Status</span>
                          <span className="text-right">Time</span>
                          <span className="text-right">Billable Type</span>
                        </div>
                        {data.tasks.length === 0 ? (
                          <div className="px-8 py-4 text-sm text-muted-foreground">No tasks recorded for this period.</div>
                        ) : (
                          data.tasks.map(task => {
                            const timeHours = (task.totalTime || 0) / 3600;
                            // Determine if this task's time falls within package or is overage
                            // Simple approach: tasks are "included" up to the package limit
                            const billableType = data.packageAllowanceHours === 0 ? "No package" :
                              data.overageHours > 0 ? "Mixed" : "Included";

                            return (
                              <div key={task.id} className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_100px_120px] px-8 py-2.5 border-t border-border/50 items-center gap-1 text-sm">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{task.title}</p>
                                  {task.notes && (
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">{task.notes.split("\n")[0]}</p>
                                  )}
                                </div>
                                <span className="text-muted-foreground hidden md:block">{getAssigneeName(task.assigneeId)}</span>
                                <span className="hidden md:block">
                                  <Badge variant="outline" className="text-[10px]">{task.status.replace("_", " ")}</Badge>
                                </span>
                                <span className="text-right font-mono hidden md:block">{formatHours(timeHours)}</span>
                                <span className="text-right hidden md:block">
                                  <Badge variant="outline" className={`text-[10px] ${billableType === "Included" ? "border-green-500/30 text-green-700" : billableType === "Mixed" ? "border-amber-500/30 text-amber-700" : ""}`}>
                                    {billableType}
                                  </Badge>
                                </span>
                              </div>
                            );
                          })
                        )}
                        {/* Customer task totals */}
                        <div className="px-8 py-3 border-t bg-muted/40 flex items-center justify-between text-sm">
                          <span className="font-medium">{data.tasks.length} task{data.tasks.length !== 1 ? "s" : ""} total</span>
                          <div className="flex items-center gap-4">
                            <span>Total: <strong>{formatHours(data.totalTimeUsedHours)}</strong></span>
                            {data.extraBillableAmount > 0 && (
                              <span className="text-destructive font-semibold">Extra: {formatGBP(data.extraBillableAmount)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Billing Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <PoundSterling className="h-4 w-4" />
            Monthly Billing Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Customers Tracked</p>
              <p className="text-xl font-bold">{filteredData.length}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Total Hours Tracked</p>
              <p className="text-xl font-bold">{summary.totalTrackedHours.toFixed(1)}h</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Total Overage</p>
              <p className="text-xl font-bold text-destructive">{summary.totalOverageHours.toFixed(1)}h</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Total Extra Billing</p>
              <p className="text-xl font-bold text-destructive">{formatGBP(summary.totalExtraBillable)}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
            {summary.totalExtraBillable > 0 && (
              <Button
                onClick={invoiceAll}
                disabled={invoicingAll}
              >
                <Send className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">{invoicingAll ? "Invoicing..." : `Invoice All Overages (${formatGBP(summary.totalExtraBillable)})`}</span><span className="sm:hidden">{invoicingAll ? "..." : `Invoice All (${formatGBP(summary.totalExtraBillable)})`}</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
