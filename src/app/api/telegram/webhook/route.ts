import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs, type ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { AI_BOOST_SYSTEM_PROMPT } from "@/lib/ai-boost/system-prompt";
import { buildUserContextBlock } from "@/lib/ai-boost/dynamic-context";
import { buildAiBoostTools } from "@/lib/ai-boost/tools";
import { sendMessage, sendTyping } from "@/lib/telegram/client";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_STEPS = 8;
const HISTORY_LIMIT = 30;

export const maxDuration = 60;

/**
 * Telegram webhook bridge.
 *
 * Flow:
 *   Telegram → POST here → verify secret → resolve owner user (admin client)
 *   → pin or match owner chat → load/continue most recent conversation
 *   → run the same Coach pipeline as /api/chat (system prompt, tools, dynamic
 *     context) but via generateText (no streaming — Telegram can't stream)
 *   → persist messages → reply via sendMessage
 *
 * We always respond 200 to Telegram so it doesn't retry. Real errors get
 * surfaced to the user as a chat message instead.
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const providedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json().catch(() => null) as TelegramUpdate | null;
  if (!update) return NextResponse.json({ ok: true });

  // Only handle plain text in private chats. Anything else (stickers, edits,
  // group adds) gets a 200 so Telegram stops retrying.
  const message = update.message;
  if (!message?.text || !message.chat || message.chat.type !== "private") {
    return NextResponse.json({ ok: true });
  }
  const chatId = message.chat.id;
  const text = message.text.trim();
  if (!text) return NextResponse.json({ ok: true });

  const admin = createAdminClient();

  let ownerUserId: string;
  try {
    ownerUserId = await resolveOwnerUserId(admin);
  } catch (err) {
    console.error("[telegram] owner resolution failed", err);
    return NextResponse.json({ ok: true });
  }

  // Owner-chat gate. First inbound message pins the chat ID; subsequent
  // messages from any other chat are silently dropped (private bot).
  const allowed = await ensureOwnerChat(admin, ownerUserId, chatId, message.from?.username);
  if (!allowed) return NextResponse.json({ ok: true });

  await sendTyping(chatId);

  try {
    const reply = await runCoach(admin, ownerUserId, text);
    await sendMessage(chatId, reply || "(no reply)");
  } catch (err) {
    console.error("[telegram] coach run failed", err);
    const detail = err instanceof Error ? err.message : "unknown error";
    await sendMessage(chatId, `Something broke on my end: ${detail}`).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

// =========================================================================
// Owner resolution + chat pinning
// =========================================================================

let cachedOwnerUserId: string | null = null;

async function resolveOwnerUserId(admin: SupabaseClient): Promise<string> {
  if (cachedOwnerUserId) return cachedOwnerUserId;
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) throw new Error("OWNER_EMAIL not set");

  // Single-user app — listUsers returns a tiny page. Fine to scan.
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw new Error(`listUsers: ${error.message}`);
  const owner = data.users.find((u) => u.email?.toLowerCase() === ownerEmail);
  if (!owner) throw new Error(`No auth user with email ${ownerEmail}`);
  cachedOwnerUserId = owner.id;
  return owner.id;
}

async function ensureOwnerChat(
  admin: SupabaseClient,
  userId: string,
  incomingChatId: number,
  username: string | undefined
): Promise<boolean> {
  const { data: existing } = await admin
    .from("telegram_config")
    .select("chat_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.chat_id != null) {
    return Number(existing.chat_id) === incomingChatId;
  }

  // First message — pin this chat as the owner's.
  const { error } = await admin.from("telegram_config").insert({
    user_id: userId,
    chat_id: incomingChatId,
    username: username ?? null,
  });
  if (error) {
    console.error("[telegram] pin failed", error);
    return false;
  }
  return true;
}

// =========================================================================
// Coach pipeline (mirrors /api/chat, no streaming)
// =========================================================================

async function runCoach(
  admin: SupabaseClient,
  userId: string,
  userText: string
): Promise<string> {
  const conversationId = await resolveTelegramConversation(admin, userId, userText);

  await admin.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: { text: userText },
  });

  const history = await loadHistory(admin, conversationId);
  const contextBlock = await buildUserContextBlock(admin, userId);

  // Wrap the latest user turn with dynamic context — same shape as /api/chat.
  // The DB row above stays unwrapped; only the model sees the wrapper.
  const wrappedUser = `${contextBlock}\n\n<user_message>\n${userText}\n</user_message>`;
  const modelMessages: ModelMessage[] = [
    ...history,
    { role: "user", content: wrappedUser },
  ];

  const { data: prefs } = await admin
    .from("user_settings")
    .select("auto_confirm")
    .eq("user_id", userId)
    .maybeSingle();
  const autoConfirm = prefs?.auto_confirm ?? false;

  const systemPrompt = autoConfirm
    ? `${AI_BOOST_SYSTEM_PROMPT}\n\n# Auto-confirm mode\n\nThe user has turned ON auto-confirm. Skip "should I add this?" or "want me to create…?" check-ins for routine captures. When the user says "add X", "schedule Y", "I have a goal Z", just call the tool and confirm what you did in one short sentence. Still ask only when (a) routing is genuinely ambiguous (which category?), (b) the action is destructive (delete), or (c) the input is too vague to act on. Planning mode still proposes options before acting — auto-confirm doesn't make you guess what the user wants.`
    : AI_BOOST_SYSTEM_PROMPT;

  const result = await generateText({
    model: anthropic(MODEL),
    system: `${systemPrompt}\n\n# Telegram surface\n\nYou are replying in a Telegram chat. Keep replies tight and conversational — no markdown formatting (asterisks, backticks, headings render as literal characters). Plain prose, short paragraphs. No long lists unless asked.`,
    messages: modelMessages,
    tools: buildAiBoostTools(admin, userId),
    stopWhen: stepCountIs(MAX_STEPS),
  });

  const content: Record<string, unknown> = { text: result.text };
  if (result.toolCalls?.length) {
    content.tool_calls = result.toolCalls.map((c) => ({ name: c.toolName, input: c.input }));
  }
  if (result.toolResults?.length) {
    content.tool_results = result.toolResults.map((r) => ({ name: r.toolName, output: r.output }));
  }
  await admin.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content,
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  return result.text;
}

/**
 * Pick the most recent conversation for this user, or create a new one if
 * none exist. Per user choice: Telegram messages append to whatever the
 * latest conversation is, regardless of where it started.
 */
async function resolveTelegramConversation(
  admin: SupabaseClient,
  userId: string,
  firstUserText: string
): Promise<string> {
  const { data: latest } = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.id) return latest.id as string;

  const { data, error } = await admin
    .from("conversations")
    .insert({ user_id: userId, title: firstUserText.slice(0, 60) || null })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't create conversation");
  return data.id as string;
}

type StoredContent = { text?: string };

async function loadHistory(
  admin: SupabaseClient,
  conversationId: string
): Promise<ModelMessage[]> {
  const { data } = await admin
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const rows = (data ?? []).reverse() as { role: string; content: StoredContent }[];
  // Drop the just-inserted current user turn (we add it back wrapped) and
  // reduce to text-only history. Tool calls/results are intentionally dropped
  // here — a clean text transcript keeps history coherent without re-binding
  // tool IDs across turns.
  const trimmed = rows.slice(0, -1);
  return trimmed
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content?.text ?? "",
    }))
    .filter((m) => m.content);
}

// =========================================================================
// Telegram update typing (only the fields we read)
// =========================================================================

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string };
    chat: { id: number; type: "private" | "group" | "supergroup" | "channel" };
    text?: string;
  };
};
