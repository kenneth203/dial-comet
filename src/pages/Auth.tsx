import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Loader2, Info, AlertTriangle } from "lucide-react";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [extensionWarning, setExtensionWarning] = useState(false);
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const idleReason = searchParams.get("reason") === "idle";

  useEffect(() => {
    if (!isAuthLoading && user) {
      navigate("/", { replace: true });
    }
  }, [user, isAuthLoading, navigate]);


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Detect stalled sign-in (typically caused by a browser extension
    // intercepting the form/network call — e.g. Stripe Link, password
    // managers injecting hidden inputs into the page).
    const stallTimer = window.setTimeout(() => setExtensionWarning(true), 6000);

    try {
      // Brute-force lockout pre-check (5 failures in 15 min → 15 min lock)
      const { data: lockData, error: lockError } = await Promise.resolve(
        supabase.rpc("check_login_allowed", { p_email: email })
      );
      if (!lockError && Array.isArray(lockData) && lockData[0] && lockData[0].allowed === false) {
        const mins = Math.max(1, Math.ceil((lockData[0].retry_after_seconds ?? 0) / 60));
        toast({
          title: "Too many failed attempts",
          description: `Please try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Record the failed attempt (best-effort, ignore errors).
        // Wrap in Promise.resolve so transpiled await/try/catch (which can
        // lower to .catch() on the thenable) works in Safari — the Supabase
        // PostgrestBuilder is a thenable but does not implement .catch.
        await Promise.resolve(supabase.rpc("record_failed_login", { p_email: email })).catch(() => {});

        if (error.message.includes('Invalid login credentials')) {
          toast({
            title: "Invalid credentials",
            description: "Please check your email and password.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        // Success — clear the failed-attempt counter for this email
        await Promise.resolve(supabase.rpc("clear_failed_logins", { p_email: email })).catch(() => {});
        setExtensionWarning(false);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      window.clearTimeout(stallTimer);
      setIsLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="Sign in to access your VA Team dashboard" />
      </Helmet>

      <div className="min-h-screen w-full bg-background grid lg:grid-cols-2">
        {/* Left brand panel */}
        <div className="relative hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12 overflow-hidden">
          <div
            className="absolute inset-0 opacity-25 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 20% 20%, hsl(var(--primary) / 0.5), transparent 55%), radial-gradient(circle at 80% 80%, hsl(var(--sidebar-accent) / 0.6), transparent 60%)",
            }}
          />
          <div className="relative flex items-center gap-3">
            <div className="rounded-xl bg-white p-2 shadow-md">
              <img
                src="/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png"
                alt="The VA Team Logo"
                className="h-12 w-auto"
              />
            </div>
            <span className="text-lg font-semibold tracking-tight">The VA Team Portal</span>
          </div>

          <div className="relative space-y-6 max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 px-3 py-1 text-xs font-medium ring-1 ring-primary/40">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Secure team workspace
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Welcome back to your<br />The VA Team workspace.
            </h1>
            <p className="text-sm text-sidebar-foreground/70 leading-relaxed">
              Manage clients, tasks, calls, and holidays in one branded portal — built for the way your team works every day.
            </p>
          </div>

          <div className="relative text-xs text-sidebar-foreground/60">
            © {new Date().getFullYear()} The VA Team. All rights reserved.
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex items-center justify-center p-6 sm:p-12">
          <Card className="w-full max-w-md border-border/60 shadow-sm">
            <CardHeader className="space-y-3 text-center lg:text-left">
              <img
                src="/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png"
                alt="The VA Team Logo"
                className="h-10 w-auto mx-auto lg:hidden"
              />
              <CardTitle>
                Sign in to your account
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Enter your invited credentials to access the portal.
              </CardDescription>
              {idleReason && (
                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>You were signed out after 30 minutes of inactivity. Please sign in again.</span>
                </div>
              )}
              {extensionWarning && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-left text-xs text-foreground">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-destructive" />
                  <span>
                    Sign-in is taking longer than expected. A browser extension (e.g. Stripe Link, a
                    password manager, or an autofill tool) may be interfering with this page. Try an{" "}
                    <strong>Incognito / Private window</strong>, or disable extensions for{" "}
                    <code>portal.thevateam.co.uk</code> and reload.
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignIn} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
                <div className="flex items-center justify-between pt-1">
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot your password?
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    Need access? Contact your team administrator.
                  </span>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}