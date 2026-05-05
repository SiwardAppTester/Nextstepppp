"use client";

import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Theme toggle. Renders both icons; CSS in globals.css hides the inactive one
 * based on `[data-theme=light]` on <html>. This avoids a hydration mismatch
 * (server doesn't know the user's theme).
 *
 * Default theme = dark (no data-theme attribute). Light = data-theme="light".
 */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const html = document.documentElement;
    const isLight = html.getAttribute("data-theme") === "light";
    if (isLight) {
      html.removeAttribute("data-theme");
      try { localStorage.setItem("theme", "dark"); } catch {}
    } else {
      html.setAttribute("data-theme", "light");
      try { localStorage.setItem("theme", "light"); } catch {}
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Toggle theme"
      aria-label="Toggle theme"
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border transition-all",
        "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]",
        "hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)]",
        className
      )}
    >
      {/* Visible in dark mode → click to go light */}
      <Sun className="theme-icon-light h-3.5 w-3.5" strokeWidth={2} />
      {/* Visible in light mode → click to go dark */}
      <Moon className="theme-icon-dark h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}
