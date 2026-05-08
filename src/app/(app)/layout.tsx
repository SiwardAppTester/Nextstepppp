import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
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
    <div className="flex h-dvh">
      <AppSidebar
        categories={(categories ?? []) as Category[]}
        taskCountByCat={Object.fromEntries(taskCountByCat)}
        gmailAccounts={(gmailAccounts ?? []) as GmailAccount[]}
        shortcuts={(shortcuts ?? []) as Shortcut[]}
        user={{
          email: user.email ?? "",
          initial: (user.email?.[0] ?? "?").toUpperCase(),
        }}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
