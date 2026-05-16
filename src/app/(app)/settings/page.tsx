import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsView, type Memory } from "./settings-view";
import type { BankAccount, Category, GmailAccount, Shortcut } from "@/lib/types";

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: categories },
    { data: memories },
    { data: prefs },
    { data: bankAccounts },
    { data: gmailAccounts },
    { data: shortcuts },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, color, icon, context")
      .order("created_at", { ascending: true }),
    supabase
      .from("memory")
      .select("id, content, importance, category_id, created_at")
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("user_settings").select("auto_confirm").maybeSingle(),
    supabase
      .from("bank_accounts")
      .select("id, iban, nickname, description, bank_name, color, currency, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("gmail_accounts")
      .select(
        "id, email, unread_count, last_synced_at, last_sync_error, created_at, granted_scopes"
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("shortcuts")
      .select("id, label, url, position, created_at")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  return (
    <SettingsView
      categories={(categories ?? []) as Category[]}
      memories={(memories ?? []) as Memory[]}
      userEmail={user?.email ?? ""}
      autoConfirm={prefs?.auto_confirm ?? false}
      bankAccounts={(bankAccounts ?? []) as BankAccount[]}
      gmailAccounts={(gmailAccounts ?? []) as GmailAccount[]}
      shortcuts={(shortcuts ?? []) as Shortcut[]}
    />
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar crumbs={[{ label: "Settings" }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[720px] space-y-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <div className="flex items-center gap-3 px-5 pt-5">
                <Skeleton className="h-5 w-5" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <div className="p-5 space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                {i % 2 === 0 && <Skeleton className="h-9 w-2/3" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
