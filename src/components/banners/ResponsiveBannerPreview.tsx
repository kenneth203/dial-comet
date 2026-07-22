import { Monitor, Smartphone, Tablet } from "lucide-react";

interface ResponsiveBannerPreviewProps {
  src: string;
  alt?: string;
}

const FRAMES = [
  { label: "Mobile", width: 375, Icon: Smartphone },
  { label: "Tablet", width: 768, Icon: Tablet },
  { label: "Desktop", width: 1280, Icon: Monitor },
];

/**
 * Renders the same image at fixed mobile/tablet/desktop widths using the exact
 * styling (`w-full h-auto`) used by the dashboard hero banner, so admins can
 * see how the banner will crop and scale at each breakpoint before saving.
 */
export function ResponsiveBannerPreview({ src, alt = "Banner preview" }: ResponsiveBannerPreviewProps) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex flex-col gap-6 min-w-fit">
        {FRAMES.map(({ label, width, Icon }) => (
          <div key={label} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
              <span className="text-muted-foreground/70">· {width}px</span>
            </div>
            <div
              className="border border-border rounded-md overflow-hidden bg-muted"
              style={{ width: `${width}px` }}
            >
              <img src={src} alt={alt} className="w-full h-auto block" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
