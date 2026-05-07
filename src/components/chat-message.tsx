import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";
import { BrandMark } from "./brand-mark";

const toolLabels: Record<string, string> = {
  create_task: "Created task",
  list_tasks: "Looked up tasks",
  update_task: "Updated task",
  complete_task: "Completed task",
  delete_task: "Deleted task",
  schedule_reminder: "Scheduled reminder",
  create_category: "Created category",
  update_category: "Updated category",
  list_categories: "Listed categories",
  remember: "Saved to memory",
  search_memory: "Searched memory",
  forget: "Forgot memory",
};

export function ChatMessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-br-md border border-[var(--color-border-accent)] bg-[var(--color-accent-soft)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--color-text)] shadow-[0_8px_24px_-12px_var(--color-accent-glow)] whitespace-pre-wrap [overflow-wrap:anywhere]">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <BrandMark size="sm" className="mt-0.5" />

      <div className="flex flex-col gap-2 max-w-[82%]">
        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.tool_calls.map((call, idx) => (
              <span
                key={idx}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]",
                  "transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
                )}
              >
                <Wrench className="h-3 w-3 text-[var(--color-accent)]" />
                <span>{toolLabels[call.name] ?? call.name}</span>
                {typeof call.input.title === "string" && (
                  <span className="text-[var(--color-text-subtle)]">
                    · {call.input.title as string}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {message.text && (
          <div className="rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--color-text)] shadow-[var(--shadow-float)]">
            <FormattedText text={message.text} />
          </div>
        )}
      </div>
    </div>
  );
}

// Tiny markdown-ish renderer for **bold** only (full markdown comes in Phase 2 with `react-markdown`).
function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-[var(--color-text)]">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <BrandMark size="sm" className="mt-0.5" />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <span className="dot-1 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
        <span className="dot-2 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
        <span className="dot-3 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
      </div>
    </div>
  );
}
