import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatView } from "./chat-view";
import type { UIMessage } from "ai";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const requestedId = params.c ?? null;
  // Any non-empty `new` value (timestamp from the New-chat button) forces a
  // fresh chat. Each click uses a different value so React remounts ChatView.
  const forceNew = !!params.new;
  const newKey = params.new ?? null;

  // Default behavior when no conversation is specified: resume the most recent
  // chat so navigating Chat → Tasks → Chat returns where you were. The "+ New
  // chat" buttons pass ?new=1 to opt out and force a blank conversation.
  if (!requestedId && !forceNew) {
    const { data: latest } = await supabase
      .from("conversations")
      .select("id")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.id) redirect(`/chat?c=${latest.id}`);
  }

  const conversationId = requestedId;

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
      key={conversationId ?? `new-${newKey ?? "default"}`}
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
