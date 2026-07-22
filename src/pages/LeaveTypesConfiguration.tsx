import { Helmet } from "react-helmet-async";
import { useHoliday } from "@/context/HolidayContext";
import { useAuth } from "@/context/AuthContext";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { LeaveTypesManagement } from "@/components/holidays/LeaveTypesManagement";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function LeaveTypesConfiguration() {
  const { user } = useAuth();
  const { isAdmin, isLoading } = useHoliday();
  const navigate = useNavigate();

  // Redirect if user is not admin
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate('/');
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
        <meta name="description" content="Configure and manage different types of leave and holiday categories." />
        <link rel="canonical" href={window.location.origin + "/leave-types"} />
      </Helmet>

      <GradientBackdrop />

      <StandardNavigation currentPage="leave-types" />

      <main className="container max-w-[2000px] px-3 py-4 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gradient">Leave Types Configuration</h1>
            <p className="text-muted-foreground">Configure and manage different types of leave and holiday categories</p>
          </div>
        </div>
        <div className="space-y-8">
          <LeaveTypesManagement />
        </div>
      </main>
    </div>
  );
}