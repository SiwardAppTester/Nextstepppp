import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
};

const toneClasses: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral:
    "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border-[var(--color-border)]",
  accent:
    "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-border-accent)]",
  success:
    "bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]",
  warning:
    "bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]",
  danger:
    "bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
