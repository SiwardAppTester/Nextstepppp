import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
  type SystemModelMessage,
} from "ai";
import { createClient } from "@/lib/supabase/server";
import { AI_BOOST_SYSTEM_PROMPT } from "@/lib/ai-boost/system-prompt";
import { buildUserContextBlock } from "@/lib/ai-boost/dynamic-context";
import { buildAiBoostTools } from "@/lib/ai-boost/tools";

const MODEL = "claude-haiku-4-5";
// Cap the tool-use loop. Spec §7 recommends ~5; running out mid-sequence
// produces "said done but didn't" — model writes a final reply with no
// tool call. 8 gives headroom for list-then-create flows; tool surface is
// bounded so runaway risk is low.
const MAX_STEPS = 8;

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body: {
    messages: UIMessage[];
    conversationId?: string;
  } = await req.json();

  const messages = body.messages ?? [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUser ? extractText(lastUser) : "";

  const { conversationId, created } = await resolveConversation(
    supabase,
    user.id,
    body.conversationId,
    lastUserText
  );

  // Fire all three pre-stream side-effects in parallel:
  //   1. persist the user's raw message
  //   2. build the <user_context> block
  //   3. read auto-confirm preference
  // Previously these ran sequentially and added ~300ms before first token.
  const userMsgInsert =
    lastUser && lastUserText
      ? supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "user",
          content: { text: lastUserText },
        })
      : Promise.resolve();
  const prefsFetch = supabase
    .from("user_settings")
    .select("auto_confirm, profile")
    .maybeSingle();

  const [, prefsResult] = await Promise.all([userMsgInsert, prefsFetch]);
  const autoConfirm = prefsResult.data?.auto_confirm ?? false;
  const profile = prefsResult.data?.profile ?? null;
  const contextBlock = await buildUserContextBlock(supabase, user.id, {
    autoConfirm,
    profile,
  });
  const wrappedMessages = wrapLatestUserMessage(messages, contextBlock);

  // System prompt is fully static — auto-confirm mode rides in <user_context>
  // instead of being appended here. That lets Anthropic cache the system
  // prompt + tool list every turn (5-min TTL) at ~10% of normal input cost.
  // The cache breakpoint is set on the last tool in tools.ts.
  const system: SystemModelMessage = {
    role: "system",
    content: AI_BOOST_SYSTEM_PROMPT,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
  };

  const result = streamText({
    model: anthropic(MODEL),
    system,
    messages: await convertToModelMessages(wrappedMessages),
    tools: buildAiBoostTools(supabase, user.id),
    stopWhen: stepCountIs(MAX_STEPS),
    onFinish: async ({ text, toolCalls, toolResults }) => {
      const content: Record<string, unknown> = { text };
      if (toolCalls?.length) {
        content.tool_calls = toolCalls.map((c) => ({
          name: c.toolName,
          input: c.input,
        }));
      }
      if (toolResults?.length) {
        content.tool_results = toolResults.map((r) => ({
          name: r.toolName,
          output: r.output,
        }));
      }
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content,
      });
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);

      if (created && lastUserText) {
        const title = lastUserText.slice(0, 60).replace(/\s+/g, " ").trim();
        if (title)
          await supabase.from("conversations").update({ title }).eq("id", conversationId);
      }
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { "X-Conversation-Id": conversationId },
  });
}

async function resolveConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  providedId: string | undefined,
  firstUserText: string
): Promise<{ conversationId: string; created: boolean }> {
  if (providedId) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", providedId)
      .single();
    if (data?.id) return { conversationId: data.id, created: false };
  }
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title: firstUserText.slice(0, 60) || null })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't create conversation");
  return { conversationId: data.id, created: true };
}

function extractText(m: UIMessage): string {
  if (!Array.isArray(m.parts)) return "";
  return m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

/**
 * Wrap the latest user message with the per-turn <user_context> block, per
 * spec §5. Earlier messages are passed through untouched. The DB row stored
 * for the user message keeps the original text — only what Claude sees on
 * this turn includes the wrapper.
 */
function wrapLatestUserMessage(
  messages: UIMessage[],
  contextBlock: string
): UIMessage[] {
  const out = [...messages];
  let lastIdx = -1;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "user") {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx === -1) return out;

  const original = out[lastIdx];
  const text = extractText(original);
  const wrapped = `${contextBlock}\n\n<user_message>\n${text}\n</user_message>`;
  out[lastIdx] = {
    ...original,
    parts: [{ type: "text", text: wrapped }],
  };
  return out;
}
