import * as React from "react";
import { cn } from "@/lib/utils";

/** Small red asterisk for required field labels. */
export function RequiredMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("ml-0.5 text-primary", className)}
      title="Required"
    >
      *
    </span>
  );
}

export default RequiredMark;
