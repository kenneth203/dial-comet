import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { Helmet } from "react-helmet-async";
import InvoiceTasksDashboard from "@/components/billing/InvoiceTasksDashboard";

export default function InvoiceTasks() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Track time spent on customer work and calculate billable overages" />
      </Helmet>

      <GradientBackdrop />
      <StandardNavigation currentPage="invoice-tasks" />

      <main className="container max-w-[2000px] py-4 px-4 lg:py-6 lg:px-6">
        <div className="mb-4 lg:mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-gradient">Invoicing</h1>
          <p className="text-muted-foreground text-sm lg:text-base">
            Track customer time usage against package allowances and calculate billable overages
          </p>
        </div>
        <InvoiceTasksDashboard />
      </main>
    </div>
  );
}
