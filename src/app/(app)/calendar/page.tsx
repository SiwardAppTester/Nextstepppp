import { createClient } from "@/lib/supabase/server";
import { CalendarView } from "./calendar-view";
import type { Category, CalendarEvent } from "@/lib/types";

export default async function CalendarPage() {
  const supabase = await createClient();
  const [eventsRes, categoriesRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, description, location, category_id, goal_id, start_at, end_at, all_day, recurring, created_at"),
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
