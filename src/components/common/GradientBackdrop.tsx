import React, { useEffect, useRef } from "react";

// Subtle animated radial gradient that follows the cursor. Uses design tokens.
const GradientBackdrop: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      el.style.setProperty("--x", `${x}px`);
      el.style.setProperty("--y", `${y}px`);
    };

    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        background:
          "radial-gradient(600px at var(--x, 50%) var(--y, 20%), hsl(var(--primary-glow) / 0.15), transparent 60%)",
        transition: "var(--transition-smooth)",
      }}
    />
  );
};

export default GradientBackdrop;
