import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, CheckCircle2, ArrowLeft } from "lucide-react";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [hashOk, setHashOk] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase password recovery uses a hash fragment; verify we have one
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) {
      setHashOk(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Please ensure both fields are identical.",
        variant: "destructive",
      });
      return;
    }
    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Choose a password of at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      toast({
        title: "Password too weak",
        description: "Include at least one letter and one number.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        // Surface HIBP / weak-password errors verbatim so users understand why
        const msg = error.message || "Could not update password.";
        const isPwned = /pwned|breach|compromis|leak/i.test(msg);
        toast({
          title: isPwned ? "Password found in a known data breach" : "Error",
          description: isPwned
            ? "This password has appeared in a public data breach. Please choose a different one."
            : msg,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      setDone(true);
      toast({
        title: "Password updated",
        description: "Your password has been reset successfully.",
      });

      // Optionally sign the user out so they can sign in fresh
      setTimeout(() => {
        supabase.auth.signOut();
        navigate("/auth");
      }, 3000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not update password.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Reset Password — The VA Team Portal</title>
        <meta name="description" content="Set a new password for your VA Team portal account" />
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
            <img
              src="/lovable-uploads/76e4bdc1-d3c0-4e93-bfc3-91c7c00ad781.png"
              alt="The VA Team Logo"
              className="h-10 w-auto"
            />
            <span className="text-lg font-semibold tracking-tight">The VA Team Portal</span>
          </div>

          <div className="relative space-y-6 max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 px-3 py-1 text-xs font-medium ring-1 ring-primary/40">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Secure team workspace
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Create a new secure password.
            </h1>
            <p className="text-sm text-sidebar-foreground/70 leading-relaxed">
              Choose a strong password you haven&apos;t used before. You&apos;ll be signed out of other devices for security.
            </p>
          </div>

          <div className="relative text-xs text-sidebar-foreground/60">
            &copy; {new Date().getFullYear()} The VA Team. All rights reserved.
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
                Reset your password
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Enter your new password below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!hashOk ? (
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                    <ArrowLeft className="h-6 w-6 text-destructive" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Invalid or expired link</p>
                    <p className="text-sm text-muted-foreground">
                      Please request a new password reset email.
                    </p>
                  </div>
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/forgot-password">
                      Request new link
                    </Link>
                  </Button>
                </div>
              ) : done ? (
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Password updated</p>
                    <p className="text-sm text-muted-foreground">
                      Redirecting you to sign in...
                    </p>
                  </div>
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/auth">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to sign in
                    </Link>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Enter new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      minLength={8}
                    />
                    <p className="text-xs text-muted-foreground">
                      At least 8 characters, with one letter and one number. Cannot be a password known to have been breached.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      minLength={8}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={isLoading}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Update Password
                  </Button>
                  <p className="text-center text-sm text-muted-foreground pt-1">
                    <Link to="/auth" className="text-primary hover:underline inline-flex items-center gap-1">
                      <ArrowLeft className="h-3 w-3" />
                      Back to sign in
                    </Link>
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
