"use client";

import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Category, CalendarEvent } from "@/lib/types";

export function CalendarView({
  events,
  categories,
}: {
  events: CalendarEvent[];
  categories: Category[];
}) {
  const [cursor, setCursor] = useState(new Date());

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function sameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  // Multi-day events appear on every day from start_at's day through end_at's
  // day (inclusive). Events without end_at are single-day.
  function eventCoversDay(ev: CalendarEvent, d: Date): boolean {
    const startMs = startOfDay(new Date(ev.start_at)).getTime();
    const endMs = ev.end_at ? startOfDay(new Date(ev.end_at)).getTime() : startMs;
    const target = startOfDay(d).getTime();
    return target >= startMs && target <= endMs;
  }

  function eventsOn(d: Date): CalendarEvent[] {
    return events
      .filter((e) => eventCoversDay(e, d))
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
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
              const dayEvents = eventsOn(day);
              return (
                <div
                  key={idx}
                  className={cn(
                    "relative border-b border-r border-[var(--color-border)] p-2 text-[12px] transition-colors hover:bg-[var(--color-surface-hover)]",
                    !inMonth && "opacity-40",
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
                    {dayEvents.slice(0, 3).map((ev) => {
                      const cat = categoryById(ev.category_id);
                      const dotColor = cat?.color ?? "var(--color-text-subtle)";
                      const isStartDay = sameDay(new Date(ev.start_at), day);
                      const time =
                        isStartDay && !ev.all_day
                          ? format(new Date(ev.start_at), "HH:mm")
                          : null;
                      return (
                        <div
                          key={ev.id}
                          className="flex items-center gap-1.5 truncate rounded-[5px] bg-[var(--color-surface-2)] px-1.5 py-1 text-[11px] transition-colors hover:bg-[var(--color-surface-hover)]"
                          title={`${ev.title}${ev.location ? ` · ${ev.location}` : ""}`}
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: dotColor }}
                          />
                          {time && (
                            <span className="shrink-0 tabular-nums text-[10.5px] text-[var(--color-text-subtle)]">
                              {time}
                            </span>
                          )}
                          <span className="truncate font-medium text-[var(--color-text)]">
                            {ev.title}
                          </span>
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className="px-1 text-[10px] text-[var(--color-text-subtle)]">
                        + {dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
