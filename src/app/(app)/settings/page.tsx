import { createClient } from "@/lib/supabase/server";
import { SettingsView } from "./settings-view";
import type { Category } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, color, icon, context")
    .order("created_at", { ascending: true });

  return (
    <SettingsView
      categories={(categories ?? []) as Category[]}
      userEmail={user?.email ?? ""}
    />
  );
}
