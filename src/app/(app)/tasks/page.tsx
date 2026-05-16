import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { TasksView } from "./tasks-view";
import type { Task, Category } from "@/lib/types";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const params = await searchParams;
  return (
    <Suspense fallback={<TasksSkeleton />}>
      <TasksContent categoryFilter={params.category ?? "all"} />
    </Suspense>
  );
}

async function TasksContent({ categoryFilter }: { categoryFilter: string }) {
  const supabase = await createClient();

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
      initialCategoryFilter={categoryFilter}
    />
  );
}

function TasksSkeleton() {
  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar crumbs={[{ label: "Tasks" }]} />
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/60 backdrop-blur-sm px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex justify-start">
            <Skeleton className="h-9 w-full max-w-[320px]" />
          </div>
          <div className="flex-1 flex justify-center">
            <Skeleton className="h-9 w-[180px]" />
          </div>
          <div className="flex-1 flex justify-end">
            <Skeleton className="h-9 w-[140px]" />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="space-y-1.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3"
            >
              <Skeleton className="h-4 w-4 rounded-[4px]" />
              <Skeleton className="h-3.5 flex-1 max-w-[420px]" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
