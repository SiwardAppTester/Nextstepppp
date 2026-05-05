"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, buildReminderEmail } from "@/lib/email";

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

export async function updateMemory(id: string, content: string, importance: number) {
  const { supabase } = await requireUser();
  if (!content.trim()) return { ok: false, error: "Content can't be empty" };
  const safeImp = Math.min(5, Math.max(1, Math.round(importance)));
  const { error } = await supabase
    .from("memory")
    .update({ content: content.trim(), importance: safeImp })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteMemory(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("memory").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function sendTestReminder() {
  const { user } = await requireUser();
  const recipient = process.env.REMINDER_EMAIL?.trim() ?? user.email;
  if (!recipient) return { ok: false, error: "No reminder email configured" };

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  const appUrl = `${proto}://${host}`;

  const { subject, html, text } = buildReminderEmail({
    taskTitle: "Test reminder — your Coach is wired up",
    taskDescription:
      "If you're seeing this, the cron + Resend pipeline is working. Real reminders for scheduled tasks fire on the same path.",
    categoryName: "Test",
    appUrl,
  });

  const res = await sendEmail({ to: recipient, subject, html, text });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, to: recipient };
}
