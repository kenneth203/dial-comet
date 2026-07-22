import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { Helmet } from "react-helmet-async";
import TaskManager from "@/components/dashboard/TaskManager";

export default function TasksPage() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Manage and track project tasks with status updates" />
      </Helmet>

      <GradientBackdrop />
      
      <StandardNavigation currentPage="tasks" />

      <main className="container max-w-[2000px] py-4 px-4 lg:py-6 lg:px-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4 lg:mb-6 gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gradient">Task Manager</h1>
            <p className="text-muted-foreground text-sm lg:text-base">Manage and track project tasks with status updates</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Project Tasks</CardTitle>
            <CardDescription>
              Add, assign, and track the status of your project tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TaskManager />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}