import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatView } from "./chat-view";
import type { UIMessage } from "ai";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string }>;
}) {
  const params = await searchParams;
  const requestedId = params.c ?? null;
  // Any non-empty `new` value (timestamp from the New-chat button) forces a
  // fresh chat. Each click uses a different value so React remounts ChatView.
  const forceNew = !!params.new;
  const newKey = params.new ?? null;

  // Resume the most recent chat when no conversation is specified. Kept at the
  // page level (not inside Suspense) so the redirect resolves before we ever
  // show a skeleton — avoids skeleton → redirect → skeleton flash.
  if (!requestedId && !forceNew) {
    const supabase = await createClient();
    const { data: latest } = await supabase
      .from("conversations")
      .select("id")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.id) redirect(`/chat?c=${latest.id}`);
  }

  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ChatContent conversationId={requestedId} newKey={newKey} />
    </Suspense>
  );
}

async function ChatContent({
  conversationId,
  newKey,
}: {
  conversationId: string | null;
  newKey: string | null;
}) {
  const supabase = await createClient();

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

function ChatSkeleton() {
  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar crumbs={[{ label: "Coach" }, { label: "Loading…" }]} />
        <div className="flex-1 overflow-hidden px-6 py-6 space-y-6">
          {/* Alternating bubble shapes hint at a real conversation. */}
          <div className="flex justify-end">
            <Skeleton className="h-16 w-[280px] rounded-[14px]" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-24 w-[420px] rounded-[14px]" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-10 w-[200px] rounded-[14px]" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-32 w-[460px] rounded-[14px]" />
          </div>
        </div>
        <div className="border-t border-[var(--color-border)] p-4">
          <Skeleton className="h-12 w-full rounded-[12px]" />
        </div>
      </div>
    </div>
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
