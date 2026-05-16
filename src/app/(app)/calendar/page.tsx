import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarView } from "./calendar-view";
import { syncStaleCalendars } from "@/lib/google-calendar/sync";
import type { Category, CalendarEvent } from "@/lib/types";

export default function CalendarPage() {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarContent />
    </Suspense>
  );
}

async function CalendarContent() {
  const supabase = await createClient();

  // Refresh any connected Google Calendars that haven't synced in 5 min.
  // RLS-scoped so it only touches the current user's accounts. Awaited so
  // the events we render below already reflect today's reality.
  await syncStaleCalendars(supabase);

  const [eventsRes, categoriesRes] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, title, description, location, category_id, goal_id, start_at, end_at, all_day, recurring, created_at, external_source, external_html_link"
      ),
    supabase
      .from("categories")
      .select("id, name, color, icon, context"),
  ]);

  return (
    <CalendarView
      events={(eventsRes.data ?? []) as CalendarEvent[]}
      categories={(categoriesRes.data ?? []) as Category[]}
    />
  );
}

function CalendarSkeleton() {
  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar crumbs={[{ label: "Calendar" }]} />
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-3">
        <Skeleton className="h-7 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-6">
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-12 mx-auto" />
          ))}
        </div>
        <div className="grid grid-cols-7 grid-rows-6 gap-1.5 h-[calc(100%-1.5rem)]">
          {Array.from({ length: 42 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 flex flex-col gap-1.5"
            >
              <Skeleton className="h-3 w-5" />
              {i % 3 === 0 && <Skeleton className="h-2.5 w-full" />}
              {i % 5 === 0 && <Skeleton className="h-2.5 w-3/4" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
