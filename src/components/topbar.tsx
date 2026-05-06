import { ChevronRight } from "lucide-react";

type Crumb = { label: string; href?: string };

export function Topbar({
  crumbs,
  right,
}: {
  crumbs: Crumb[];
  right?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)]/70 backdrop-blur-xl px-6">
      <nav className="flex items-center gap-1.5 text-[13px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5">
              <span
                className={
                  last
                    ? "text-[var(--color-text)] font-medium"
                    : "text-[var(--color-text-muted)]"
                }
              >
                {c.label}
              </span>
              {!last && (
                <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-subtle)]" />
              )}
            </span>
          );
        })}
      </nav>
      <div className="flex items-center gap-2">
        {right}
      </div>
    </div>
  );
}
