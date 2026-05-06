"use client";

import { format, isToday, isTomorrow, isPast } from "date-fns";
import { Check, Circle, Calendar, AlarmClock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task, Category } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const statusConfig = {
  todo: { Icon: Circle, color: "text-[var(--color-text-subtle)]", label: "Todo" },
  done: { Icon: Check, color: "text-[var(--color-success)]", label: "Done" },
} as const;

function formatDate(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return `Today · ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Tomorrow · ${format(d, "HH:mm")}`;
  return format(d, "MMM d · HH:mm");
}

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
  const overdue =
    task.due_date && task.status !== "done" && isPast(new Date(task.due_date));

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border bg-[var(--color-surface)] px-4 py-3.5 transition-all",
        "border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)]",
        "shadow-[var(--shadow-float)]",
        task.status === "done" && "opacity-60"
      )}
    >
      <button
        className={cn(
          "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border transition-all",
          task.status === "done"
            ? "border-[var(--color-success)] bg-[hsl(155_60%_15%_/_0.6)]"
            : "border-[var(--color-border-strong)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
        )}
        title={status.label}
      >
        <Icon className={cn("h-3 w-3", status.color)} strokeWidth={2.5} />
      </button>

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

          {task.priority <= 2 && task.status !== "done" && (
            <Badge tone={task.priority === 1 ? "danger" : "warning"} className="shrink-0">
              P{task.priority}
            </Badge>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {cat && (
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
          )}

          {task.due_date && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px]",
                overdue ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]"
              )}
            >
              <Calendar className="h-3 w-3" />
              Due {formatDate(task.due_date)}
            </span>
          )}

          {task.scheduled_for && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
              <AlarmClock className="h-3 w-3" />
              {formatDate(task.scheduled_for)}
            </span>
          )}

          {task.recurring && (
            <Badge tone="neutral" className="!py-0">
              {task.recurring}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
