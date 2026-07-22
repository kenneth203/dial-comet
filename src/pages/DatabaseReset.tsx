import GradientBackdrop from "@/components/common/GradientBackdrop";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import { DatabaseReset as DatabaseResetComponent } from "@/components/system/DatabaseReset";

export default function DatabaseReset() {
  return (
    <>
      <GradientBackdrop />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950">
        <StandardNavigation 
          currentPage="Database Reset" 
          showBackButton={true}
          backLink="/"
          backText="Dashboard"
        />
        
        <div className="container max-w-4xl mx-auto p-3 sm:p-6">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-2xl sm:text-4xl font-bold text-gradient">Database Reset</h1>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Critical system management tool for clearing all user-generated data from the database.
                This functionality is restricted to Super-Admin users only.
              </p>
            </div>
            
            <DatabaseResetComponent />
          </div>
        </div>
      </div>
    </>
  );
}