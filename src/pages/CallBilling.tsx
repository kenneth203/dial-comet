import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BillingCustomersTab } from "@/components/billing/BillingCustomersTab";
import { CallLogsTab } from "@/components/billing/CallLogsTab";
import { BillingDashboard } from "@/components/billing/BillingDashboard";
import { BillingSettingsTab } from "@/components/billing/BillingSettingsTab";
import { PackagesPricingTab } from "@/components/billing/PackagesPricingTab";
import { UnifiedPeriodsTab } from "@/components/billing/UnifiedPeriodsTab";
import { UnifiedInvoicesTab } from "@/components/billing/UnifiedInvoicesTab";
import { UnifiedBillingReports } from "@/components/billing/UnifiedBillingReports";
import { MonthlyCallBillingReport } from "@/components/billing/MonthlyCallBillingReport";
import { CombinedInvoicesReport } from "@/components/reports/CombinedInvoicesReport";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { Phone, Users, Settings, Calendar, Receipt, LineChart, BarChart3 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function CallBilling() {
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (profile?.role === 'Super-Admin') {
          setHasAccess(true);
        } else {
          toast({
            title: "Access Denied",
            description: "You don't have permission to access Call Billing.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error checking access:', error);
        toast({
          title: "Error",
          description: "Failed to verify access permissions.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardContent className="pt-6">
            <div className="text-center">
              <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
              <p className="text-muted-foreground">
                Call Billing is only accessible to authorized personnel.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Manage call logs, customers, and generate invoices for call billing." />
        <link rel="canonical" href={window.location.origin + "/call-billing"} />
      </Helmet>

      <GradientBackdrop />

      <StandardNavigation currentPage="call-billing" />

      <main className="container max-w-[2000px] py-3 sm:py-6 px-3 sm:px-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gradient">Billing &amp; Invoicing</h1>
            <p className="text-muted-foreground">
              Unified call answering and virtual assistant billing with internal invoices and revenue reporting
            </p>
          </div>
          <Badge variant="secondary" className="text-sm px-3 py-1">
            <Phone className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Super-Admin Access</span>
          </Badge>
        </div>

      <Tabs defaultValue="reports" className="space-y-6">
        <div className="overflow-x-auto -mx-3 sm:mx-0 pb-1">
          <TabsList className="inline-flex w-max gap-1">
            <TabsTrigger value="reports" className="flex items-center gap-1.5 whitespace-nowrap">
              <LineChart className="h-4 w-4 flex-shrink-0" />
              <span>Reports</span>
            </TabsTrigger>
            <TabsTrigger value="all-invoices" className="flex items-center gap-1.5 whitespace-nowrap">
              <Receipt className="h-4 w-4 flex-shrink-0" />
              <span>All Invoices</span>
            </TabsTrigger>
            <TabsTrigger value="call-report" className="flex items-center gap-1.5 whitespace-nowrap">
              <Receipt className="h-4 w-4 flex-shrink-0" />
              <span>Call Billing Report</span>
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="flex items-center gap-1.5 whitespace-nowrap">
              <BarChart3 className="h-4 w-4 flex-shrink-0" />
              <span>Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="periods" className="flex items-center gap-1.5 whitespace-nowrap">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span>Periods</span>
            </TabsTrigger>
            <TabsTrigger value="unified-invoices" className="flex items-center gap-1.5 whitespace-nowrap">
              <Receipt className="h-4 w-4 flex-shrink-0" />
              <span>Invoices</span>
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center gap-1.5 whitespace-nowrap">
              <Users className="h-4 w-4 flex-shrink-0" />
              <span>Customers</span>
            </TabsTrigger>
            <TabsTrigger value="call-logs" className="flex items-center gap-1.5 whitespace-nowrap">
              <Phone className="h-4 w-4 flex-shrink-0" />
              <span>Call Logs</span>
            </TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-1.5 whitespace-nowrap">
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span>Packages</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1.5 whitespace-nowrap">
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span>Settings</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="reports">
          <UnifiedBillingReports />
        </TabsContent>

        <TabsContent value="all-invoices">
          <CombinedInvoicesReport />
        </TabsContent>

        <TabsContent value="call-report">
          <MonthlyCallBillingReport />
        </TabsContent>

        <TabsContent value="dashboard">
          <BillingDashboard />
        </TabsContent>

        <TabsContent value="periods">
          <UnifiedPeriodsTab />
        </TabsContent>

        <TabsContent value="unified-invoices">
          <UnifiedInvoicesTab />
        </TabsContent>

        <TabsContent value="customers">
          <BillingCustomersTab />
        </TabsContent>

        <TabsContent value="call-logs">
          <CallLogsTab />
        </TabsContent>

        <TabsContent value="pricing">
          <PackagesPricingTab />
        </TabsContent>

        <TabsContent value="settings">
          <BillingSettingsTab />
        </TabsContent>
      </Tabs>
      </main>
    </div>
  );
}