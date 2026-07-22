import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Calculator, Download, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { secureLog } from '@/lib/secureLogger';
import { formatGBP, formatNumber2dp } from "@/lib/currency";

interface BillingSummary {
  customer_id: string;
  customer_name: string;
  monthly_charge: number;
  base_calls: number;
  additional_minutes: number;
  additional_charges: number;
  calls_total: number;
  monthly_invoice: number;
  vat_rate: number;
  incl_vat: number;
}

export function BillingSummaryTab() {
  const [summaries, setSummaries] = useState<BillingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  useEffect(() => {
    if (selectedMonth) {
      fetchBillingSummary();
    }
  }, [selectedMonth]);

  const fetchBillingSummary = async () => {
    if (!selectedMonth) return;

    try {
      setLoading(true);
      
      const [year, month] = selectedMonth.split('-');
      const periodStart = new Date(parseInt(year), parseInt(month) - 1, 1);
      const periodEnd = new Date(parseInt(year), parseInt(month), 0);

      // Fetch customers with their per-call pricing data
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('status', 'Active');

      if (customersError) throw customersError;

      // Fetch call logs for the selected period  
      const { data: callLogs, error: callLogsError } = await supabase
        .from('call_logs')
        .select('*')
        .gte('date', format(periodStart, 'yyyy-MM-dd'))
        .lte('date', format(periodEnd, 'yyyy-MM-dd'));

      if (callLogsError) throw callLogsError;

      // Group call logs by customer and calculate billing
      const customerSummaries: { [key: string]: BillingSummary } = {};
      const vatRate = 0.20; // 20% VAT

      // First, identify all unique customer IDs from call logs
      const callLogCustomerIds = new Set(callLogs?.map(call => call.customer_id).filter(Boolean) || []);
      secureLog.debug('Unique customer IDs in call logs', { count: callLogCustomerIds.size });
      
      // Create a customer map for quick lookups
      const customerMap = new Map();
      customers?.forEach(customer => {
        customerMap.set(customer.id, customer);
      });

      secureLog.debug('Customers available', { count: customers?.length || 0 });

      // Process call logs and calculate charges
      callLogs?.forEach(call => {
        if (!call.customer_id || !customerSummaries[call.customer_id]) return;
        
        const summary = customerSummaries[call.customer_id];
        const customer = customerMap.get(call.customer_id);

        summary.calls_total += 1;

        // Get VR package details (Per Call Based Pricing)
        const baseCallsAllowance = customer?.vr_included_minutes || 180; // seconds included per call
        const overageRate = customer?.vr_overage_rate || 0.46; // rate per minute overage

        // Calculate call duration in minutes
        const durationMinutes = call.duration_seconds ? Math.ceil(call.duration_seconds / 60) : 0;
        
        // Base allowance in minutes (typically 3 minutes = 180 seconds)
        const baseAllowanceMinutes = baseCallsAllowance / 60;
        
        // If call exceeds base allowance, calculate additional minutes
        const additionalMinutes = Math.max(0, durationMinutes - baseAllowanceMinutes);
        
        // Base call charge (included in monthly package or per-call rate)
        const baseCallCharge = customer?.vr_price ? 0 : 0; // Monthly packages include base calls
        
        // Additional charges for overage minutes
        const additionalCharge = additionalMinutes * overageRate;
        
        summary.base_calls += baseCallCharge;
        summary.additional_minutes += additionalMinutes;
        summary.additional_charges += additionalCharge;
      });

      // Calculate final totals
      const summariesArray = Object.values(customerSummaries).map(summary => {
        summary.monthly_invoice = summary.monthly_charge + summary.base_calls + summary.additional_charges;
        summary.incl_vat = summary.monthly_invoice * (1 + vatRate);
        return summary;
      });

      // Filter to show only customers with activity or monthly charges
      setSummaries(summariesArray.filter(s => s.calls_total > 0 || s.monthly_charge > 0));
    } catch (error) {
      console.error('Error fetching billing summary:', error);
      secureLog.error('Failed to fetch billing summary', { error });
      toast({
        title: "Error",
        description: "Failed to fetch billing summary.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateBilling = async () => {
    if (!selectedMonth) return;

    try {
      setGenerating(true);
      
      const [year, month] = selectedMonth.split('-');
      const periodStart = new Date(parseInt(year), parseInt(month) - 1, 1);
      const periodEnd = new Date(parseInt(year), parseInt(month), 0);

      const { data, error } = await supabase.rpc('generate_billing_for_period', {
        p_period: selectedMonth
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Generated billing for ${data} calls.`,
      });

      // Refresh the summary
      await fetchBillingSummary();
    } catch (error) {
      console.error('Error generating billing:', error);
      toast({
        title: "Error",
        description: "Failed to generate billing.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const exportSummary = () => {
    if (summaries.length === 0) return;

    const csvContent = [
      ['Customer', 'Monthly Charge', 'Base Calls', 'Additional Mins', 'Additional Charges', 'Calls Total', 'Monthly Invoice', 'VAT', 'Incl VAT'].join(','),
      ...summaries.map(s => [
        s.customer_name,
        s.monthly_charge.toFixed(2),
        s.base_calls.toFixed(2),
        s.additional_minutes.toFixed(2),
        s.additional_charges.toFixed(2),
        s.calls_total.toString(),
        s.monthly_invoice.toFixed(2),
        `${Math.round(s.vat_rate * 100)}%`,
        s.incl_vat.toFixed(2)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-summary-${selectedMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Success",
      description: "Billing summary exported successfully.",
    });
  };

  const formatCurrency = (amount: number) => formatGBP(amount);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle>Monthly Billing Summary</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="month">Month:</Label>
                <Input
                  id="month"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button
                onClick={generateBilling}
                disabled={generating || !selectedMonth}
                variant="outline"
              >
                <Calculator className="h-4 w-4 mr-2" />
                {generating ? "Generating..." : "Generate Billing"}
              </Button>
              <Button
                onClick={fetchBillingSummary}
                disabled={loading}
                variant="outline"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                onClick={exportSummary}
                disabled={summaries.length === 0}
                variant="outline"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading billing summary...</div>
          ) : summaries.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No billing data found for {selectedMonth}. Generate billing first.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto -mx-6 sm:mx-0"><div className="min-w-[700px] px-6 sm:px-0 sm:min-w-0"><Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Monthly Charge</TableHead>
                    <TableHead className="text-right">Base Calls</TableHead>
                    <TableHead className="text-right">Additional Mins</TableHead>
                    <TableHead className="text-right">Additional Charges</TableHead>
                    <TableHead className="text-right">Calls Total</TableHead>
                    <TableHead className="text-right">Monthly Invoice</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">Incl VAT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((summary) => (
                    <TableRow key={summary.customer_id}>
                      <TableCell className="font-medium">{summary.customer_name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(summary.monthly_charge)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(summary.base_calls)}</TableCell>
                      <TableCell className="text-right">{formatNumber2dp(summary.additional_minutes)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(summary.additional_charges)}</TableCell>
                      <TableCell className="text-right">{summary.calls_total}</TableCell>
                      <TableCell className="text-right">{formatCurrency(summary.monthly_invoice)}</TableCell>
                      <TableCell className="text-right">{Math.round(summary.vat_rate * 100)}%</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(summary.incl_vat)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></div></div>
              
              <div className="flex justify-end pt-4 border-t">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Total (Incl VAT)</div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(summaries.reduce((sum, s) => sum + s.incl_vat, 0))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}