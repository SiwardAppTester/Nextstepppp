import { createClient } from "@/lib/supabase/server";
import { CalendarView } from "./calendar-view";
import type { Task, Category } from "@/lib/types";

export default async function CalendarPage() {
  const supabase = await createClient();
  const [tasksRes, categoriesRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, priority, category_id, due_date, scheduled_for, recurring, created_at"),
    supabase
      .from("categories")
      .select("id, name, color, icon, context"),
  ]);

  return (
    <CalendarView
      tasks={(tasksRes.data ?? []) as Task[]}
      categories={(categoriesRes.data ?? []) as Category[]}
    />
  );
}
