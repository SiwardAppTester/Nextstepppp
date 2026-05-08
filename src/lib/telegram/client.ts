/**
 * Tiny Telegram Bot API wrapper. Server-only — uses TELEGRAM_BOT_TOKEN.
 * Only the methods we need: sendMessage and (in scripts) setWebhook.
 */

const TELEGRAM_API = "https://api.telegram.org";
const MAX_MESSAGE_LEN = 4096;

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  return t;
}

/**
 * Send a text message. Telegram caps each message at 4096 chars, so we split
 * on paragraph/word boundaries. Plain text mode (no parse_mode) — safest for
 * arbitrary Coach output containing markdown-like punctuation.
 */
export async function sendMessage(chatId: number, text: string): Promise<void> {
  const chunks = splitForTelegram(text);
  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/bot${token()}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
    }
  }
}

/** Show "typing…" so the user knows we got it while the model works. */
export async function sendTyping(chatId: number): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${token()}/sendChatAction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {
    // Best-effort; never block on the indicator.
  });
}

/**
 * Split a long string into <=4096-char chunks. Prefer paragraph breaks,
 * fall back to whitespace, fall back to hard cut. Empty strings become a
 * single chunk so we still send something.
 */
export function splitForTelegram(text: string): string[] {
  if (!text) return [""];
  if (text.length <= MAX_MESSAGE_LEN) return [text];

  const out: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_MESSAGE_LEN) {
    let cut = remaining.lastIndexOf("\n\n", MAX_MESSAGE_LEN);
    if (cut < MAX_MESSAGE_LEN / 2) cut = remaining.lastIndexOf("\n", MAX_MESSAGE_LEN);
    if (cut < MAX_MESSAGE_LEN / 2) cut = remaining.lastIndexOf(" ", MAX_MESSAGE_LEN);
    if (cut < MAX_MESSAGE_LEN / 2) cut = MAX_MESSAGE_LEN;
    out.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) out.push(remaining);
  return out;
}
