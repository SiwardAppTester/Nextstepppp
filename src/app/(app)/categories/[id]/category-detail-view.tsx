import Link from "next/link";
import { format } from "date-fns";
import { Target, MessageSquarePlus } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Category, Goal } from "@/lib/types";
import { ContextBlock } from "./context-block";
import { CategoryIconEditor } from "./category-icon-editor";

export function CategoryDetailView({
  category,
  goals,
}: {
  category: Category;
  goals: Goal[];
}) {
  const active = goals.filter((g) => g.status === "active");
  const done = goals.filter((g) => g.status === "done");
  const archived = goals.filter((g) => g.status === "archived");

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar
        crumbs={[{ label: "Categories" }, { label: category.name }]}
        right={
          <Link href="/chat">
            <Button size="sm" variant="ghost">
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Edit in chat
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[760px] space-y-8">
          {/* Header */}
          <header className="flex items-center gap-4">
            <CategoryIconEditor
              id={category.id}
              icon={category.icon}
              color={category.color}
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {category.name}
              </h1>
              <p className="text-[12px] text-[var(--color-text-subtle)] mt-0.5">
                {active.length} active · {done.length} done · {archived.length} archived
              </p>
            </div>
          </header>

          {/* Context */}
          <section>
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-subtle)] mb-2">
              Context
            </h2>
            <ContextBlock context={category.context} />
          </section>

          {/* Active goals */}
          <section>
            <h2 className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-subtle)] mb-2">
              Active goals
            </h2>
            {active.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-6 text-center text-[12.5px] text-[var(--color-text-subtle)]">
                No active goals. Ask the chat what you want to achieve here.
              </div>
            ) : (
              <ul className="space-y-2">
                {active.map((g) => (
                  <GoalCard key={g.id} goal={g} accent={category.color} />
                ))}
              </ul>
            )}
          </section>

          {done.length > 0 && (
            <section>
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-subtle)] mb-2">
                Achieved
              </h2>
              <ul className="space-y-2">
                {done.map((g) => (
                  <GoalCard key={g.id} goal={g} accent={category.color} muted />
                ))}
              </ul>
            </section>
          )}

          {archived.length > 0 && (
            <section>
              <h2 className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-subtle)] mb-2">
                Archived
              </h2>
              <ul className="space-y-2">
                {archived.map((g) => (
                  <GoalCard key={g.id} goal={g} accent={category.color} muted />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function GoalCard({
  goal,
  accent,
  muted = false,
}: {
  goal: Goal;
  accent: string;
  muted?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 transition-colors",
        muted && "opacity-60"
      )}
    >
      <div
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
        style={{
          backgroundColor: `${accent}18`,
          borderColor: `${accent}55`,
          color: accent,
        }}
      >
        <Target className="h-3 w-3" strokeWidth={2.4} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[13.5px] font-medium truncate">{goal.title}</h3>
          {goal.target_date && (
            <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-text-subtle)]">
              {format(new Date(goal.target_date), "MMM d, yyyy")}
            </span>
          )}
        </div>
        {goal.description?.trim() && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-text-muted)] whitespace-pre-wrap">
            {goal.description}
          </p>
        )}
      </div>
    </li>
  );
}
