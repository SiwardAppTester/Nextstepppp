import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { createClient } from "@/lib/supabase/server";
import { buildCoachTools } from "@/lib/coach/tools";
import { buildSystemPrompt } from "@/lib/coach/system-prompt";

// The Coach uses adaptive thinking on Sonnet 4.6 for non-trivial reasoning.
// Tool-use loop is bounded at 8 steps to prevent runaway loops.
const MAX_STEPS = 8;
const MODEL = "claude-sonnet-4-6";

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

  // Resolve / create the conversation up front so we have an id for both
  // user-message persistence and the onFinish save.
  const { conversationId, created } = await resolveConversation(
    supabase,
    user.id,
    body.conversationId,
    lastUserText
  );

  // Persist the user's new message before streaming.
  if (lastUser && lastUserText) {
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: { text: lastUserText },
    });
  }

  // Build the system prompt fresh each turn (time, tasks, memories all dynamic).
  const system = await buildSystemPrompt(supabase, user.id, lastUserText);
  const tools = buildCoachTools(supabase, user.id);

  const result = streamText({
    model: anthropic(MODEL),
    system,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    providerOptions: {
      anthropic: {
        // Adaptive thinking on Sonnet 4.6 — Claude decides when/how much to think.
        thinking: { type: "adaptive" },
      },
    },
    onFinish: async ({ text, toolCalls, toolResults }) => {
      // Persist the assistant's complete message after the stream wraps up.
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

      // Auto-title fresh conversations from the user's first message (cheap, deterministic).
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
  // UIMessage parts can be text/tool/etc — concat the text parts.
  if (!Array.isArray(m.parts)) return "";
  return m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}
