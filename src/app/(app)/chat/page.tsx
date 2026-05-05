import { createClient } from "@/lib/supabase/server";
import { ChatView } from "./chat-view";
import type { UIMessage } from "ai";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const conversationId = params.c ?? null;

  // Pull the conversations rail in parallel with this conversation's messages.
  const [conversationsRes, messagesRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, title, last_message_at")
      .order("last_message_at", { ascending: false })
      .limit(30),
    conversationId
      ? supabase
          .from("messages")
          .select("id, role, content, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const initialMessages: UIMessage[] = (messagesRes.data ?? [])
    .map(toUIMessage)
    .filter((m): m is UIMessage => m !== null);

  return (
    <ChatView
      conversations={conversationsRes.data ?? []}
      activeConversationId={conversationId}
      initialMessages={initialMessages}
    />
  );
}

type DbMessage = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: { text?: string; tool_calls?: { name: string; input: unknown }[] };
  created_at: string;
};

function toUIMessage(m: DbMessage): UIMessage | null {
  if (m.role !== "user" && m.role !== "assistant") return null;
  const parts: UIMessage["parts"] = [];

  if (m.content?.text) {
    parts.push({ type: "text", text: m.content.text });
  }

  // Render historical tool calls so the user can see what the Coach did before.
  if (m.role === "assistant" && Array.isArray(m.content?.tool_calls)) {
    for (const call of m.content.tool_calls) {
      parts.push({
        type: `tool-${call.name}` as const,
        toolCallId: m.id + ":" + call.name,
        state: "output-available",
        input: call.input,
        output: { ok: true },
      } as unknown as UIMessage["parts"][number]);
    }
  }

  if (parts.length === 0) return null;

  return {
    id: m.id,
    role: m.role,
    parts,
  } as UIMessage;
}
