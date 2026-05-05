import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const dims: Record<Size, { box: string; text: string }> = {
  sm: { box: "h-7 w-7", text: "text-[12px]" },
  md: { box: "h-9 w-9", text: "text-[15px]" },
  lg: { box: "h-12 w-12", text: "text-[19px]" },
};

/**
 * Brand mark — replaces the previous Sparkles icon. A monochrome 'N' wordmark
 * inside a soft accent-tinted box. Auto-inverts with theme.
 */
export function BrandMark({
  size = "sm",
  className,
}: {
  size?: Size;
  className?: string;
}) {
  const { box, text } = dims[size];
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-md bg-[var(--color-accent-soft)] border border-[var(--color-border-accent)]",
        box,
        className
      )}
    >
      <span
        className={cn(
          "font-semibold tracking-tight text-[var(--color-accent)]",
          text
        )}
      >
        N
      </span>
      <div className="absolute inset-0 rounded-md shadow-[0_0_18px_-6px_var(--color-accent-glow)] pointer-events-none" />
    </div>
  );
}
