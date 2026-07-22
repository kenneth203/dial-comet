import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import confetti from "canvas-confetti";
import { PartyPopper, Cake } from "lucide-react";

type CelebrationType = "welcome" | "birthday" | null;

interface CelebrationPopupProps {
  forceType?: CelebrationType;
  onForceComplete?: () => void;
}

export function CelebrationPopup({ forceType, onForceComplete }: CelebrationPopupProps) {
  const { user } = useAuth();
  const [celebration, setCelebration] = useState<CelebrationType>(null);
  const [userName, setUserName] = useState("");

  const fireConfetti = useCallback(() => {
    const duration = 3000;
    const end = Date.now() + duration;

    const colors = ["#e63946", "#1d3557", "#f1c40f", "#2ecc71", "#e74c3c", "#9b59b6", "#00b4d8"];

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 2,
        angle: 90,
        spread: 100,
        origin: { x: 0.5, y: 0.3 },
        colors,
        shapes: ["circle"],
        scalar: 0.8,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    // Initial burst
    confetti({
      particleCount: 100,
      spread: 120,
      origin: { x: 0.5, y: 0.5 },
      colors,
      startVelocity: 45,
    });

    frame();
  }, []);

  useEffect(() => {
    if (!user) return;

    const checkCelebrations = async () => {
      // Get user's first name from profiles or comprehensive_users
      let firstName = "";
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", user.id)
        .single();

      if (profile?.name && !profile.name.includes("@")) {
        firstName = profile.name.split(" ")[0];
      }

      if (!firstName) {
        const { data: compUser } = await supabase
          .from("comprehensive_users")
          .select("name")
          .eq("auth_user_id", user.id)
          .single();

        if (compUser?.name && !compUser.name.includes("@")) {
          firstName = compUser.name.split(" ")[0];
        }
      }

      if (!firstName) {
        const { data: staff } = await supabase
          .from("staff_details")
          .select("name")
          .eq("user_id", user.id)
          .single();

        if (staff?.name && !staff.name.includes("@")) {
          firstName = staff.name.split(" ")[0];
        }
      }

      setUserName(firstName || "there");

      // Check first login welcome
      const welcomeKey = `va_welcome_seen_${user.id}`;
      if (!localStorage.getItem(welcomeKey)) {
        localStorage.setItem(welcomeKey, "true");
        setCelebration("welcome");
        return;
      }

      // Check birthday (date_of_birth lives in the encrypted/audited sensitive store)
      const { data: sensitive } = await supabase.rpc(
        "get_employee_sensitive_data_secure",
        { target_user_id: user.id, access_reason: "birthday_celebration_check" }
      );
      const dobStr = Array.isArray(sensitive) && sensitive[0]?.date_of_birth;

      if (dobStr) {
        const today = new Date();
        const dob = new Date(dobStr as string);
        if (
          dob.getMonth() === today.getMonth() &&
          dob.getDate() === today.getDate()
        ) {
          const birthdayKey = `va_birthday_${user.id}_${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
          if (!localStorage.getItem(birthdayKey)) {
            localStorage.setItem(birthdayKey, "true");
            setCelebration("birthday");
          }
        }
      }
    };

    // Small delay to let the dashboard load first
    const timer = setTimeout(checkCelebrations, 1500);
    return () => clearTimeout(timer);
  }, [user]);

  // Handle external force trigger
  useEffect(() => {
    if (forceType) {
      setCelebration(forceType);
    }
  }, [forceType]);

  useEffect(() => {
    if (celebration) {
      const timer = setTimeout(fireConfetti, 300);
      return () => clearTimeout(timer);
    }
  }, [celebration, fireConfetti]);

  const handleClose = () => {
    setCelebration(null);
    onForceComplete?.();
  };

  if (!celebration) return null;

  return (
    <Dialog open={!!celebration} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md border-none bg-transparent shadow-none p-0 overflow-visible">
        <div className="relative rounded-2xl overflow-hidden">
          {/* Gradient border effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-accent to-primary rounded-2xl p-[2px]">
            <div className="w-full h-full bg-background rounded-2xl" />
          </div>

          <div className="relative z-10 p-4 sm:p-8 text-center space-y-4 sm:space-y-6">
            {/* Animated icon */}
            <div className="flex justify-center">
              <div className="relative">
                {celebration === "welcome" ? (
                  <PartyPopper className="h-16 w-16 text-primary animate-bounce" />
                ) : (
                  <Cake className="h-16 w-16 text-primary animate-bounce" />
                )}
                {/* Glitter dots */}
                <div className="absolute -top-2 -left-2 w-3 h-3 bg-yellow-400 rounded-full animate-ping" />
                <div className="absolute -top-1 -right-3 w-2 h-2 bg-pink-400 rounded-full animate-ping" style={{ animationDelay: "0.3s" }} />
                <div className="absolute -bottom-1 -left-3 w-2 h-2 bg-blue-400 rounded-full animate-ping" style={{ animationDelay: "0.6s" }} />
                <div className="absolute -bottom-2 -right-2 w-3 h-3 bg-green-400 rounded-full animate-ping" style={{ animationDelay: "0.9s" }} />
              </div>
            </div>

            {celebration === "welcome" ? (
              <>
                <div className="space-y-2">
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                    Welcome, {userName}! 🎉
                  </h2>
                  <p className="text-muted-foreground text-lg">
                    Welcome to <span className="font-semibold text-primary">The VA Team's</span> New Portal
                  </p>
                  <p className="text-sm text-muted-foreground">
                    We're excited to have you on board. Explore your dashboard and get started!
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                    Happy Birthday, {userName}! 🎂
                  </h2>
                  <p className="text-muted-foreground text-lg">
                    Wishing you an amazing day from everyone at{" "}
                    <span className="font-semibold text-primary">The VA Team</span>!
                  </p>
                  <p className="text-sm text-muted-foreground">
                    🎈 May your day be filled with joy and celebrations! 🎈
                  </p>
                </div>
              </>
            )}

            <Button
              onClick={handleClose}
              size="lg"
              className="w-full h-12 text-base bg-gradient-to-r from-[hsl(355,70%,45%)] to-[hsl(210,64%,30%)] hover:opacity-90 text-white font-semibold touch-manipulation"
            >
              {celebration === "welcome" ? "Let's Go! 🚀" : "Thank You! 💖"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
