
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { Helmet } from "react-helmet-async";
import TodoList from "@/components/dashboard/TodoList";
import DailyChecklist from "@/components/dashboard/DailyChecklist";

export default function TodoPage() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Manage your team's daily handover items and assignments" />
      </Helmet>

      <GradientBackdrop />
      
      <StandardNavigation currentPage="todo" />

      <main className="container max-w-[2000px] py-4 sm:py-6 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gradient">Daily Handover</h1>
            <p className="text-muted-foreground">Manage your team's daily handover items and assignments</p>
          </div>
        </div>

        <DailyChecklist />

        <Card>
          <CardHeader>
            <CardTitle>Daily Handover</CardTitle>
            <CardDescription>
              Add, assign, and track handover items for your team members
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TodoList showAddForm={true} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
