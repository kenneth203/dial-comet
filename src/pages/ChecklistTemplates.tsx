import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ChecklistTemplateBuilder from "@/components/checklist/ChecklistTemplateBuilder";
import ChecklistSupervisorDashboard from "@/components/checklist/ChecklistSupervisorDashboard";

export default function ChecklistTemplatesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Daily Checklist Templates | The VA Team Portal</title>
        <meta name="description" content="Manage recurring daily checklist tasks for your team." />
      </Helmet>
      <main className="container max-w-[2000px] py-4 sm:py-6 px-4 sm:px-6">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gradient">Daily Checklist Templates</h1>
          <p className="text-muted-foreground">Create recurring daily tasks and track completion across your team.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Checklist Management</CardTitle>
            <CardDescription>Templates feed the Daily Handover screen automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="templates">
              <TabsList>
                <TabsTrigger value="templates">Templates</TabsTrigger>
                <TabsTrigger value="dashboard">Completion Dashboard</TabsTrigger>
              </TabsList>
              <TabsContent value="templates" className="mt-4">
                <ChecklistTemplateBuilder />
              </TabsContent>
              <TabsContent value="dashboard" className="mt-4">
                <ChecklistSupervisorDashboard />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
