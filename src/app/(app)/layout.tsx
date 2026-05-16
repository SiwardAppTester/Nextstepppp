import { Suspense } from "react";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { RealtimeRefresher } from "@/components/realtime-refresher";
import { Skeleton } from "@/components/ui/skeleton";
import { syncStaleAccounts } from "@/lib/gmail/sync";
import type { Category, GmailAccount, Shortcut } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware should already redirect unauthed users; this is belt-and-braces.
  if (!user) redirect("/login");

  return (
    <div className="flex h-dvh">
      <Suspense fallback={<SidebarSkeleton />}>
        <SidebarData userEmail={user.email ?? ""} />
      </Suspense>
      <div className="relative flex flex-1 flex-col overflow-hidden">{children}</div>
      <RealtimeRefresher />
    </div>
  );
}

async function SidebarData({ userEmail }: { userEmail: string }) {
  const supabase = await createClient();

  const [
    { data: categories },
    { data: openTasks },
    { data: gmailAccounts },
    { data: shortcuts },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, color, icon, context")
      .order("created_at", { ascending: true }),
    supabase.from("tasks").select("category_id").neq("status", "done"),
    supabase
      .from("gmail_accounts")
      .select("id, email, unread_count, last_synced_at, last_sync_error, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("shortcuts")
      .select("id, label, url, position, created_at")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const taskCountByCat = new Map<string, number>();
  for (const t of openTasks ?? []) {
    if (t.category_id) {
      taskCountByCat.set(t.category_id, (taskCountByCat.get(t.category_id) ?? 0) + 1);
    }
  }

  // Refresh any account whose count is older than ~60s. Runs after the response
  // is sent so it never blocks the render. Next render picks up the fresh count.
  if ((gmailAccounts?.length ?? 0) > 0) {
    after(async () => {
      try {
        await syncStaleAccounts(supabase, 60_000);
      } catch {
        // Surfaced per-account via last_sync_error; nothing useful to do here.
      }
    });
  }

  return (
    <AppSidebar
      categories={(categories ?? []) as Category[]}
      taskCountByCat={Object.fromEntries(taskCountByCat)}
      gmailAccounts={(gmailAccounts ?? []) as GmailAccount[]}
      shortcuts={(shortcuts ?? []) as Shortcut[]}
      user={{
        email: userEmail,
        initial: (userEmail[0] ?? "?").toUpperCase(),
      }}
    />
  );
}

// Shape mirrors the real sidebar: toggle bar, 6 nav items, two section blocks.
// Width matches the expanded sidebar (260px from globals.css .app-sidebar).
function SidebarSkeleton() {
  return (
    <aside className="app-sidebar flex h-dvh shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)]/80 backdrop-blur-xl">
      <div className="flex h-14 items-center px-3 border-b border-[var(--color-border)]">
        <Skeleton className="ml-auto h-7 w-7" />
      </div>
      <nav className="flex flex-col gap-1.5 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
            <Skeleton className="h-4 w-4 rounded-[5px]" />
            <Skeleton className="h-3 flex-1 max-w-[110px]" />
          </div>
        ))}
      </nav>
      <div className="px-3 mt-2 space-y-2">
        <Skeleton className="h-3 w-20 ml-2" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-2.5 py-1.5">
            <Skeleton className="h-4 w-4 rounded-[5px]" />
            <Skeleton className="h-3 flex-1 max-w-[90px]" />
          </div>
        ))}
      </div>
      <div className="mt-auto p-3 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-3 flex-1 max-w-[140px]" />
        </div>
      </div>
    </aside>
  );
}
