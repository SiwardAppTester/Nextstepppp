"use client";

import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task, Category } from "@/lib/types";

const statusConfig = {
  todo: { Icon: Circle, color: "text-[var(--color-text-subtle)]", label: "Todo" },
  done: { Icon: Check, color: "text-[var(--color-success)]", label: "Done" },
} as const;

export function TaskRow({
  task,
  categories,
}: {
  task: Task;
  categories: Category[];
}) {
  const cat = task.category_id
    ? categories.find((c) => c.id === task.category_id)
    : undefined;
  // Fallback to "todo" if a row is somehow stored with a legacy status (doing/blocked).
  const status = statusConfig[task.status] ?? statusConfig.todo;
  const Icon = status.Icon;

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border bg-[var(--color-surface)] px-4 py-3.5 transition-all",
        "border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)]",
        "shadow-[var(--shadow-float)]",
        task.status === "done" && "opacity-60"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border transition-all",
          task.status === "done"
            ? "border-[var(--color-success)] bg-[var(--color-success-bg)]"
            : "border-[var(--color-border-strong)] group-hover:border-[var(--color-accent)] group-hover:bg-[var(--color-accent-soft)]"
        )}
        title={status.label}
      >
        <Icon className={cn("h-3 w-3", status.color)} strokeWidth={2.5} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "text-[14px] font-medium leading-snug",
                task.status === "done" && "line-through text-[var(--color-text-muted)]"
              )}
            >
              {task.title}
            </div>
            {task.description && (
              <div className="mt-1 text-[12.5px] text-[var(--color-text-muted)] line-clamp-2">
                {task.description}
              </div>
            )}
          </div>

        </div>

        {cat && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide"
              style={{
                backgroundColor: `${cat.color}14`,
                borderColor: `${cat.color}40`,
                color: cat.color,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: cat.color, boxShadow: `0 0 6px ${cat.color}` }}
              />
              {cat.name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
