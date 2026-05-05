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

export async function createTask(formData: FormData) {
  const { supabase, user } = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const category_id = String(formData.get("category_id") ?? "") || null;
  const priorityRaw = Number(formData.get("priority") ?? 3);
  const priority = Number.isFinite(priorityRaw)
    ? Math.min(5, Math.max(1, priorityRaw))
    : 3;

  if (!title) return { error: "Title required" };

  const { error } = await supabase.from("tasks").insert({
    user_id: user.id,
    title,
    category_id,
    priority,
  });
  if (error) return { error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/calendar");
  revalidatePath("/(app)", "layout"); // refresh sidebar counts
  return { ok: true };
}

export async function toggleTaskStatus(id: string, currentStatus: string) {
  const { supabase } = await requireUser();
  const newStatus = currentStatus === "done" ? "todo" : "done";
  const completed_at = newStatus === "done" ? new Date().toISOString() : null;

  const { error } = await supabase
    .from("tasks")
    .update({ status: newStatus, completed_at })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/calendar");
  revalidatePath("/(app)", "layout");
  return { ok: true };
}

export async function deleteTask(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/calendar");
  revalidatePath("/(app)", "layout");
  return { ok: true };
}
