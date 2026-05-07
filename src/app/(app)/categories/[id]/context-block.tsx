"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const COLLAPSED_MAX_HEIGHT_PX = 180;

export function ContextBlock({ context }: { context: string | null | undefined }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Measure on mount + whenever the content changes. Window resize matters too
  // because narrower widths reflow the text and change overflow status.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setIsOverflowing(el.scrollHeight > COLLAPSED_MAX_HEIGHT_PX + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [context]);

  const empty = !context?.trim();

  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="relative">
        <div
          ref={innerRef}
          className={cn(
            "p-4 text-[13.5px] leading-relaxed text-[var(--color-text)] whitespace-pre-wrap overflow-hidden transition-[max-height] duration-200 ease-out",
          )}
          style={{
            maxHeight: !isOverflowing || expanded ? "none" : `${COLLAPSED_MAX_HEIGHT_PX}px`,
          }}
        >
          {empty ? (
            <span className="italic text-[var(--color-text-subtle)]">
              No context yet. Tell the chat about this area and it&apos;ll fill in.
            </span>
          ) : (
            context
          )}
        </div>

        {/* Fade-out gradient when collapsed and overflowing */}
        {isOverflowing && !expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-[10px] bg-gradient-to-t from-[var(--color-surface)] to-transparent"
          />
        )}
      </div>

      {isOverflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--color-border)] px-3 py-2 text-[11.5px] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors rounded-b-[10px]"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Show more
            </>
          )}
        </button>
      )}
    </div>
  );
}
