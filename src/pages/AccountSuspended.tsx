import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  clearSuspensionDisplayState,
  getSuspensionDisplayState,
} from "@/lib/suspensionSession";

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AccountSuspended() {
  const navigate = useNavigate();
  const display = getSuspensionDisplayState();

  const startedAt = formatDateTime(display?.state_entered_at ?? null);
  const endsAt = formatDateTime(display?.suspend_until ?? null);

  const handleReturnToSignIn = () => {
    clearSuspensionDisplayState();
    navigate("/auth", { replace: true });
  };

  return (
    <>
      <Helmet>
        <title>Account Suspended | The VA Team Portal</title>
        <meta name="description" content="This portal account is currently suspended." />
      </Helmet>

      <div className="min-h-screen w-full bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border/60 shadow-sm">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Account suspended</CardTitle>
            <CardDescription className="text-muted-foreground">
              Your access to The VA Team Portal has been suspended. Please contact your
              administrator if you believe this is an error.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4 text-sm">
              {display?.reason ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Reason</p>
                  <p className="text-foreground break-words">{display.reason}</p>
                </div>
              ) : (
                <p className="text-muted-foreground">No reason was recorded for this suspension.</p>
              )}
              {startedAt && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Suspended from</p>
                  <p className="text-foreground">{startedAt}</p>
                </div>
              )}
              {endsAt && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Scheduled to end</p>
                  <p className="text-foreground">{endsAt}</p>
                </div>
              )}
            </div>

            <Button className="w-full" onClick={handleReturnToSignIn}>
              Return to sign in
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Need help?{" "}
              <Link to="/auth" className="text-primary hover:underline" onClick={clearSuspensionDisplayState}>
                Contact your team administrator.
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
