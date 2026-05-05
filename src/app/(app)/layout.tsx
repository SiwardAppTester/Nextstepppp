import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import type { Category } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware should already redirect unauthed users; this is belt-and-braces.
  if (!user) redirect("/login");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, color, icon, context")
    .order("created_at", { ascending: true });

  // Mock-style task counts per category for the sidebar pill.
  // Cheap two-query approach is fine for a single-user app.
  const { data: openTasks } = await supabase
    .from("tasks")
    .select("category_id")
    .neq("status", "done");

  const taskCountByCat = new Map<string, number>();
  for (const t of openTasks ?? []) {
    if (t.category_id) {
      taskCountByCat.set(t.category_id, (taskCountByCat.get(t.category_id) ?? 0) + 1);
    }
  }

  return (
    <div className="flex h-dvh">
      <AppSidebar
        categories={(categories ?? []) as Category[]}
        taskCountByCat={Object.fromEntries(taskCountByCat)}
        user={{
          email: user.email ?? "",
          initial: (user.email?.[0] ?? "?").toUpperCase(),
        }}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
