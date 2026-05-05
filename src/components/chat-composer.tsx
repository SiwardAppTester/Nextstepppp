"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Mic, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatComposer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [value]);

  function send() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <div className="px-6 pb-6 pt-2">
      <div className="mx-auto max-w-[760px]">
        <div
          className={cn(
            "relative rounded-2xl border bg-[var(--color-surface)] transition-all",
            focused
              ? "border-[var(--color-border-accent)] shadow-[var(--shadow-composer-focus)]"
              : "border-[var(--color-border)] shadow-[var(--shadow-float)]"
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Tell the Coach what's going on…"
            rows={1}
            disabled={disabled}
            className="w-full resize-none bg-transparent px-4 pt-3.5 pb-12 text-[14px] leading-6 text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none"
          />

          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 px-2.5 pb-2.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                title="Attach (coming soon)"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => router.push("/voice")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] transition-colors"
                title="Talk to the Coach (voice mode)"
                aria-label="Open voice mode"
              >
                <Mic className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={send}
              disabled={!value.trim() || disabled}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-all",
                value.trim() && !disabled
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-[var(--shadow-send-button)] hover:bg-[var(--color-accent-hover)]"
                  : "bg-[var(--color-surface-2)] text-[var(--color-text-subtle)] cursor-not-allowed"
              )}
            >
              <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span>Send</span>
            </button>
          </div>
        </div>

        <div className="mt-2.5 text-center text-[10.5px] text-[var(--color-text-subtle)]">
          The Coach uses tools to read and write your data — nothing happens behind your back.
        </div>
      </div>
    </div>
  );
}
