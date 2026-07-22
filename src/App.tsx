import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Suspense, lazy } from "react";

// Dynamic imports for code splitting - only load pages when needed
const Index = lazy(() => import("./pages/Index"));
const News = lazy(() => import("./pages/News"));
const TodoPage = lazy(() => import("./pages/TodoPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const Customers = lazy(() => import("./pages/Customers"));
const Users = lazy(() => import("./pages/Users"));
const Packages = lazy(() => import("./pages/Packages"));
const Noticeboard = lazy(() => import("./pages/Noticeboard"));
const Holidays = lazy(() => import("./pages/Holidays"));
const HolidaysAdmin = lazy(() => import("./pages/HolidaysAdmin"));
const HolidaySettings = lazy(() => import("./pages/HolidaySettings"));
const LeaveTypesConfiguration = lazy(() => import("./pages/LeaveTypesConfiguration"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const CallBilling = lazy(() => import("./pages/CallBilling"));
const OperatorDashboard = lazy(() => import("./pages/OperatorDashboard"));
const CRM = lazy(() => import("./pages/CRM"));
const ConvertLeads = lazy(() => import("./pages/ConvertLeads"));
const Reports = lazy(() => import("./pages/Reports"));
const DatabaseReset = lazy(() => import("./pages/DatabaseReset"));
const ChecklistTemplates = lazy(() => import("./pages/ChecklistTemplates"));
import AdminGuard from "@/components/common/AdminGuard";
import SuperAdminGuard from "@/components/common/SuperAdminGuard";
import SupervisorGuard from "@/components/common/SupervisorGuard";
const BannerManagement = lazy(() => import("./pages/BannerManagement"));
const GitHubStatus = lazy(() => import("./pages/GitHubStatus"));
const ChecklistComplianceReport = lazy(() => import("./pages/ChecklistComplianceReport"));

const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ShiftScheduler = lazy(() => import("./pages/ShiftScheduler"));
const Chat = lazy(() => import("./pages/Chat"));
const NotFound = lazy(() => import("./pages/NotFound"));
const InvoiceTasks = lazy(() => import("./pages/InvoiceTasks"));
const Proposal = lazy(() => import("./pages/Proposal"));
const PublicForm = lazy(() => import("./pages/PublicForm"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const EmailLog = lazy(() => import("./pages/EmailLog"));
const EmailIntakeSettings = lazy(() => import("./pages/EmailIntakeSettings"));
import { UsersProvider } from "@/context/UsersContext";
import { TodoProvider } from "@/context/TodoContext";
import { CustomersProvider } from "@/context/CustomersContext";
import { TasksProvider } from "@/context/TasksContext";
import { AuthProvider } from "@/context/AuthContext";
import { HolidayProvider } from "@/context/HolidayContext";
import { PackagesProvider } from "@/context/PackagesContext";
import { AdditionalChargesProvider } from "@/context/AdditionalChargesContext";
import { UserManagementProvider } from "@/context/UserManagementContext";
import { ProtectedRoute } from "@/components/common/ProtectedRoute";
import { PermissionGuard } from "@/components/common/PermissionGuard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Loading fallback component for better UX
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <UsersProvider>
          <CustomersProvider>
            <PackagesProvider>
              <AdditionalChargesProvider>
              <TasksProvider>
                <TodoProvider>
                  <HolidayProvider>
                    <UserManagementProvider>
                      <BrowserRouter>
                        <Suspense fallback={<PageLoader />}>
                          <Routes>
                            <Route path="/auth" element={<Auth />} />
                            <Route path="/forgot-password" element={<ForgotPassword />} />
                            <Route path="/reset-password" element={<ResetPassword />} />
                            <Route path="/proposal/:token" element={<Proposal />} />
                            <Route path="/form/:submissionId" element={<PublicForm />} />
                            <Route path="/unsubscribe" element={<Unsubscribe />} />

                            {/* Authenticated app shell (navy sidebar + topbar) */}
                            <Route
                              element={
                                <ProtectedRoute>
                                  <AppShell />
                                </ProtectedRoute>
                              }
                            >
                              <Route path="/" element={<Index />} />
                              <Route path="/news" element={<PermissionGuard module="news"><News /></PermissionGuard>} />
                              <Route path="/todo" element={<PermissionGuard module="daily_handover"><TodoPage /></PermissionGuard>} />
                              <Route path="/tasks" element={<PermissionGuard module="task_manager"><TasksPage /></PermissionGuard>} />
                              <Route path="/noticeboard" element={<PermissionGuard module="noticeboard"><Noticeboard /></PermissionGuard>} />
                              <Route path="/holidays" element={<PermissionGuard module="holiday_management"><Holidays /></PermissionGuard>} />
                             <Route path="/holidays/admin" element={<PermissionGuard module="holiday_admin_panel"><AdminGuard><HolidaysAdmin /></AdminGuard></PermissionGuard>} />
                             <Route path="/holidays/settings" element={<PermissionGuard module="holiday_admin_panel"><AdminGuard><HolidaySettings /></AdminGuard></PermissionGuard>} />
                             <Route path="/leave-types" element={<PermissionGuard module="leave_types_config"><AdminGuard redirectTo="/"><LeaveTypesConfiguration /></AdminGuard></PermissionGuard>} />
                              <Route path="/user-management" element={<PermissionGuard module="user_management"><UserManagement /></PermissionGuard>} />
                              <Route path="/call-billing" element={<PermissionGuard module="call_billing"><CallBilling /></PermissionGuard>} />
                              <Route path="/operator-dashboard" element={<OperatorDashboard />} />
                              <Route path="/crm" element={<PermissionGuard module="crm_dashboard"><CRM /></PermissionGuard>} />
                              <Route path="/crm/convert-leads" element={<PermissionGuard module="crm_dashboard"><AdminGuard redirectTo="/crm"><ConvertLeads /></AdminGuard></PermissionGuard>} />
                              <Route path="/email-log" element={<EmailLog />} />
                              <Route path="/reports" element={<PermissionGuard module="status_reports"><Reports /></PermissionGuard>} />
                              <Route path="/scheduler" element={<PermissionGuard module="shift_scheduler"><ShiftScheduler /></PermissionGuard>} />
                              <Route path="/chat" element={<PermissionGuard module="chat"><Chat /></PermissionGuard>} />
                              <Route path="/database-reset" element={<PermissionGuard module="database_reset"><DatabaseReset /></PermissionGuard>} />
                              <Route path="/checklist-templates" element={<PermissionGuard module="daily_checklist"><ChecklistTemplates /></PermissionGuard>} />
                              <Route path="/config/customers" element={<PermissionGuard module="customer_directory"><Customers /></PermissionGuard>} />
                              <Route path="/config/users" element={<PermissionGuard module="user_management"><UserManagement /></PermissionGuard>} />
                              <Route path="/config/packages" element={<PermissionGuard module="packages_pricing"><Packages /></PermissionGuard>} />
                              <Route path="/invoice-tasks" element={<Navigate to="/call-billing" replace />} />
                              <Route path="/config/email-intake" element={<AdminGuard redirectTo="/"><EmailIntakeSettings /></AdminGuard>} />
                              <Route path="/reports/checklist-compliance" element={<SupervisorGuard redirectTo="/"><ChecklistComplianceReport /></SupervisorGuard>} />
                             <Route path="/system/banners" element={<SuperAdminGuard><BannerManagement /></SuperAdminGuard>} />
                             <Route path="/system/github" element={<SuperAdminGuard><GitHubStatus /></SuperAdminGuard>} />
                            </Route>

                            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </Suspense>
                      </BrowserRouter>
                    </UserManagementProvider>
                  </HolidayProvider>
                </TodoProvider>
              </TasksProvider>
              </AdditionalChargesProvider>
            </PackagesProvider>
          </CustomersProvider>
        </UsersProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
