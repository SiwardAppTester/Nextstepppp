import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, buildReminderEmail } from "@/lib/email";
import { nextOccurrence } from "@/lib/recurring";

/**
 * Reminder cron — invoked every 5 minutes by Vercel Cron.
 *
 * Find tasks where `scheduled_for <= now()` AND `reminder_sent = false` AND
 * `status != 'done'`. For each:
 *   1. Send an email via Resend
 *   2. Mark `reminder_sent = true`
 *   3. If the task is recurring, create the next occurrence (so the cycle continues)
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Without it the
 * route 401s — the endpoint is otherwise reachable from the public internet
 * (it lives outside the proxy's PUBLIC_PATHS gate, so the proxy redirects
 * anonymous browsers to /login; only non-browser callers with the bearer get through).
 */
export async function GET(request: NextRequest) {
  return handle(request);
}

// Allow POST too — useful for manual test invocations from the settings page.
export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  // Find due reminders.
  const { data: dueTasks, error: queryErr } = await supabase
    .from("tasks")
    .select("id, user_id, title, description, category_id, scheduled_for, recurring, status")
    .lte("scheduled_for", nowIso)
    .eq("reminder_sent", false)
    .neq("status", "done");

  if (queryErr) {
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  if (!dueTasks?.length) {
    return NextResponse.json({ ok: true, fired: 0, checked_at: nowIso });
  }

  // Resolve recipient(s) and category names in two cheap batched queries.
  const userIds = [...new Set(dueTasks.map((t) => t.user_id))];
  const catIds = [...new Set(dueTasks.map((t) => t.category_id).filter(Boolean) as string[])];

  const [{ data: cats }, recipientByUser] = await Promise.all([
    catIds.length
      ? supabase.from("categories").select("id, name").in("id", catIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    resolveRecipients(supabase, userIds),
  ]);
  const catNameById = new Map((cats ?? []).map((c) => [c.id, c.name]));

  const results: { task_id: string; ok: boolean; error?: string }[] = [];

  for (const task of dueTasks) {
    const to = recipientByUser.get(task.user_id);
    if (!to) {
      results.push({ task_id: task.id, ok: false, error: "no recipient email resolved" });
      continue;
    }

    const { subject, html, text } = buildReminderEmail({
      taskTitle: task.title,
      taskDescription: task.description,
      categoryName: task.category_id ? catNameById.get(task.category_id) ?? null : null,
      appUrl,
    });

    const sendRes = await sendEmail({ to, subject, html, text });
    if (!sendRes.ok) {
      results.push({ task_id: task.id, ok: false, error: sendRes.error });
      continue;
    }

    // Mark sent.
    const { error: updateErr } = await supabase
      .from("tasks")
      .update({ reminder_sent: true })
      .eq("id", task.id);
    if (updateErr) {
      results.push({ task_id: task.id, ok: false, error: updateErr.message });
      continue;
    }

    // Roll forward recurring tasks: create the next occurrence with reminder_sent=false.
    if (task.recurring && task.scheduled_for) {
      const nextIso = nextOccurrence(task.recurring, task.scheduled_for);
      if (nextIso) {
        const { error: insertErr } = await supabase.from("tasks").insert({
          user_id: task.user_id,
          title: task.title,
          description: task.description,
          category_id: task.category_id,
          recurring: task.recurring,
          scheduled_for: nextIso,
          reminder_sent: false,
          status: "todo",
        });
        if (insertErr) {
          // Don't fail the whole reminder over this — but surface in the response.
          results.push({ task_id: task.id, ok: true, error: `next-occurrence insert failed: ${insertErr.message}` });
          continue;
        }
      }
    }

    results.push({ task_id: task.id, ok: true });
  }

  return NextResponse.json({
    ok: true,
    checked_at: nowIso,
    fired: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

/**
 * Pick which email each user's reminders should go to:
 *   - REMINDER_EMAIL env var if set (single-user override; needed when Resend's
 *     sandbox sender restricts deliveries to your Resend-account email)
 *   - Otherwise fall back to the user's auth email
 */
async function resolveRecipients(
  supabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const override = process.env.REMINDER_EMAIL?.trim().toLowerCase();

  if (override) {
    for (const id of userIds) out.set(id, override);
    return out;
  }

  // Look up each user's email from auth.users via the admin API.
  for (const id of userIds) {
    const { data } = await supabase.auth.admin.getUserById(id);
    if (data?.user?.email) out.set(id, data.user.email);
  }
  return out;
}
