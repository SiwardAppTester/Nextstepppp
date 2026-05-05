"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function updateCategoryContext(id: string, context: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("categories")
    .update({ context })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/(app)", "layout");
  return { ok: true };
}
