import { Helmet } from "react-helmet-async";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import { ShiftCalendarView } from "@/components/scheduler/ShiftCalendarView";
import { OpenShiftsPanel } from "@/components/scheduler/OpenShiftsPanel";
import { TemplateBuilder } from "@/components/scheduler/TemplateBuilder";
import { CoverageHeatmap } from "@/components/scheduler/CoverageHeatmap";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Users, Settings, BarChart3 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function ShiftScheduler() {
  const { user } = useAuth();

  return (
    <>
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Manage staff shifts and scheduling for optimal team coverage" />
      </Helmet>
      
      <GradientBackdrop />
      <StandardNavigation />
      
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-4xl font-bold text-foreground mb-2 sm:mb-4">
              Shift Scheduler
            </h1>
            <p className="text-muted-foreground text-sm sm:text-lg">
              Manage staff schedules, assignments, and coverage to ensure optimal team productivity
            </p>
          </div>

          <Tabs defaultValue="calendar" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
              <TabsTrigger value="calendar" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">Calendar</span>
              </TabsTrigger>
              <TabsTrigger value="open-shifts" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Open Shifts</span>
              </TabsTrigger>
              <TabsTrigger value="templates" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Templates</span>
              </TabsTrigger>
              <TabsTrigger value="coverage" className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Coverage</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calendar" className="space-y-4">
              <ShiftCalendarView />
            </TabsContent>

            <TabsContent value="open-shifts" className="space-y-4">
              <OpenShiftsPanel />
            </TabsContent>

            <TabsContent value="templates" className="space-y-4">
              <TemplateBuilder />
            </TabsContent>

            <TabsContent value="coverage" className="space-y-4">
              <CoverageHeatmap />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}