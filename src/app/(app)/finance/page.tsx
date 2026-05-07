import { createClient } from "@/lib/supabase/server";
import { FinanceView, type AccountSummary } from "./finance-view";
import type { BankAccount } from "@/lib/types";
import { normalizeIban } from "@/lib/finance/iban";

export default async function FinancePage() {
  const supabase = await createClient();

  const [
    { data: bankAccounts },
    { data: statements },
    { data: txns },
    { data: rentalChecks },
  ] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select("id, iban, nickname, description, bank_name, color, currency, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("statements")
      .select("account_id, uploaded_at, period_end")
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("transactions")
      .select("account_id, txn_date, amount, direction, counterparty_iban"),
    supabase
      .from("rental_checks")
      .select("account_id, name, expected_amount, counterparty_iban, start_date, is_active")
      .eq("is_active", true),
  ]);

  // Per-account aggregates: total transactions, latest month, that month's net,
  // and last upload date. Computed in JS (one pass) since we already have all
  // rows in memory and there's no `group by` in supabase-js.
  const stats = new Map<
    string,
    { months: Map<string, number>; total: number }
  >();
  for (const t of txns ?? []) {
    const accId = t.account_id as string;
    const month = (t.txn_date as string).slice(0, 7);
    const amt = Number(t.amount);
    const cur = stats.get(accId) ?? { months: new Map<string, number>(), total: 0 };
    cur.months.set(month, (cur.months.get(month) ?? 0) + amt);
    cur.total++;
    stats.set(accId, cur);
  }

  const lastUploadByAccount = new Map<string, string>();
  for (const s of statements ?? []) {
    const accId = s.account_id as string;
    if (!lastUploadByAccount.has(accId)) {
      lastUploadByAccount.set(accId, s.uploaded_at as string);
    }
  }

  // Per-account rent debt by tenant: for each active rental check, walk every
  // month from start_date through latest data month, sum the per-month
  // shortfalls (max(0, expected - received)). Each month is treated as a
  // separate obligation — past overpayments don't credit forward.
  const checksByAccount = new Map<
    string,
    Array<{
      name: string;
      expected_amount: number;
      counterparty_iban: string;
      start_date: string | null;
    }>
  >();
  for (const c of rentalChecks ?? []) {
    const accId = c.account_id as string;
    const arr = checksByAccount.get(accId) ?? [];
    arr.push({
      name: c.name as string,
      expected_amount: Number(c.expected_amount),
      counterparty_iban: normalizeIban(c.counterparty_iban as string),
      start_date: (c.start_date as string | null) ?? null,
    });
    checksByAccount.set(accId, arr);
  }

  function enumerateMonths(start: string, end: string): string[] {
    // Both inputs are "YYYY-MM". Returns all months from start to end inclusive.
    const out: string[] = [];
    const [sy, sm] = start.split("-").map(Number);
    const [ey, em] = end.split("-").map(Number);
    let y = sy;
    let m = sm;
    while (y < ey || (y === ey && m <= em)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return out;
  }

  function computeDebts(
    accountId: string,
    latestMonth: string | null
  ): Array<{ name: string; amount: number }> {
    if (!latestMonth) return [];
    const checks = checksByAccount.get(accountId);
    if (!checks || checks.length === 0) return [];

    const debts: Array<{ name: string; amount: number }> = [];
    for (const check of checks) {
      const startMonth = check.start_date?.slice(0, 7);
      if (!startMonth) continue; // no start date → can't determine debt window
      if (startMonth > latestMonth) continue; // hasn't started yet

      const months = enumerateMonths(startMonth, latestMonth);
      let total = 0;
      for (const month of months) {
        let received = 0;
        for (const t of txns ?? []) {
          if ((t.account_id as string) !== accountId) continue;
          if ((t.direction as string) !== "in") continue;
          const tIban = t.counterparty_iban as string | null;
          if (!tIban) continue;
          if (normalizeIban(tIban) !== check.counterparty_iban) continue;
          if ((t.txn_date as string).slice(0, 7) !== month) continue;
          received += Number(t.amount);
        }
        const monthShortfall = Math.max(0, check.expected_amount - received);
        total += monthShortfall;
      }

      if (total > 0) debts.push({ name: check.name, amount: total });
    }
    return debts;
  }

  const summaries: AccountSummary[] = ((bankAccounts ?? []) as BankAccount[]).map((a) => {
    const data = stats.get(a.id);
    const months = data ? [...data.months.keys()].sort().reverse() : [];
    const latestMonth = months[0] ?? null;
    const latestNet = latestMonth ? (data?.months.get(latestMonth) ?? 0) : 0;
    return {
      account: a,
      latest_month: latestMonth,
      latest_net: latestNet,
      total_transactions: data?.total ?? 0,
      last_upload: lastUploadByAccount.get(a.id) ?? null,
      rent_debts: computeDebts(a.id, latestMonth),
    };
  });

  return <FinanceView summaries={summaries} />;
}
