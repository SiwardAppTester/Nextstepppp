import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryDetailView } from "./category-detail-view";
import type { Category, Goal } from "@/lib/types";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<CategorySkeleton />}>
      <CategoryContent id={id} />
    </Suspense>
  );
}

async function CategoryContent({ id }: { id: string }) {
  const supabase = await createClient();

  const [categoryRes, goalsRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, color, icon, context")
      .eq("id", id)
      .single(),
    supabase
      .from("goals")
      .select("id, category_id, title, description, target_date, status, completed_at, created_at")
      .eq("category_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (categoryRes.error || !categoryRes.data) notFound();

  return (
    <CategoryDetailView
      category={categoryRes.data as Category}
      goals={(goalsRes.data ?? []) as Goal[]}
    />
  );
}

function CategorySkeleton() {
  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar crumbs={[{ label: "Categories" }, { label: "Loading…" }]} />
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[760px] space-y-8">
          <header className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-[10px]" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </header>
          <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-4/6" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2"
              >
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
