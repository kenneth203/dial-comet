import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { Loader2, Mail, ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setSent(true);
      toast({
        title: "Email sent",
        description: "Check your inbox for the password reset link.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not send reset email.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Forgot Password — The VA Team Portal</title>
        <meta name="description" content="Reset your VA Team portal password" />
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
              Let&apos;s get you back into your workspace.
            </h1>
            <p className="text-sm text-sidebar-foreground/70 leading-relaxed">
              Enter the email address associated with your account and we&apos;ll send you a secure link to reset your password.
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
                Forgot your password?
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                We&apos;ll send a reset link to your registered email address.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sent ? (
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Check your inbox</p>
                    <p className="text-sm text-muted-foreground">
                      If an account exists for <span className="font-medium text-foreground">{email}</span>, you&apos;ll receive a reset link shortly.
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
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={isLoading || !email.trim()}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send Reset Link
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
