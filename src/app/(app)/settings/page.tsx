import { createClient } from "@/lib/supabase/server";
import { SettingsView, type Memory } from "./settings-view";
import type { Category } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: categories }, { data: memories }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, color, icon, context")
      .order("created_at", { ascending: true }),
    supabase
      .from("memory")
      .select("id, content, importance, category_id, created_at")
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  return (
    <SettingsView
      categories={(categories ?? []) as Category[]}
      memories={(memories ?? []) as Memory[]}
      userEmail={user?.email ?? ""}
    />
  );
}
