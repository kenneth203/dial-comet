import * as React from "react";
import { cn } from "@/lib/utils";

interface FormSectionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Number of columns on md+. Defaults to 2. Set to 1 for stacked fields. */
  columns?: 1 | 2 | 3;
}

export function FormSection({
  title,
  description,
  columns = 2,
  className,
  children,
  ...rest
}: FormSectionProps) {
  const gridCols =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
      ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
      : "grid-cols-1 md:grid-cols-2";

  return (
    <div {...rest} className={cn("space-y-3", className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-primary-variant">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className={cn("grid gap-4", gridCols)}>{children}</div>
    </div>
  );
}

export default FormSection;
