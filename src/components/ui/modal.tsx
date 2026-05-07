"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Lightweight modal: backdrop + centered card. Closes on Esc, backdrop click,
 * or the X button. Locks body scroll while open. No portal — renders inline,
 * but uses fixed positioning so it overlays everything.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const sizes = {
    sm: "max-w-[480px]",
    md: "max-w-[680px]",
    lg: "max-w-[820px]",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full ${sizes[size]} my-auto rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-[12px] border-b border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold">{title}</h3>
            {description && (
              <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
