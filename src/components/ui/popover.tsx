"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Position = { top: number; left: number; maxHeight: number };

/**
 * Anchored floating panel. Positions itself next to `anchor` using fixed
 * coordinates so it works regardless of overflow/transform parents. Flips
 * vertically if it would overflow the viewport bottom; clamps horizontally
 * to stay on screen.
 *
 * Closes on Esc or click outside (the anchor counts as inside — so toggling
 * the same anchor by clicking it again is handled by the caller, not here).
 */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = "start",
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Horizontal alignment to the anchor: "start" (left edge), "center", or "end" (right edge). */
  align?: "start" | "center" | "end";
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);

  // Measure + position before paint so the user never sees a flash at 0,0.
  useLayoutEffect(() => {
    if (!open || !anchor || !cardRef.current) {
      setPos(null);
      return;
    }
    function place() {
      if (!anchor || !cardRef.current) return;
      const a = anchor.getBoundingClientRect();
      const c = cardRef.current.getBoundingClientRect();
      const margin = 8;

      // Pick the side with more room. Set maxHeight to the available space so
      // the popover never overflows the viewport — inner content can scroll.
      const spaceBelow = window.innerHeight - a.bottom - margin * 2;
      const spaceAbove = a.top - margin * 2;
      const placeBelow = spaceBelow >= c.height || spaceBelow >= spaceAbove;

      let top: number;
      let maxHeight: number;
      if (placeBelow) {
        top = a.bottom + margin;
        maxHeight = spaceBelow;
      } else {
        // Above: try to bottom-align with the anchor; clamp to viewport top.
        const desiredHeight = Math.min(c.height, spaceAbove);
        top = Math.max(margin, a.top - margin - desiredHeight);
        maxHeight = spaceAbove;
      }

      // Horizontal alignment relative to the anchor.
      let left: number;
      if (align === "center") left = a.left + a.width / 2 - c.width / 2;
      else if (align === "end") left = a.right - c.width;
      else left = a.left;

      // Clamp into viewport.
      if (left + c.width > window.innerWidth - margin) {
        left = window.innerWidth - c.width - margin;
      }
      if (left < margin) left = margin;

      setPos({ top, left, maxHeight });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, align]);

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
    function onMouse(e: MouseEvent) {
      const t = e.target as Node;
      if (!cardRef.current) return;
      // The anchor counts as "inside" so the parent's click handler can
      // toggle this popover off (or move it to a different anchor) without
      // racing against this close.
      if (cardRef.current.contains(t)) return;
      if (anchor && anchor.contains(t)) return;
      onClose();
    }
    // Defer one tick so the same click that opened the popover doesn't
    // immediately close it.
    const id = window.setTimeout(
      () => window.addEventListener("mousedown", onMouse),
      0
    );
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onMouse);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;

  return (
    <div
      ref={cardRef}
      role="dialog"
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        maxHeight: pos?.maxHeight,
        // Hidden until positioned so we never paint at (0,0) for one frame.
        visibility: pos ? "visible" : "hidden",
        zIndex: 60,
      }}
      className="float-card flex flex-col min-w-[280px] max-w-[360px] overflow-hidden"
    >
      {children}
    </div>
  );
}
