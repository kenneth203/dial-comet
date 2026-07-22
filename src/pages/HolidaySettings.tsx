import { Helmet } from "react-helmet-async";
import { Settings } from "lucide-react";
import { useHoliday } from "@/context/HolidayContext";
import { useAuth } from "@/context/AuthContext";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { LeaveTypesManagement } from "@/components/holidays/LeaveTypesManagement";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function HolidaySettings() {
  const { user } = useAuth();
  const { isAdmin, isLoading } = useHoliday();
  const navigate = useNavigate();

  // Redirect if user is not admin
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate('/holidays');
    }
  }, [isAdmin, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Configure holiday policies, leave types, and system settings." />
        <link rel="canonical" href={window.location.origin + "/holidays/settings"} />
      </Helmet>

      <GradientBackdrop />

      <StandardNavigation 
        currentPage="holiday-settings" 
        backLink="/holidays/admin"
        backText="Admin Panel"
      />

      <main className="container max-w-[2000px] px-3 py-4 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gradient flex items-center gap-2">
              <Settings className="h-8 w-8" />
              Holiday System Settings
            </h1>
            <p className="text-muted-foreground">Configure holiday policies, leave types, and system settings</p>
          </div>
        </div>
        <div className="space-y-8">
          {/* Leave Types Configuration */}
          <section>
            <LeaveTypesManagement />
          </section>
          
          {/* Future settings sections can be added here */}
        </div>
      </main>
    </div>
  );
}