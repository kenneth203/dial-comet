import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import { Users, PenTool, BarChart3, Target, Workflow, FileText, Mail } from "lucide-react";

// Import CRM components
import { LeadsManagement } from "@/components/crm/LeadsManagement";
import { FormsBuilder } from "@/components/crm/FormsBuilder";
import { CRMDashboard } from "@/components/crm/CRMDashboard";
import { WorkflowAutomation } from "@/components/crm/WorkflowAutomation";
import { ProposalInvoicesTab } from "@/components/crm/ProposalInvoicesTab";
import { EmailTemplatesEditor } from "@/components/crm/EmailTemplatesEditor";

export default function CRM() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Complete CRM solution with lead management, contracts, forms, projects, and revenue tracking." />
      </Helmet>

      <GradientBackdrop />

      <StandardNavigation currentPage="crm" />

      <main className="container max-w-[2000px] py-3 sm:py-6 px-3 sm:px-6">
        <div className="flex flex-col space-y-6">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gradient">CRM Dashboard</h1>
              <p className="text-muted-foreground">
                Complete customer relationship management and business automation
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/10">
                <Users className="h-3 w-3 mr-1" />
                Customer Integrated
              </Badge>
              <a
                href="/email-log"
                className="inline-flex items-center px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              >
                Email log
              </a>
            </div>
          </div>

          {/* CRM Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-6 h-auto p-1 bg-muted/50">
              <TabsTrigger value="dashboard" className="flex items-center gap-2 px-3 py-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="leads" className="flex items-center gap-2 px-3 py-2">
                <Target className="h-4 w-4" />
                <span className="hidden sm:inline">Leads</span>
              </TabsTrigger>
              <TabsTrigger value="invoices" className="flex items-center gap-2 px-3 py-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Invoices</span>
              </TabsTrigger>
              <TabsTrigger value="forms" className="flex items-center gap-2 px-3 py-2">
                <PenTool className="h-4 w-4" />
                <span className="hidden sm:inline">Forms</span>
              </TabsTrigger>
              <TabsTrigger value="automation" className="flex items-center gap-2 px-3 py-2">
                <Workflow className="h-4 w-4" />
                <span className="hidden sm:inline">Workflows</span>
              </TabsTrigger>
              <TabsTrigger value="email-templates" className="flex items-center gap-2 px-3 py-2">
                <Mail className="h-4 w-4" />
                <span className="hidden sm:inline">Email Templates</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="mt-6">
              <CRMDashboard />
            </TabsContent>

            <TabsContent value="leads" className="mt-6">
              <LeadsManagement />
            </TabsContent>

            <TabsContent value="invoices" className="mt-6">
              <ProposalInvoicesTab />
            </TabsContent>

            <TabsContent value="forms" className="mt-6">
              <FormsBuilder />
            </TabsContent>

            <TabsContent value="automation" className="mt-6">
              <WorkflowAutomation />
            </TabsContent>

            <TabsContent value="email-templates" className="mt-6">
              <EmailTemplatesEditor />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}