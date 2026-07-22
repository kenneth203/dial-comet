import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Calculator, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatGBP } from "@/lib/currency";

interface BillingInvoice {
  invoice_id: string;
  customer_id: string;
  billing_period: string;
  base_calls_allowed: number;
  calls_made: number;
  extra_calls: number;
  total_minutes: number;
  extra_minutes: number;
  extra_charges: number;
  base_charge: number;
  total_invoice: number;
  vat_rate: number;
  total_with_vat: number;
  created_on: string;
  customers?: { name: string };
}

export function InvoicesTab() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [generating, setGenerating] = useState(false);
  
  // Refresh function
  const refreshData = useCallback(() => {
    console.log('🔄 Refreshing Invoices data...');
    setLoading(true);
    fetchInvoices();
  }, []);

  const fetchInvoices = useCallback(async () => {
    try {
      console.log('💰 Fetching invoices from database...');
      const { data, error } = await supabase
        .from('billing_invoices')
        .select('*')
        .order('created_on', { ascending: false });

      if (error) {
        console.error('Error fetching invoices:', error);
        toast({
          title: "Error",
          description: "Failed to fetch invoices",
          variant: "destructive",
        });
        return;
      }

      // Get customer names separately with error handling
      const invoicesWithCustomers = [];
      if (data) {
        for (const invoice of data) {
          try {
            const { data: customer, error: customerError } = await supabase
              .from('customers')
              .select('name')
              .eq('id', invoice.customer_id)
              .maybeSingle();
            
            // Handle case where customer is not found
            const customerName = customer?.name || `Unknown Customer (${invoice.customer_id.slice(0, 8)}...)`;
            
            invoicesWithCustomers.push({
              ...invoice,
              customers: { name: customerName }
            });
          } catch (error) {
            // If customer lookup fails, use a fallback name
            console.warn(`Could not find customer for invoice ${invoice.invoice_id}:`, error);
            invoicesWithCustomers.push({
              ...invoice,
              customers: { name: `Customer Not Found (${invoice.customer_id.slice(0, 8)}...)` }
            });
          }
        }
      }

      setInvoices(invoicesWithCustomers || []);
      console.log('✅ Invoices fetched successfully:', data?.length || 0, 'records');
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast({
        title: "Error",
        description: "Failed to fetch invoices",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('⏰ Auto-refreshing invoices...');
      refreshData();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [refreshData]);

  const generateInvoicesForPeriod = async (billingPeriod: string) => {
    setGenerating(true);
    
    try {
      console.log(`🚀 Starting invoice generation for period: ${billingPeriod}`);
      
      // First, get all customers from the main customers table
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('status', 'Active');

      if (customersError) throw customersError;

      console.log(`📋 Found ${customers?.length || 0} active customers`);

      // Get billing settings
      const { data: settings, error: settingsError } = await supabase
        .from('billing_settings')
        .select('*')
        .limit(1)
        .single();

      if (settingsError) throw settingsError;

      const invoicesToCreate = [];
      let skippedCustomers = 0;

      for (const customer of customers || []) {
        console.log(`📊 Processing customer: ${customer.name}`);
        
        // Check if invoice already exists for this customer and period
        const { data: existingInvoices, error: existingError } = await supabase
          .from('billing_invoices')
          .select('invoice_id, customer_id, billing_period')
          .eq('customer_id', customer.id)
          .eq('billing_period', billingPeriod);

        if (existingError) {
          console.error('❌ Error checking existing invoices:', existingError);
          continue;
        }

        if (existingInvoices && existingInvoices.length > 0) {
          console.log(`⚠️ Invoice already exists for customer ${customer.name} for period ${billingPeriod}, skipping...`);
          skippedCustomers++;
          continue; // Skip this customer as invoice already exists
        }
        
        // Get call logs for this customer and period
        const { data: callLogs, error: callLogsError } = await supabase
          .from('call_logs')
          .select('*')
          .eq('customer_id', customer.id)
          .eq('billing_period', billingPeriod);

        if (callLogsError) {
          console.error('Error fetching call logs for customer:', customer.name, callLogsError);
          continue;
        }

        const callsMade = callLogs?.length || 0;
        
        // Use VR package pricing structure like BillingSummaryTab
        const monthlyCharge = (customer as any).vr_price || customer.cl_price || 0;
        const baseAllowanceSeconds = (customer as any).vr_included_minutes || customer.cl_included_minutes || 180;
        const overageRatePerMinute = (customer as any).vr_overage_rate || customer.cl_overage_rate || 0.46;
        
        let totalExtraMinutes = 0;
        let totalMinutes = 0;
        
        // Calculate overage minutes for each call
        callLogs?.forEach(log => {
          const durationSeconds = log.duration_seconds || 0;
          const durationMinutes = Math.ceil(durationSeconds / 60);
          totalMinutes += durationMinutes;
          
          // Calculate overage for this call
          const baseAllowanceMinutes = baseAllowanceSeconds / 60;
          const overageMinutes = Math.max(0, durationMinutes - baseAllowanceMinutes);
          totalExtraMinutes += overageMinutes;
        });
        
        // Calculate charges using VR package structure
        const extraCharges = totalExtraMinutes * overageRatePerMinute;
        const baseCharge = monthlyCharge;
        const totalInvoice = baseCharge + extraCharges;
        const totalWithVat = totalInvoice * (1 + settings.vat_rate);

        const invoiceData = {
          customer_id: customer.id,
          billing_period: billingPeriod,
          base_calls_allowed: Math.floor(baseAllowanceSeconds / 60), // Convert to minutes for display
          calls_made: callsMade,
          extra_calls: 0, // Not used in VR pricing model
          total_minutes: totalMinutes,
          extra_minutes: totalExtraMinutes,
          extra_charges: extraCharges,
          base_charge: baseCharge,
          total_invoice: totalInvoice,
          vat_rate: settings.vat_rate,
          total_with_vat: totalWithVat
        };

        invoicesToCreate.push(invoiceData);
        console.log(`✅ Prepared invoice for ${customer.name}: ${formatGBP(totalWithVat)}`);
      }

      if (invoicesToCreate.length === 0) {
        if (skippedCustomers > 0) {
          toast({
            title: "No new invoices to generate",
            description: `All ${skippedCustomers} customers already have invoices for ${billingPeriod}`,
          });
        } else {
          toast({
            title: "No invoices generated",
            description: "No active customers found or no billing data available",
          });
        }
        return;
      }

      // Insert all invoices
      const { error: insertError } = await supabase
        .from('billing_invoices')
        .insert(invoicesToCreate);

      if (insertError) throw insertError;

      console.log(`✅ Successfully generated ${invoicesToCreate.length} invoices`);
      if (skippedCustomers > 0) {
        console.log(`ℹ️ Skipped ${skippedCustomers} customers (invoices already exist)`);
      }

      toast({
        title: "Success",
        description: `Generated ${invoicesToCreate.length} new invoices for ${billingPeriod}${skippedCustomers > 0 ? ` (${skippedCustomers} already existed)` : ''}`,
      });

      fetchInvoices();
    } catch (error) {
      console.error('Error generating invoices:', error);
      toast({
        title: "Error",
        description: "Failed to generate invoices",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const exportInvoice = (invoice: BillingInvoice) => {
    const csvContent = [
      'INVOICE',
      `Invoice ID: ${invoice.invoice_id}`,
      `Customer: ${(invoice as any).customers?.name || 'Unknown'}`,
      `Billing Period: ${invoice.billing_period}`,
      `Generated: ${new Date(invoice.created_on).toLocaleDateString('en-GB')}`,
      '',
      'USAGE SUMMARY',
      `Base calls allowed: ${invoice.base_calls_allowed}`,
      `Calls made: ${invoice.calls_made}`,
      `Extra calls: ${invoice.extra_calls}`,
      `Total minutes: ${invoice.total_minutes}`,
      '',
      'CHARGES',
      `Base charge: ${formatGBP(invoice.base_charge)}`,
      `Extra charges: ${formatGBP(invoice.extra_charges)}`,
      `Subtotal: ${formatGBP(invoice.total_invoice)}`,
      `VAT (${(invoice.vat_rate * 100).toFixed(1)}%): ${formatGBP(invoice.total_with_vat - invoice.total_invoice)}`,
      `Total: ${formatGBP(invoice.total_with_vat)}`
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${invoice.invoice_id.slice(0, 8)}-${invoice.billing_period}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const exportAllInvoices = () => {
    const filteredInvoices = selectedPeriod && selectedPeriod !== "all"
      ? invoices.filter(inv => inv.billing_period === selectedPeriod)
      : invoices;

    const csvContent = [
      'Period,Customer,Base Charge,Extra Charges,Subtotal,VAT,Total',
      ...filteredInvoices.map(inv => [
        inv.billing_period,
        (inv as any).customers?.name || 'Unknown',
        inv.base_charge.toFixed(2),
        inv.extra_charges.toFixed(2),
        inv.total_invoice.toFixed(2),
        (inv.total_with_vat - inv.total_invoice).toFixed(2),
        inv.total_with_vat.toFixed(2)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${selectedPeriod !== "all" ? selectedPeriod : 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Get unique billing periods
  const billingPeriods = [...new Set(invoices.map(inv => inv.billing_period))].sort().reverse();
  const filteredInvoices = selectedPeriod && selectedPeriod !== "all"
    ? invoices.filter(inv => inv.billing_period === selectedPeriod)
    : invoices;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>Generate and manage customer invoices</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={refreshData} variant="outline" disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button onClick={exportAllInvoices} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export All
              </Button>
              <Select 
                value="" 
                onValueChange={(period) => {
                  if (period) {
                    generateInvoicesForPeriod(period);
                  }
                }}
              >
                <SelectTrigger className="w-40 sm:w-48">
                  <SelectValue placeholder="Generate for period..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={new Date().toISOString().slice(0, 7)}>
                    Current Month ({new Date().toISOString().slice(0, 7)})
                  </SelectItem>
                  <SelectItem value={new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7)}>
                    Last Month ({new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7)})
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button 
                onClick={() => generateInvoicesForPeriod(new Date().toISOString().slice(0, 7))}
                disabled={generating}
              >
                <Calculator className="h-4 w-4 mr-2" />
                {generating ? 'Generating...' : 'Generate Invoices'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All periods" />
              </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All periods</SelectItem>
                  {billingPeriods.map(period => (
                    <SelectItem key={period} value={period}>
                      {period}
                    </SelectItem>
                  ))}
                </SelectContent>
            </Select>
            {selectedPeriod && selectedPeriod !== "all" && (
              <div className="text-sm text-muted-foreground">
                Showing {filteredInvoices.length} invoices for {selectedPeriod}
              </div>
            )}
          </div>

          <div className="overflow-x-auto -mx-6 sm:mx-0"><div className="min-w-[680px] px-6 sm:px-0 sm:min-w-0"><div className="rounded-lg border"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Base Charge</TableHead>
                  <TableHead>Extra Charges</TableHead>
                  <TableHead>Total (inc VAT)</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.invoice_id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {(invoice as any).customers?.name || 'Unknown Customer'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ID: {invoice.customer_id.slice(0, 8)}...
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{invoice.billing_period}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{invoice.calls_made} / {invoice.base_calls_allowed}</p>
                        {invoice.extra_calls > 0 && (
                          <p className="text-orange-600">+{invoice.extra_calls} extra</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatGBP(invoice.base_charge)}</TableCell>
                    <TableCell>
                      <span className={invoice.extra_charges > 0 ? "text-orange-600" : ""}>
                        {formatGBP(invoice.extra_charges)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{formatGBP(invoice.total_with_vat)}</p>
                        <p className="text-xs text-muted-foreground">
                          VAT: {formatGBP((invoice.total_with_vat - invoice.total_invoice))}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(invoice.created_on).toLocaleDateString('en-GB')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => exportInvoice(invoice)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div></div></div>

          {filteredInvoices.length === 0 && (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No invoices found</p>
              {!selectedPeriod && (
                <p className="text-sm text-muted-foreground mt-2">
                  Generate invoices for a billing period to get started
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
