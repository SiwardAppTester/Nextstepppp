import { createClient } from "@/lib/supabase/server";
import { SettingsView, type Memory } from "./settings-view";
import type { BankAccount, Category, GmailAccount, Shortcut } from "@/lib/types";

export default async function SettingsPage() {
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
