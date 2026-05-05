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
    "bg-[hsl(155_60%_15%_/_0.6)] text-[var(--color-success)] border-[hsl(155_60%_28%)]",
  warning:
    "bg-[hsl(38_60%_18%_/_0.6)] text-[var(--color-warning)] border-[hsl(38_60%_30%)]",
  danger:
    "bg-[hsl(0_60%_18%_/_0.6)] text-[var(--color-danger)] border-[hsl(0_60%_28%)]",
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
