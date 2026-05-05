import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[60px] w-full rounded-[10px] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)]",
      "border border-[var(--color-border)] transition-all resize-none",
      "hover:border-[var(--color-border-strong)]",
      "focus:outline-none focus:border-[var(--color-border-accent)] focus:bg-[var(--color-surface-2)]",
      "focus:shadow-[var(--shadow-input-focus)]",
      "disabled:opacity-40 disabled:pointer-events-none",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
