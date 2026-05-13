"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, History } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { formatDistanceToNow } from "date-fns";
import { Topbar } from "@/components/topbar";
import { ChatMessageView, TypingIndicator } from "@/components/chat-message";
import { ChatComposer } from "@/components/chat-composer";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  title: string | null;
  last_message_at: string;
};

// Names of tools in src/lib/ai-boost/tools.ts that change DB state.
// Read-only tools (list_*, summarize_finances, fetch_product_info) are absent
// from this set so they don't trigger a layout-wide router.refresh().
// Keep in sync with tools.ts.
const MUTATING_TOOL_NAMES = new Set<string>([
  "update_category_context",
  "create_task",
  "update_task",
  "delete_task",
  "create_event",
  "update_event",
  "delete_event",
  "create_category",
  "update_category",
  "delete_category",
  "create_goal",
  "update_goal",
  "create_wishlist_item",
  "update_wishlist_item",
  "delete_wishlist_item",
  "set_wishlist_status",
  "update_settings",
]);

export function ChatView({
  conversations,
  activeConversationId,
  initialMessages,
}: {
  conversations: Conversation[];
  activeConversationId: string | null;
  initialMessages: UIMessage[];
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string | null>(activeConversationId);

  const { messages, sendMessage, status } = useChat({
    id: activeConversationId ?? "new",
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ conversationId: conversationIdRef.current }),
      // Intercept the response so we can capture the conversation id the server
      // assigned (or echoed). Without this, every message in a fresh chat gets
      // sent with conversationId: null and creates a new row each time.
      fetch: async (input, init) => {
        const res = await fetch(input as RequestInfo, init);
        const id = res.headers.get("X-Conversation-Id");
        if (id) {
          const wasFresh = conversationIdRef.current === null;
          conversationIdRef.current = id;
          // Sync the URL silently so refresh / share works, but DO NOT use
          // router.replace — that triggers a re-render mid-stream, which
          // changes useChat's `id` prop and kills the in-flight response.
          // window.history.replaceState bypasses Next.js routing entirely.
          if (wasFresh && typeof window !== "undefined") {
            window.history.replaceState({}, "", `/chat?c=${id}`);
          }
        }
        return res;
      },
    }),
    onFinish: ({ message }) => {
      // Refresh server data only when the Coach actually mutated something.
      // Pure chat replies + read-only tool calls (list_*, summarize_finances,
      // fetch_product_info) don't change DB state, so refreshing the whole
      // app layout for them was wasted re-fetching.
      const ranMutatingTool = message.parts.some(
        (p) =>
          p.type.startsWith("tool-") &&
          MUTATING_TOOL_NAMES.has(p.type.slice("tool-".length))
      );
      if (ranMutatingTool) router.refresh();
    },
  });

  // On mount: jump to bottom *synchronously* before the first paint so the
  // user never sees the top-then-scroll effect. page.tsx keys ChatView on
  // conversation id, so this fires every time a different conversation opens.
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  // After mount: smooth-scroll for new messages and streaming updates.
  // didMountRef gates out the initial run so it doesn't fight the layout
  // effect above with a redundant smooth scroll.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, status]);

  function handleSend(text: string) {
    sendMessage({ text });
  }

  const thinking = status === "submitted" || status === "streaming";
  const activeConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : null;

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      {/* Chat content (left) */}
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar
          crumbs={
            activeConversation
              ? [{ label: "Coach" }, { label: activeConversation.title ?? "Untitled" }]
              : [{ label: "Coach" }, { label: "New conversation" }]
          }
          right={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push(`/chat?new=${Date.now()}`)}
            >
              <Plus className="h-3.5 w-3.5" />
              New chat
            </Button>
          }
        />

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 no-scrollbar">
          <div className="mx-auto max-w-[760px] space-y-6">
            {messages.length === 0 && <EmptyState />}
            {messages.map((m) => (
              <ChatMessageView key={m.id} message={uiMessageToView(m)} />
            ))}
            {thinking && <TypingIndicator />}
          </div>
        </div>

        <ChatComposer onSend={handleSend} disabled={thinking} />
      </div>

      {/* Conversations rail (right side, visually detached from the main app sidebar) */}
      <div className="hidden lg:flex w-[260px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-bg)]/40 backdrop-blur-sm">
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-4">
          <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--color-text-muted)]">
            <History className="h-3.5 w-3.5" />
            Conversations
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            title="New chat"
            onClick={() => router.push(`/chat?new=${Date.now()}`)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 no-scrollbar">
          {conversations.length === 0 && (
            <div className="px-2 py-8 text-center text-[11.5px] text-[var(--color-text-subtle)]">
              No conversations yet. Send a message to start.
            </div>
          )}
          {conversations.map((c) => {
            const active = c.id === activeConversationId;
            return (
              <Link
                key={c.id}
                href={`/chat?c=${c.id}`}
                className={cn(
                  "block rounded-[8px] px-2.5 py-2 text-[12.5px] transition-colors border",
                  active
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-border-accent)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] border-transparent"
                )}
              >
                <div className="font-medium truncate">
                  {c.title ?? "Untitled"}
                </div>
                <div className="text-[10px] text-[var(--color-text-subtle)] mt-0.5">
                  <TimeAgo iso={c.last_message_at} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders a "time ago" string only after mount so the SSR-rendered HTML never
 * disagrees with the post-hydration string (relative-time crosses the
 * minute boundary between the two and React errors out).
 */
function TimeAgo({ iso }: { iso: string }) {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    setText(formatDistanceToNow(new Date(iso), { addSuffix: true }));
  }, [iso]);
  return <span suppressHydrationWarning>{text}</span>;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center text-center pt-20">
      <BrandMark size="lg" className="mb-4 glow-pulse" />
      <h2 className="text-xl font-semibold tracking-tight mb-1.5">Hey Sief.</h2>
      <p className="text-[13px] text-[var(--color-text-muted)] max-w-md">
        Tell me what's on your plate, ask what to work on next, or capture a task.
        I'll remember what matters and surface it when it counts.
      </p>
    </div>
  );
}

/**
 * Convert an AI SDK UIMessage into the shape ChatMessageView expects.
 * Combines all text parts; surfaces dynamic tool-* parts as tool_calls.
 */
function uiMessageToView(m: UIMessage) {
  const text = m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");

  const tool_calls = m.parts
    .filter((p) => p.type.startsWith("tool-"))
    .map((p) => {
      const tp = p as { type: string; input?: unknown };
      return {
        name: tp.type.slice("tool-".length),
        input: (tp.input as Record<string, unknown>) ?? {},
      };
    });

  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    text,
    tool_calls,
    created_at: new Date().toISOString(),
  };
}
