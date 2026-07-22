import { Helmet } from "react-helmet-async";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus, Shield } from "lucide-react";
import { UsersListTable } from "@/components/users/UsersListTable";
import { UserRolesMatrix } from "@/components/users/UserRolesMatrix";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { StandardNavigation } from "@/components/common/StandardNavigation";

export default function UserManagement() {
  return (
    <>
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Comprehensive user management for team members and system access" />
      </Helmet>
      
      <GradientBackdrop />
      <StandardNavigation />
      
      <div className="min-h-screen pt-20 pb-4 sm:pt-24 sm:pb-8">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="mb-4 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">User Management</h1>
            <p className="text-muted-foreground">Comprehensive user management for team members and system access</p>
          </div>

          <Tabs defaultValue="system-users" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 max-w-sm sm:max-w-lg">
              <TabsTrigger value="system-users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                System Users
              </TabsTrigger>
              <TabsTrigger value="user-roles" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                User Roles
              </TabsTrigger>
            </TabsList>

            <TabsContent value="system-users" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    System Users
                  </CardTitle>
                  <CardDescription>
                    Manage system user accounts with comprehensive profiles and access controls
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UsersListTable />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="user-roles" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    User Roles & Permissions Matrix
                  </CardTitle>
                  <CardDescription>
                    View comprehensive permissions for each user role across all system sections and functions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UserRolesMatrix />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}