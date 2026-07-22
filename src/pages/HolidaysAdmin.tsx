import { Helmet } from "react-helmet-async";
import { Settings } from "lucide-react";
import { useHoliday } from "@/context/HolidayContext";
import { useAuth } from "@/context/AuthContext";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { PendingRequestsCard } from "@/components/holidays/PendingRequestsCard";
import { ComprehensiveTeamCalendar } from "@/components/holidays/ComprehensiveTeamCalendar";
import { AdminHolidayManagement } from "@/components/holidays/AdminHolidayManagement";
import { HolidayAdminUserSummaryGrid } from "@/components/holidays/HolidayAdminUserSummaryGrid";
import { LeaveQuotasTab } from "@/components/holidays/LeaveQuotasTab";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function HolidaysAdmin() {
  const { user } = useAuth();
  const { isAdmin, isLoading } = useHoliday();
  const navigate = useNavigate();

  // Redirect if user is not admin or supervisor
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
        <meta name="description" content="Administrative panel for managing holidays, reports, and staff details." />
        <link rel="canonical" href={window.location.origin + "/holidays/admin"} />
      </Helmet>

      <GradientBackdrop />

      <StandardNavigation 
        currentPage="holidays-admin" 
        backLink="/holidays"
        backText="Holidays"
      />

      <main className="container max-w-[2000px] px-3 py-4 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gradient">Holiday Admin Panel</h1>
            <p className="text-muted-foreground">Administrative panel for managing holidays and reports</p>
          </div>
        </div>
        {/* Pending Requests */}
        <section className="mb-8">
          <PendingRequestsCard />
        </section>

        {/* Comprehensive Team Calendar */}
        <section id="calendar-section" className="mb-8">
          <ComprehensiveTeamCalendar includeAllStaff={true} strictMatching={true} />
        </section>

        {/* Per-User Holiday Overview */}
        <section className="mb-8">
          <HolidayAdminUserSummaryGrid />
        </section>

        {/* Holiday Management */}
        <section className="mb-8">
          <AdminHolidayManagement />
        </section>

        {/* Leave Settings */}
        <section className="mb-8">
          <div className="w-full">
            <div className="border rounded-lg p-3 sm:p-6">
              <div className="flex items-center gap-2 text-lg font-semibold mb-6">
                <Settings className="h-5 w-5" />
                Leave Settings
              </div>
              <LeaveQuotasTab />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}