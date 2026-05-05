import { createClient } from "@/lib/supabase/server";
import { TasksView } from "./tasks-view";
import type { Task, Category } from "@/lib/types";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const [tasksRes, categoriesRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, color, icon, context")
      .order("created_at", { ascending: true }),
  ]);

  return (
    <TasksView
      initialTasks={(tasksRes.data ?? []) as Task[]}
      categories={(categoriesRes.data ?? []) as Category[]}
      initialCategoryFilter={params.category ?? "all"}
    />
  );
}
