"use client";

import { useState, useTransition } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Task, Category } from "@/lib/types";
import { rescheduleTask } from "../tasks/actions";

export function CalendarView({
  tasks,
  categories,
}: {
  tasks: Task[];
  categories: Category[];
}) {
  const [cursor, setCursor] = useState(new Date());
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDrop(targetDay: Date) {
    if (!draggingTaskId) return;
    const id = draggingTaskId;
    setDraggingTaskId(null);
    setDragOverDate(null);
    startTransition(async () => {
      await rescheduleTask(id, targetDay.toISOString());
    });
  }

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function tasksOn(d: Date) {
    return tasks.filter((t) => {
      const when = t.scheduled_for ?? t.due_date;
      if (!when) return false;
      const dt = new Date(when);
      return (
        dt.getFullYear() === d.getFullYear() &&
        dt.getMonth() === d.getMonth() &&
        dt.getDate() === d.getDate()
      );
    });
  }

  function categoryById(id: string | null) {
    return id ? categories.find((c) => c.id === id) : undefined;
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar
        crumbs={[{ label: "Calendar" }, { label: format(cursor, "MMMM yyyy") }]}
        right={
          <div className="flex items-center gap-1.5">
            <Button size="icon-sm" variant="ghost" onClick={() => setCursor(subMonths(cursor, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setCursor(new Date())}>
              Today
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="primary" className="ml-2" disabled>
              <Plus className="h-3.5 w-3.5" />
              New event
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden p-6">
        <div className="float-card h-full flex flex-col">
          <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div
                key={d}
                className="px-3 py-2.5 text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)] font-medium"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 flex-1 auto-rows-fr">
            {days.map((day, idx) => {
              const inMonth = isSameMonth(day, cursor);
              const today = isToday(day);
              const ts = tasksOn(day);
              const dayKey = day.toISOString().slice(0, 10);
              const isDragOver = dragOverDate === dayKey;
              return (
                <div
                  key={idx}
                  onDragOver={(e) => {
                    if (!draggingTaskId) return;
                    e.preventDefault();
                    if (dragOverDate !== dayKey) setDragOverDate(dayKey);
                  }}
                  onDragLeave={() => {
                    if (dragOverDate === dayKey) setDragOverDate(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDrop(day);
                  }}
                  className={cn(
                    "relative border-b border-r border-[var(--color-border)] p-2 text-[12px] transition-colors",
                    !isDragOver && "hover:bg-[var(--color-surface-hover)]",
                    isDragOver && "bg-[var(--color-accent-soft)] ring-1 ring-inset ring-[var(--color-border-accent)]",
                    !inMonth && "opacity-40",
                    pending && "pointer-events-none",
                    (idx + 1) % 7 === 0 && "border-r-0",
                    idx >= days.length - 7 && "border-b-0"
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums",
                        today
                          ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-[0_0_12px_-2px_var(--color-accent-glow)]"
                          : "text-[var(--color-text)]"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {ts.slice(0, 3).map((t) => {
                      const cat = categoryById(t.category_id);
                      const isDragging = draggingTaskId === t.id;
                      return (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggingTaskId(t.id);
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", t.id);
                          }}
                          onDragEnd={() => {
                            setDraggingTaskId(null);
                            setDragOverDate(null);
                          }}
                          className={cn(
                            "truncate rounded-[6px] border px-1.5 py-1 text-[10.5px] font-medium cursor-grab active:cursor-grabbing transition-opacity",
                            isDragging && "opacity-40"
                          )}
                          style={{
                            backgroundColor: cat ? `${cat.color}18` : "var(--color-surface-2)",
                            borderColor: cat ? `${cat.color}55` : "var(--color-border)",
                            color: cat ? cat.color : "var(--color-text)",
                          }}
                          title={`${t.title} — drag to reschedule`}
                        >
                          {t.title}
                        </div>
                      );
                    })}
                    {ts.length > 3 && (
                      <div className="text-[10px] text-[var(--color-text-subtle)] px-1">
                        + {ts.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 text-center text-[11px] text-[var(--color-text-subtle)]">
          Drag any task chip to a different day to reschedule. Time-of-day is preserved.
        </div>
      </div>
    </div>
  );
}
