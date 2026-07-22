import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type UnsubState = "loading" | "valid" | "already" | "invalid" | "success" | "error";

export default function Unsubscribe() {
  const [state, setState] = useState<UnsubState>("loading");
  const [processing, setProcessing] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }

    const validate = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`,
          { headers: { apikey: anonKey } }
        );
        const data = await res.json();
        if (res.ok && data.valid === true) setState("valid");
        else if (data.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch {
        setState("error");
      }
    };

    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      if (data?.success) setState("success");
      else if (data?.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch {
      setState("error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Unsubscribe — The VA Team</title>
      </Helmet>
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img
              src="/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png"
              alt="The VA Team"
              className="h-10 w-auto mx-auto mb-4"
            />
            <CardTitle>Email Preferences</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            {state === "loading" && (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Validating your request…</p>
              </div>
            )}

            {state === "valid" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Click the button below to unsubscribe from future notification emails.
                </p>
                <Button
                  onClick={handleUnsubscribe}
                  disabled={processing}
                  variant="destructive"
                  className="w-full"
                >
                  {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm Unsubscribe
                </Button>
              </>
            )}

            {state === "success" && (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <p className="text-sm text-muted-foreground">
                  You have been unsubscribed. You will no longer receive notification emails.
                </p>
              </div>
            )}

            {state === "already" && (
              <div className="flex flex-col items-center gap-2">
                <AlertCircle className="h-8 w-8 text-amber-500" />
                <p className="text-sm text-muted-foreground">
                  You are already unsubscribed from notification emails.
                </p>
              </div>
            )}

            {state === "invalid" && (
              <div className="flex flex-col items-center gap-2">
                <XCircle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-muted-foreground">
                  This unsubscribe link is invalid or has expired.
                </p>
              </div>
            )}

            {state === "error" && (
              <div className="flex flex-col items-center gap-2">
                <XCircle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-muted-foreground">
                  Something went wrong. Please try again later.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
