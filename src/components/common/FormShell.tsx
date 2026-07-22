import * as React from "react";
import { cn } from "@/lib/utils";

interface FormShellProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** When true (default), renders the white card chrome. Set false when the form is already inside a Dialog/Sheet. */
  bordered?: boolean;
}

/**
 * Brand-aligned wrapper for forms.
 * - White card surface, navy accent bar in the header.
 * - Use inside pages directly. Inside Dialog/Sheet, pass bordered={false}.
 */
export function FormShell({
  title,
  description,
  bordered = true,
  className,
  children,
  ...rest
}: FormShellProps) {
  return (
    <div
      {...rest}
      className={cn(
        bordered &&
          "rounded-2xl border border-border/60 bg-card shadow-card",
        bordered && "p-5 sm:p-6",
        className
      )}
    >
      {(title || description) && (
        <header className="mb-5 flex items-start gap-3 border-b border-border/60 pb-4">
          <span
            aria-hidden
            className="mt-1 h-6 w-1 rounded-full bg-primary-variant"
          />
          <div className="space-y-1">
            {title && (
              <h2 className="text-base font-semibold leading-tight text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </header>
      )}
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export default FormShell;
