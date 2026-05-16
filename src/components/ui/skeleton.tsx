import { cn } from "@/lib/utils";

// Animated placeholder block. Shimmer keyframe + base styles live in globals.css
// under `.skeleton`. Pass width/height via Tailwind utilities on `className`.
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} {...props} />;
}
