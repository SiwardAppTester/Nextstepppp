"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  ListTodo,
  Calendar,
  Euro,
  Heart,
  Settings,
  Briefcase,
  Home as HomeIcon,
  User,
  Rocket,
  Dumbbell,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  ChevronRight,
  HardDrive,
  Layers,
  Link2,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category, GmailAccount, Shortcut } from "@/lib/types";
import { ThemeToggle } from "./theme-toggle";

const nav: { href: string; label: string; icon: LucideIcon; hint?: string }[] = [
  { href: "/chat", label: "Chat", icon: MessageSquare, hint: "Coach" },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/finance", label: "Finance", icon: Euro },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/settings", label: "Settings", icon: Settings },
];

const categoryIconMap: Record<string, LucideIcon> = {
  User,
  Home: HomeIcon,
  Briefcase,
  Rocket,
  Dumbbell,
};

function toggleSidebar() {
  const html = document.documentElement;
  const collapsed = html.getAttribute("data-sidebar") === "collapsed";
  if (collapsed) {
    html.removeAttribute("data-sidebar");
    try { localStorage.setItem("sidebar", "expanded"); } catch {}
  } else {
    html.setAttribute("data-sidebar", "collapsed");
    try { localStorage.setItem("sidebar", "collapsed"); } catch {}
  }
}

// Sections default to open. We hydrate from localStorage after mount to avoid
// hydration mismatches — accepts a one-frame flash for sections the user closed.
function useSectionOpen(key: string) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(`sidebar-section:${key}`) === "closed") {
        setOpen(false);
      }
    } catch {}
  }, [key]);
  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(`sidebar-section:${key}`, next ? "open" : "closed"); } catch {}
      return next;
    });
  }
  return [open, toggle] as const;
}

type Props = {
  categories: Category[];
  taskCountByCat: Record<string, number>;
  gmailAccounts: GmailAccount[];
  shortcuts: Shortcut[];
  user: { email: string; initial: string };
};

export function AppSidebar({ categories, taskCountByCat, gmailAccounts, shortcuts, user }: Props) {
  const pathname = usePathname();
  const [categoriesOpen, toggleCategories] = useSectionOpen("categories");
  const [shortcutsOpen, toggleShortcuts] = useSectionOpen("shortcuts");
  const [gmailOpen, toggleGmail] = useSectionOpen("gmail");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <aside className="app-sidebar flex h-dvh shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)]/80 backdrop-blur-xl">
      <div className="flex h-14 items-center px-3 border-b border-[var(--color-border)]">
        {/* Expanded: collapse button right-aligned */}
        <button
          onClick={toggleSidebar}
          title="Collapse sidebar (⌘B)"
          aria-label="Collapse sidebar"
          className="sidebar-only-expanded ml-auto flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        {/* Collapsed: expand button centered */}
        <button
          onClick={toggleSidebar}
          title="Expand sidebar (⌘B)"
          aria-label="Expand sidebar"
          className="sidebar-only-collapsed mx-auto h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          <PanelLeftOpen className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 p-3">
        {nav.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "sidebar-nav-item group relative flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[13px] font-medium transition-all",
                active
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform group-hover:scale-105",
                  active && "drop-shadow-[0_0_6px_var(--color-accent-glow)]"
                )}
                strokeWidth={2}
              />
              <span className="sidebar-only-expanded flex-1 truncate">{item.label}</span>
              {item.hint && (
                <span className="sidebar-only-expanded text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                  {item.hint}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 mt-2">
        <SectionHeader label="Categories" icon={Layers} open={categoriesOpen} onToggle={toggleCategories} />
        <div className={cn("flex flex-col gap-0.5", !categoriesOpen && "sidebar-section-closed")}>
          {categories.length === 0 && (
            <div className="px-2.5 py-2 text-[11px] text-[var(--color-text-subtle)] sidebar-only-expanded">
              No categories yet.
            </div>
          )}
          {categories.map((cat) => {
            const Icon = categoryIconMap[cat.icon] ?? User;
            const count = taskCountByCat[cat.id] ?? 0;
            const active = pathname === `/categories/${cat.id}`;
            return (
              <Link
                key={cat.id}
                href={`/categories/${cat.id}`}
                title={cat.name}
                className={cn(
                  "sidebar-nav-item group flex items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-[12.5px] transition-colors",
                  active
                    ? "bg-[var(--color-surface-hover)] text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                )}
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border"
                  style={{
                    backgroundColor: `${cat.color}18`,
                    borderColor: `${cat.color}55`,
                    color: cat.color,
                    boxShadow: `0 0 12px -4px ${cat.color}55`,
                  }}
                >
                  <Icon className="h-2.5 w-2.5" strokeWidth={2.4} />
                </span>
                <span className="sidebar-only-expanded flex-1 text-left truncate">{cat.name}</span>
                <span className="sidebar-only-expanded text-[10px] tabular-nums text-[var(--color-text-subtle)] group-hover:text-[var(--color-text-muted)]">
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {gmailAccounts.length > 0 && (
        <div className="px-3 mt-2">
          <SectionHeader label="Gmail" icon={Mail} open={gmailOpen} onToggle={toggleGmail} />
          <div className={cn("flex flex-col gap-0.5", !gmailOpen && "sidebar-section-closed")}>
            {gmailAccounts.map((acc) => {
              const hasUnread = acc.unread_count > 0;
              const domainInitial = (acc.email.split("@")[1]?.[0] ?? "?").toUpperCase();
              const authUser = encodeURIComponent(acc.email);
              return (
                <div
                  key={acc.id}
                  className={cn(
                    "sidebar-nav-item group flex items-center rounded-[8px] text-[12.5px] transition-colors",
                    "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                  )}
                >
                  <a
                    href={`https://mail.google.com/mail/?authuser=${authUser}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open Gmail — ${acc.email}${hasUnread ? ` (${acc.unread_count} unread)` : ""}`}
                    className="flex flex-1 min-w-0 items-center gap-2.5 px-2.5 py-1.5 hover:text-[var(--color-text)]"
                  >
                    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[9px] font-semibold text-[var(--color-text-muted)]">
                      {domainInitial}
                      {hasUnread && (
                        <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_6px_var(--color-accent-glow)]" />
                      )}
                    </span>
                    <span className="sidebar-only-expanded flex-1 text-left truncate">
                      {acc.email.split("@")[1] ?? acc.email}
                    </span>
                    {hasUnread && (
                      <span className="sidebar-only-expanded text-[10px] tabular-nums font-semibold text-[var(--color-accent)]">
                        {acc.unread_count}
                      </span>
                    )}
                  </a>
                  <a
                    href={`https://drive.google.com/drive/?authuser=${authUser}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open Drive — ${acc.email}`}
                    aria-label={`Open Drive for ${acc.email}`}
                    className="sidebar-only-expanded mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
                  >
                    <HardDrive className="h-3 w-3" strokeWidth={2} />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {shortcuts.length > 0 && (
        <div className="px-3 mt-2">
          <SectionHeader label="Shortcuts" icon={Link2} open={shortcutsOpen} onToggle={toggleShortcuts} />
          <div className={cn("flex flex-col gap-0.5", !shortcutsOpen && "sidebar-section-closed")}>
            {shortcuts.map((s) => (
              <ShortcutItem key={s.id} shortcut={s} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-[var(--color-border)] p-3">
        {/* Expanded: theme toggle row above user card, left-aligned */}
        <div className="sidebar-only-expanded flex items-center justify-start mb-2">
          <ThemeToggle />
        </div>
        <div className="sidebar-only-expanded flex items-center gap-2.5 rounded-[8px] bg-[var(--color-surface)] px-2.5 py-2 border border-[var(--color-border)]">
          <UserAvatar initial={user.initial} />
          <div className="flex flex-col leading-tight min-w-0 flex-1">
            <span className="text-[12px] font-medium truncate">Sief</span>
            <span className="text-[10px] text-[var(--color-text-subtle)] truncate">
              {user.email}
            </span>
          </div>
          <SignOutButton />
        </div>
        {/* Collapsed: theme toggle + avatar + signout, vertically centered */}
        <div className="sidebar-only-collapsed flex-col items-center gap-1.5" title={user.email}>
          <ThemeToggle />
          <UserAvatar initial={user.initial} />
          <SignOutButton compact />
        </div>
      </div>
    </aside>
  );
}

function SectionHeader({
  label,
  icon: Icon,
  open,
  onToggle,
}: {
  label: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Expanded sidebar: chevron + label */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="sidebar-only-expanded group flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform duration-150",
            open && "rotate-90"
          )}
          strokeWidth={2.5}
        />
        <span className="flex-1 text-left">{label}</span>
      </button>
      {/* Collapsed sidebar: small icon + tiny chevron, centered */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title={`${label} — ${open ? "collapse" : "expand"}`}
        className="sidebar-only-collapsed mx-auto items-center justify-center gap-0.5 rounded-md px-1.5 py-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        <ChevronRight
          className={cn(
            "h-2.5 w-2.5 shrink-0 transition-transform duration-150",
            open && "rotate-90"
          )}
          strokeWidth={2.5}
        />
      </button>
    </>
  );
}

function ShortcutItem({ shortcut }: { shortcut: Shortcut }) {
  const [imgFailed, setImgFailed] = useState(false);
  let host = "";
  try {
    host = new URL(shortcut.url).hostname;
  } catch {
    host = shortcut.url;
  }
  const initial = (shortcut.label[0] ?? host[0] ?? "?").toUpperCase();
  const faviconSrc = host
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
    : null;

  return (
    <a
      href={shortcut.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${shortcut.label} — ${host}`}
      className={cn(
        "sidebar-nav-item group flex items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-[12.5px] transition-colors",
        "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden text-[9px] font-semibold text-[var(--color-text-muted)]">
        {faviconSrc && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={faviconSrc}
            alt=""
            width={16}
            height={16}
            className="h-4 w-4 object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          initial
        )}
      </span>
      <span className="sidebar-only-expanded flex-1 text-left truncate">{shortcut.label}</span>
    </a>
  );
}

function UserAvatar({ initial }: { initial: string }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] text-[11px] font-semibold border border-[var(--color-border-accent)]">
      {initial}
    </div>
  );
}

function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form method="post" action="/api/auth/signout">
      <button
        type="submit"
        title="Sign out"
        aria-label="Sign out"
        className={cn(
          "flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)] transition-colors",
          compact ? "h-7 w-7" : "h-7 w-7"
        )}
      >
        <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </form>
  );
}
