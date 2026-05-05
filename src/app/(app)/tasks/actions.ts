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

/**
 * Move a task's scheduled_for (and/or due_date) to a new date — preserving the
 * original time of day. Used by the calendar's drag-to-reschedule.
 *
 * Resets reminder_sent so the cron will re-fire if the new time is in the future.
 */
export async function rescheduleTask(id: string, newDateIso: string) {
  const { supabase } = await requireUser();

  const { data: task, error: fetchErr } = await supabase
    .from("tasks")
    .select("id, scheduled_for, due_date")
    .eq("id", id)
    .single();
  if (fetchErr || !task) return { error: fetchErr?.message ?? "Task not found" };

  const newDate = new Date(newDateIso);
  if (isNaN(newDate.getTime())) return { error: "Invalid date" };

  const patch: Record<string, string | boolean | null> = {};
  if (task.scheduled_for) {
    const old = new Date(task.scheduled_for);
    newDate.setHours(old.getHours(), old.getMinutes(), 0, 0);
    patch.scheduled_for = newDate.toISOString();
    patch.reminder_sent = false;
  } else if (task.due_date) {
    const old = new Date(task.due_date);
    newDate.setHours(old.getHours(), old.getMinutes(), 0, 0);
    patch.due_date = newDate.toISOString();
  } else {
    // Task had neither — set scheduled_for to 9am on the new day.
    newDate.setHours(9, 0, 0, 0);
    patch.scheduled_for = newDate.toISOString();
    patch.reminder_sent = false;
  }

  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/calendar");
  revalidatePath("/tasks");
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
