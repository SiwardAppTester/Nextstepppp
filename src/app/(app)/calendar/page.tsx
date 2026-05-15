import { createClient } from "@/lib/supabase/server";
import { CalendarView } from "./calendar-view";
import { syncStaleCalendars } from "@/lib/google-calendar/sync";
import type { Category, CalendarEvent } from "@/lib/types";

export default async function CalendarPage() {
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
