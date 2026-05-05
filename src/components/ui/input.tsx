import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-[10px] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)]",
      "border border-[var(--color-border)] transition-all",
      "hover:border-[var(--color-border-strong)]",
      "focus:outline-none focus:border-[var(--color-border-accent)] focus:bg-[var(--color-surface-2)]",
      "focus:shadow-[var(--shadow-input-focus)]",
      "disabled:opacity-40 disabled:pointer-events-none",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";
