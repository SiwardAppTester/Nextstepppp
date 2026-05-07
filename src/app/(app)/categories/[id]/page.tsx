import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CategoryDetailView } from "./category-detail-view";
import type { Category, Goal } from "@/lib/types";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
