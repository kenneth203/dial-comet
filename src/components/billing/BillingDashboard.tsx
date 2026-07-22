import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomers } from "@/context/CustomersContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Phone, FileText, PoundSterling, TrendingUp, Calendar, Shield } from "lucide-react";
import { secureLog } from "@/lib/secureLogger";
import { useSecureBillingDashboard } from "@/hooks/useSecureBillingDashboard";
import { formatGBP } from "@/lib/currency";

interface DashboardStats {
  totalCustomers: number;
  activeCustomers: number;
  totalCallsThisMonth: number;
  totalInvoicesThisMonth: number;
  totalRevenueThisMonth: number;
  recentCallLogs: any[];
  topCustomers: any[];
  displayMonth?: string;
}

export function BillingDashboard() {
  const { customers } = useCustomers();
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0,
    activeCustomers: 0,
    totalCallsThisMonth: 0,
    totalInvoicesThisMonth: 0,
    totalRevenueThisMonth: 0,
    recentCallLogs: [],
    topCustomers: []
  });
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  const currentMonth: string = new Date().toISOString().slice(0, 7); // YYYY-MM format

  // Function to manually refresh all data
  const refreshAllData = () => {
    setLoading(true);
    setRefreshKey(prev => prev + 1);
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // First check if user has billing access
        const { data: accessCheck, error: accessError } = await supabase.rpc('has_billing_access');
        
        if (accessError) {
          secureLog.error('Error checking billing access:', accessError);
          setAccessError('Unable to verify billing access permissions');
          setHasAccess(false);
          setLoading(false);
          return;
        }
        
        setHasAccess(accessCheck);
        
        if (!accessCheck) {
          setAccessError('Access denied: Insufficient privileges for billing data');
          setLoading(false);
          return;
        }

        secureLog.info('Loading billing dashboard data');
        // First, get the latest month with actual call log data
        const { data: latestPeriod, error: periodError } = await supabase
          .from('call_logs')
          .select('billing_period')
          .order('billing_period', { ascending: false })
          .limit(1);
        
        const displayMonth = latestPeriod?.[0]?.billing_period || currentMonth;
        
        // Use customer stats from main customer directory  
        const totalCustomers = customers.length;
        const activeCustomers = customers.filter(c => c.status === 'Active').length;

        // Fetch call logs for the display month with customer names
        // Fetching call logs with customer data for {displayMonth}
        const { data: callLogs, error: callLogsError } = await supabase
          .from('call_logs')
          .select(`
            *,
            billing_customers (name)
          `)
          .eq('billing_period', displayMonth)
          .order('created_at', { ascending: false })
          .limit(5);

        if (callLogsError) {
          secureLog.error('Error fetching call logs:', callLogsError);
        }

        const totalCallsThisMonth = callLogs?.length || 0;

        // Fetch invoices for display month
        // Fetching invoices for {displayMonth}
        const { data: invoices, error: invoicesError } = await supabase
          .from('billing_invoices')
          .select('*')
          .eq('billing_period', displayMonth);

        if (invoicesError) {
          secureLog.error('Error fetching invoices:', invoicesError);
        }

        const totalInvoicesThisMonth = invoices?.length || 0;
        
        // Calculate revenue - if total_with_vat is 0, calculate from available data
        let totalRevenueThisMonth = 0;
        
        if (invoices) {
          for (const invoice of invoices) {
            let invoiceTotal = Number(invoice.total_with_vat) || 0;
            
            // If total_with_vat is 0, calculate from base charge + extra charges
            if (invoiceTotal === 0) {
              const baseCharge = Number(invoice.base_charge) || 0;
              const extraCharges = Number(invoice.extra_charges) || 0;
              const vatRate = Number(invoice.vat_rate) || 0.20;
              
              // Calculate subtotal and add VAT
              const subtotal = baseCharge + extraCharges;
              invoiceTotal = subtotal * (1 + vatRate);
              
              // If still 0, use a basic calculation based on calls and minutes
              if (invoiceTotal === 0) {
                const callsMade = Number(invoice.calls_made) || 0;
                const totalMinutes = Number(invoice.total_minutes) || 0;
                
                // Use default rates if invoice totals are not calculated
                const estimatedCallCharges = callsMade * 0.05; // £0.05 per call
                const estimatedMinuteCharges = totalMinutes * 0.01; // £0.01 per minute
                const estimatedSubtotal = estimatedCallCharges + estimatedMinuteCharges;
                invoiceTotal = estimatedSubtotal * (1 + vatRate);
              }
            }
            
            totalRevenueThisMonth += invoiceTotal;
          }
        }
        
        secureLog.info(`Revenue calculation for ${displayMonth}`, {
          invoiceCount: totalInvoicesThisMonth,
          totalRevenue: totalRevenueThisMonth,
          invoices: invoices?.map(inv => ({ 
            id: inv.invoice_id, 
            total_with_vat: inv.total_with_vat,
            base_charge: inv.base_charge,
            extra_charges: inv.extra_charges,
            calls_made: inv.calls_made,
            total_minutes: inv.total_minutes,
            calculated_total: 'calculated above'
          }))
        });

        // Get top customers by call volume for display month with customer names
        // Analyzing customer call volume with names for {displayMonth}
        const { data: customerCallCounts, error: callCountsError } = await supabase
          .from('call_logs')
          .select(`
            customer_id,
            billing_customers (name)
          `)
          .eq('billing_period', displayMonth);

        if (callCountsError) {
          secureLog.error('Error fetching customer call counts:', callCountsError);
        }

        const customerCounts = customerCallCounts?.reduce((acc: any, log) => {
          const customerId = log.customer_id;
          const customerName = (log as any).billing_customers?.name || 'Unknown Customer';
          
          if (!acc[customerId]) {
            acc[customerId] = { name: customerName, count: 0 };
          }
          acc[customerId].count++;
          return acc;
        }, {});

        const topCustomers = Object.values(customerCounts || {})
          .sort((a: any, b: any) => b.count - a.count)
          .slice(0, 5);

        const newStats = {
          totalCustomers,
          activeCustomers,
          totalCallsThisMonth,
          totalInvoicesThisMonth,
          totalRevenueThisMonth,
          recentCallLogs: callLogs || [],
          topCustomers: topCustomers as any[],
          displayMonth // Add this for UI display
        };

        setStats(newStats);
        secureLog.info(`Dashboard showing data for: ${displayMonth}`);
        // Dashboard data refreshed successfully
      } catch (error) {
        secureLog.error('Error fetching dashboard data:', error);
        setAccessError('Failed to load billing dashboard data');
      } finally {
        setLoading(false);
      }
    };

    if (customers.length >= 0) { // Allow for 0 customers
      fetchDashboardData();
    }
  }, [currentMonth, customers, refreshKey]);

  // Auto-refresh data every 5 minutes when component is active
  useEffect(() => {
    const interval = setInterval(() => {
      // Auto-refreshing dashboard data
      refreshAllData();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="container max-w-[2000px] py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading billing dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (hasAccess === false) {
    return (
      <div className="container max-w-[2000px] py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Access Restricted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  {accessError || 'You do not have permission to access billing information. Only HR and Super-Admin users can view financial data.'}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Refresh indicator and controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Billing Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleTimeString()} | Auto-refresh: Every 5 minutes
          </p>
        </div>
        <button
          onClick={refreshAllData}
          disabled={loading}
          className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 self-start sm:self-auto"
        >
          {loading ? 'Refreshing...' : 'Refresh Now'}
        </button>
      </div>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Customers</p>
                <p className="text-2xl font-bold">{stats.totalCustomers}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.activeCustomers} active
                </p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Calls This Month</p>
                <p className="text-2xl font-bold">{stats.totalCallsThisMonth}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.displayMonth || currentMonth}
                </p>
              </div>
              <Phone className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Invoices Generated</p>
                <p className="text-2xl font-bold">{stats.totalInvoicesThisMonth}</p>
                <p className="text-xs text-muted-foreground">
                  This month
                </p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold">{formatGBP(stats.totalRevenueThisMonth)}</p>
                <p className="text-xs text-muted-foreground">
                  With VAT
                </p>
              </div>
              <PoundSterling className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Call Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Recent Call Logs
            </CardTitle>
            <CardDescription>Latest calls from this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.recentCallLogs.length > 0 ? (
                stats.recentCallLogs.map((log, index) => {
                  const customerName = (log as any).billing_customers?.name || 'Unknown Customer';
                  return (
                    <div key={index} className="flex items-start sm:items-center justify-between p-3 border rounded-lg gap-2">
                      <div className="flex items-center gap-3">
                        <Badge variant={log.call_type === 'Inbound' ? 'default' : 'secondary'}>
                          {log.call_type}
                        </Badge>
                        <div>
                          <p className="font-medium">
                            {customerName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {log.date} at {log.time}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium">{log.channel_type}</p>
                        <p className="text-xs text-muted-foreground">{log.result}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No call logs found for this month
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Customers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Customers This Month
            </CardTitle>
            <CardDescription>By call volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topCustomers.length > 0 ? (
                stats.topCustomers.map((customer, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium">#{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {customer.count} calls
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{customer.count}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No call data available for this month
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Monthly Process Status
          </CardTitle>
          <CardDescription>Current billing period: {stats.displayMonth || currentMonth}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Call Logs Uploaded</span>
                <span className="text-sm font-medium">{stats.totalCallsThisMonth > 0 ? 'Complete' : 'Pending'}</span>
              </div>
              <Progress value={stats.totalCallsThisMonth > 0 ? 100 : 0} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Customer Matching</span>
                <span className="text-sm font-medium">{stats.totalCallsThisMonth > 0 ? 'Complete' : 'Pending'}</span>
              </div>
              <Progress value={stats.totalCallsThisMonth > 0 ? 100 : 0} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Invoices Generated</span>
                <span className="text-sm font-medium">{stats.totalInvoicesThisMonth > 0 ? 'Complete' : 'Pending'}</span>
              </div>
              <Progress value={stats.totalInvoicesThisMonth > 0 ? 100 : 0} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
