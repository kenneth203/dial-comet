import { HolidayRequestDialog } from "@/components/holidays/HolidayRequestDialog";
import { MyRequestsCard } from "@/components/holidays/MyRequestsCard";
import { RemainingLeaveCard } from "@/components/holidays/RemainingLeaveCard";
import { SickLeaveCard } from "@/components/holidays/SickLeaveCard";
import { PersonalDaysCard } from "@/components/holidays/PersonalDaysCard";
import { MyHolidayOverview } from "@/components/holidays/MyHolidayOverview";
import { ComprehensiveTeamCalendar } from "@/components/holidays/ComprehensiveTeamCalendar";

import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/context/AuthContext";

export default function Holidays() {
  const { user } = useAuth();

  return (
    <>
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Manage your holiday requests, view team schedules, and track remaining leave days" />
      </Helmet>
      
      <GradientBackdrop />
      <StandardNavigation currentPage="Holiday Management" />
      
      <main className="min-h-screen bg-background">
        <div className="container mx-auto p-3 sm:p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold">Holiday Management</h1>
            <div className="flex gap-2">
              <HolidayRequestDialog />
            </div>
          </div>

          {/* First row: My Holiday Overview and Quick Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <MyHolidayOverview />
            </div>
            <div className="space-y-6 lg:mt-11">
              <RemainingLeaveCard />
              <SickLeaveCard />
              <PersonalDaysCard />
            </div>
          </div>

          {/* Full width: My Requests */}
          <MyRequestsCard />
          
          {/* Full width: My Calendar */}
          <ComprehensiveTeamCalendar mode="personal" strictMatching={true} />
        </div>
      </main>
    </>
  );
}
