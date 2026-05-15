"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  CATEGORY_ICON_NAMES,
  CATEGORY_COLORS,
  getCategoryIcon,
} from "@/lib/category-icons";
import { updateCategoryAppearance } from "./actions";

/**
 * The clickable icon tile on the category detail page. Click to open a
 * popover with an icon grid + color swatches. Changes save immediately
 * (optimistic UI), then trigger router.refresh() so the rest of the page
 * — and the sidebar — pick up the new values.
 */
export function CategoryIconEditor({
  id,
  icon,
  color,
}: {
  id: string;
  icon: string;
  color: string;
}) {
  const router = useRouter();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Local optimistic state so the tile updates instantly on click — no flicker
  // waiting for the server roundtrip + revalidation.
  const [localIcon, setLocalIcon] = useState(icon);
  const [localColor, setLocalColor] = useState(color);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const Icon = getCategoryIcon(localIcon);
  const open = !!anchor;

  function toggleOpen(el: HTMLElement) {
    setAnchor(open ? null : el);
  }

  function save(patch: { icon?: string; color?: string }) {
    const prevIcon = localIcon;
    const prevColor = localColor;
    if (patch.icon !== undefined) setLocalIcon(patch.icon);
    if (patch.color !== undefined) setLocalColor(patch.color);
    setError(null);
    startTransition(async () => {
      const r = await updateCategoryAppearance(id, patch);
      if (!r.ok) {
        // Roll back on failure so the UI doesn't lie about persisted state.
        setLocalIcon(prevIcon);
        setLocalColor(prevColor);
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => toggleOpen(e.currentTarget)}
        title="Change icon and color"
        className="flex h-12 w-12 items-center justify-center rounded-[10px] border transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        style={{
          backgroundColor: `${localColor}18`,
          borderColor: `${localColor}55`,
          color: localColor,
          boxShadow: `0 0 24px -8px ${localColor}55`,
        }}
      >
        <Icon className="h-5 w-5" strokeWidth={2.4} />
      </button>

      <Popover anchor={anchor} open={open} onClose={() => setAnchor(null)} align="start">
        <div className="p-3 w-[280px]">
          {error && (
            <div className="mb-2 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-2 py-1.5 text-[11px] text-[var(--color-danger)]">
              {error}
            </div>
          )}
          <div className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)] font-medium">
            Icon
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {CATEGORY_ICON_NAMES.map((name) => {
              const I = getCategoryIcon(name);
              const selected = name === localIcon;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => save({ icon: name })}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]",
                    selected
                      ? "border-[var(--color-border-strong)] bg-[var(--color-surface-hover)] text-[var(--color-text)]"
                      : "border-transparent"
                  )}
                  style={selected ? { color: localColor } : undefined}
                  aria-pressed={selected}
                >
                  <I className="h-4 w-4" strokeWidth={2.2} />
                </button>
              );
            })}
          </div>

          <div className="mt-3 mb-2 text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)] font-medium">
            Color
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {CATEGORY_COLORS.map((c) => {
              const selected = c === localColor;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => save({ color: c })}
                  className="flex h-8 w-8 items-center justify-center rounded-md border transition-transform hover:scale-110"
                  style={{
                    backgroundColor: `${c}28`,
                    borderColor: selected ? c : `${c}55`,
                    boxShadow: selected ? `0 0 12px -2px ${c}aa` : undefined,
                  }}
                  aria-label={c}
                  aria-pressed={selected}
                >
                  {selected ? (
                    <Check className="h-3.5 w-3.5" style={{ color: c }} strokeWidth={3} />
                  ) : (
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: c }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Popover>
    </>
  );
}
