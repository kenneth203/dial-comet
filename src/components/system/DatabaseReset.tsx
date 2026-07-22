import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2, AlertTriangle, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

import { secureLog } from '@/lib/secureLogger';

export function DatabaseReset() {
  const [isResetting, setIsResetting] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    checkUserRole();
  }, [user]);

  const checkUserRole = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      setUserRole(profile?.role || null);
    } catch (error) {
      console.error('Error checking user role:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  // Only Super-Admin can see this component
  if (userRole !== 'Super-Admin') {
    return (
      <Card className="border-destructive/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-destructive" />
            <CardTitle>Access Denied</CardTitle>
          </div>
          <CardDescription>
            Database reset functionality is restricted to Super-Admin users only.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleReset = async () => {
    if (confirmationText !== "RESET_ALL_DATA_CONFIRM") {
      toast({
        title: "Invalid Confirmation",
        description: "Please enter the exact confirmation code as shown.",
        variant: "destructive",
      });
      return;
    }

    setIsResetting(true);
    
    try {
      secureLog.security('Database reset attempt', { 
        user: user?.email, 
        timestamp: new Date().toISOString() 
      });
      
      const { data, error } = await (supabase as any).rpc('perform_database_reset', {
        confirmation_code: confirmationText
      });

      if (error) {
        throw error;
      }

      secureLog.security('Database reset completed successfully', { 
        user: user?.email, 
        timestamp: new Date().toISOString() 
      });

      localStorage.removeItem("app.customers");
      localStorage.removeItem("app.customers.backup");

      toast({
        title: "Database Reset Complete",
        description: "All user data has been successfully cleared from the database.",
        variant: "default",
      });

      setConfirmationText("");
      setShowConfirmation(false);
      
    } catch (error: any) {
      secureLog.error('Database reset failed', { 
        error: error.message,
        user: user?.email,
        timestamp: new Date().toISOString()
      });
      toast({
        title: "Reset Failed",
        description: error.message || "An error occurred while resetting the database.",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Card className="border-destructive/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-destructive" />
          <CardTitle>Database Reset</CardTitle>
        </div>
        <CardDescription>
          This will permanently delete ALL user-generated data from the system. Use with extreme caution.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>WARNING:</strong> This action will permanently delete:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>All customer records and data</li>
              <li>All news feed items</li>
              <li>All tasks and todos</li>
              <li>All billing data, invoices, and call logs</li>
              <li>All CRM data and statistics</li>
              <li>All holiday requests (entitlements reset to defaults)</li>
              <li>All user status history</li>
            </ul>
            <p className="mt-2 font-semibold">This action cannot be undone!</p>
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Only system configuration and user accounts will be preserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Current user: <strong>{user?.email}</strong> (Super-Admin)
          </p>
        </div>

        <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full">
              <Trash2 className="h-4 w-4 mr-2" />
              Reset Database
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">
                Confirm Database Reset
              </AlertDialogTitle>
              <AlertDialogDescription>
                This is your final confirmation. This action will permanently delete all user data and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  To confirm, type: <strong>RESET_ALL_DATA_CONFIRM</strong>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="confirmation">Confirmation Code</Label>
                <Input
                  id="confirmation"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder="Enter confirmation code"
                  className="font-mono"
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel 
                onClick={() => {
                  setConfirmationText("");
                  setShowConfirmation(false);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleReset}
                disabled={isResetting || confirmationText !== "RESET_ALL_DATA_CONFIRM"}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isResetting ? "Resetting..." : "Reset Database"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}