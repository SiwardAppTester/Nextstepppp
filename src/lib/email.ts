/**
 * Resend email helper. Uses Resend's REST API directly (no SDK dep).
 *
 * The `from` address is the Supabase SMTP sender for now (`onboarding@resend.dev`),
 * which is Resend's sandbox sender — it can only deliver to the email registered to
 * your Resend account. Verify a domain in Resend → switch this `from` later.
 */
type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const FROM = '"Nextsteppp Coach" <onboarding@resend.dev>';

export async function sendEmail(input: SendEmailInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `${res.status} ${body}` };
  }
  const data: { id?: string } = await res.json();
  return { ok: true, id: data.id ?? "" };
}

/**
 * Reminder email body — minimal, on-brand, scannable in a notification preview.
 */
export function buildReminderEmail(opts: {
  taskTitle: string;
  taskDescription?: string | null;
  categoryName?: string | null;
  appUrl: string;
}) {
  const { taskTitle, taskDescription, categoryName, appUrl } = opts;
  const subject = `⏰ ${taskTitle}`;
  const cat = categoryName ? `<span style="color:#888;font-size:13px;">${categoryName}</span>` : "";
  const desc = taskDescription
    ? `<p style="color:#555;font-size:14px;line-height:1.5;margin:12px 0 0;">${escapeHtml(taskDescription)}</p>`
    : "";

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;border:1px solid #e5e7eb;">
    <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#888;margin-bottom:14px;">Nextsteppp · Reminder</div>
    <h1 style="font-size:20px;font-weight:600;margin:0;color:#111;line-height:1.3;">${escapeHtml(taskTitle)}</h1>
    ${cat ? `<div style="margin-top:6px;">${cat}</div>` : ""}
    ${desc}
    <div style="margin-top:24px;">
      <a href="${appUrl}/tasks" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:500;">Open tasks</a>
    </div>
    <div style="margin-top:18px;color:#999;font-size:12px;">This is an automated reminder from your Coach.</div>
  </div>
</body></html>`;

  const text = `Reminder: ${taskTitle}${categoryName ? ` (${categoryName})` : ""}${taskDescription ? `\n\n${taskDescription}` : ""}\n\nOpen tasks: ${appUrl}/tasks`;

  return { subject, html, text };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
