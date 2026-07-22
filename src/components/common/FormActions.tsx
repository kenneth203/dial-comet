import * as React from "react";
import { cn } from "@/lib/utils";

interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** When true, the row sticks to the bottom of a scrollable container. */
  sticky?: boolean;
}

/**
 * Footer row for forms. Right-aligned on desktop, stacked full-width on mobile.
 * Pass Cancel + Submit buttons (or any actions) as children.
 */
export function FormActions({
  className,
  sticky = false,
  children,
  ...rest
}: FormActionsProps) {
  return (
    <div
      {...rest}
      className={cn(
        "mt-6 flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3",
        sticky &&
          "sticky bottom-0 -mx-5 sm:-mx-6 bg-card/95 px-5 sm:px-6 backdrop-blur supports-[backdrop-filter]:bg-card/80",
        className
      )}
    >
      {children}
    </div>
  );
}

export default FormActions;
