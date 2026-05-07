"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, buildReminderEmail } from "@/lib/email";
import { validateIban, parseBankFromIban, pickColorForIban } from "@/lib/finance/iban";
import { decrypt } from "@/lib/gmail/crypto";
import { revokeToken } from "@/lib/gmail/oauth";
import { syncAccount, syncStaleAccounts, type GmailAccountRow } from "@/lib/gmail/sync";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function setAutoConfirm(value: boolean) {
  const { supabase, user } = await requireUser();
  // Upsert by user_id; the row exists once per user.
  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: user.id, auto_confirm: value, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
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

export async function addBankAccount(input: {
  iban: string;
  nickname: string;
  description?: string;
}) {
  const { supabase, user } = await requireUser();
  const v = validateIban(input.iban);
  if (!v.ok) return { ok: false, error: v.error };

  const nickname = input.nickname.trim();
  if (!nickname) return { ok: false, error: "Give the account a nickname." };

  const { error } = await supabase.from("bank_accounts").insert({
    user_id: user.id,
    iban: v.iban,
    nickname,
    description: input.description?.trim() || null,
    bank_name: parseBankFromIban(v.iban),
    color: pickColorForIban(v.iban),
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "This IBAN is already on your list." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateBankAccount(
  id: string,
  patch: { nickname?: string; description?: string }
) {
  const { supabase } = await requireUser();
  const update: Record<string, unknown> = {};
  if (patch.nickname !== undefined) {
    const trimmed = patch.nickname.trim();
    if (!trimmed) return { ok: false, error: "Nickname can't be empty." };
    update.nickname = trimmed;
  }
  if (patch.description !== undefined) {
    update.description = patch.description.trim() || null;
  }
  if (Object.keys(update).length === 0) return { ok: false, error: "Nothing to update." };

  const { error } = await supabase.from("bank_accounts").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteBankAccount(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function disconnectGmailAccount(id: string) {
  const { supabase } = await requireUser();
  // Best-effort revoke at Google before deleting our row.
  const { data: row } = await supabase
    .from("gmail_accounts")
    .select("encrypted_refresh_token")
    .eq("id", id)
    .single();
  if (row?.encrypted_refresh_token) {
    try {
      await revokeToken(decrypt(row.encrypted_refresh_token));
    } catch {
      // If the key changed or the token is already revoked, just drop the row.
    }
  }
  const { error } = await supabase.from("gmail_accounts").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  revalidatePath("/(app)", "layout");
  return { ok: true as const };
}

export async function refreshGmailAccounts() {
  const { supabase } = await requireUser();
  await syncStaleAccounts(supabase, 0); // 0 = always refresh
  revalidatePath("/settings");
  revalidatePath("/(app)", "layout");
  return { ok: true as const };
}

export async function refreshOneGmailAccount(id: string) {
  const { supabase } = await requireUser();
  const { data: row, error } = await supabase
    .from("gmail_accounts")
    .select(
      "id, email, encrypted_refresh_token, encrypted_access_token, access_token_expires_at, unread_count, last_synced_at"
    )
    .eq("id", id)
    .single();
  if (error || !row) return { ok: false as const, error: error?.message ?? "Account not found" };
  const result = await syncAccount(supabase, row as GmailAccountRow);
  revalidatePath("/settings");
  revalidatePath("/(app)", "layout");
  return result.ok
    ? { ok: true as const, unread: result.unread }
    : { ok: false as const, error: result.error };
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
