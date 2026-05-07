import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountView, type ScopedTxn } from "./account-view";
import type {
  BankAccount,
  FinanceStatement,
  Pocket,
  RentalCheck,
} from "@/lib/types";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [accountRes, statementsRes, txnsRes, pocketsRes, checksRes] =
    await Promise.all([
      supabase
        .from("bank_accounts")
        .select("id, iban, nickname, description, bank_name, color, currency, created_at")
        .eq("id", id)
        .single(),
      supabase
        .from("statements")
        .select(
          "id, account_id, filename, period_start, period_end, transaction_count, uploaded_at"
        )
        .eq("account_id", id)
        .order("period_start", { ascending: false }),
      supabase
        .from("transactions")
        .select(
          "id, pocket_id, amount, direction, txn_date, statement_id, clean_counterparty, raw_counterparty, counterparty_iban, is_recurring"
        )
        .eq("account_id", id),
      supabase
        .from("finance_pockets")
        .select("id, name, description, color, is_archived, created_at, group_name")
        .eq("is_archived", false)
        .order("created_at", { ascending: true }),
      supabase
        .from("rental_checks")
        .select(
          "id, account_id, name, expected_amount, counterparty_iban, start_date, notes, is_active, created_at"
        )
        .eq("account_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (accountRes.error || !accountRes.data) notFound();

  const txns: ScopedTxn[] = (txnsRes.data ?? []).map((t) => ({
    id: t.id as string,
    pocket_id: (t.pocket_id as string | null) ?? null,
    amount: Number(t.amount),
    direction: t.direction as "in" | "out",
    txn_date: t.txn_date as string,
    statement_id: t.statement_id as string,
    clean_counterparty: (t.clean_counterparty as string | null) ?? null,
    raw_counterparty: (t.raw_counterparty as string | null) ?? null,
    counterparty_iban: (t.counterparty_iban as string | null) ?? null,
    is_recurring: Boolean(t.is_recurring),
  }));

  const rentalChecks: RentalCheck[] = (checksRes.data ?? []).map((c) => ({
    id: c.id as string,
    account_id: c.account_id as string,
    name: c.name as string,
    expected_amount: Number(c.expected_amount),
    counterparty_iban: c.counterparty_iban as string,
    start_date: (c.start_date as string | null) ?? null,
    notes: (c.notes as string | null) ?? null,
    is_active: Boolean(c.is_active),
    created_at: c.created_at as string,
  }));

  return (
    <AccountView
      account={accountRes.data as BankAccount}
      statements={(statementsRes.data ?? []) as FinanceStatement[]}
      transactions={txns}
      pockets={(pocketsRes.data ?? []) as Pocket[]}
      rentalChecks={rentalChecks}
    />
  );
}
