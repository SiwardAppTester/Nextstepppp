"use client";

import Link from "next/link";
import { Landmark, ChevronRight, Wallet, AlertCircle } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BankAccount } from "@/lib/types";
import { formatIban } from "@/lib/finance/iban";

export type AccountSummary = {
  account: BankAccount;
  latest_month: string | null; // "YYYY-MM" or null if no data
  latest_net: number;
  total_transactions: number;
  last_upload: string | null;
  // Per-tenant cumulative debt across every month from each check's start
  // date through the latest data month. Empty if everyone is paid up.
  rent_debts: Array<{ name: string; amount: number }>;
};

export function FinanceView({ summaries }: { summaries: AccountSummary[] }) {
  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar crumbs={[{ label: "Finance" }]} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[820px] space-y-5">
          {summaries.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[18px] font-semibold">Accounts</h2>
                <span className="text-[11.5px] text-[var(--color-text-muted)]">
                  Click an account to upload statements and view its breakdown.
                </span>
              </div>
              <div className="space-y-3">
                {summaries.map((s) => (
                  <AccountSummaryCard key={s.account.id} summary={s} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Landmark className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <CardTitle>No bank accounts yet</CardTitle>
        </div>
        <CardDescription>
          Add an IBAN in Settings to start tracking finances.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/settings">
          <Button size="sm" variant="primary">
            Go to Settings
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function AccountSummaryCard({ summary }: { summary: AccountSummary }) {
  const {
    account,
    latest_month,
    latest_net,
    total_transactions,
    last_upload,
    rent_debts,
  } = summary;
  const totalDebt = rent_debts.reduce((s, d) => s + d.amount, 0);

  return (
    <Link
      href={`/finance/${account.id}`}
      className="block rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)] transition-colors"
    >
      <div className="flex items-start gap-3 p-4">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
          style={{
            backgroundColor: `${account.color}18`,
            borderColor: `${account.color}55`,
            color: account.color,
            boxShadow: `0 0 14px -4px ${account.color}55`,
          }}
        >
          <Landmark className="h-4 w-4" strokeWidth={2.4} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold">{account.nickname}</span>
            {account.bank_name && <Badge tone="neutral">{account.bank_name}</Badge>}
          </div>
          <div className="text-[11px] font-mono text-[var(--color-text-muted)] mt-0.5">
            {formatIban(account.iban)}
          </div>
          {account.description && (
            <div className="text-[11.5px] text-[var(--color-text-muted)] mt-1.5 line-clamp-2">
              {account.description}
            </div>
          )}

          <div className="mt-3 flex items-center gap-4 text-[11.5px] text-[var(--color-text-muted)]">
            {latest_month ? (
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-3 w-3" />
                <span className="font-medium text-[var(--color-text)]">
                  {fmtMonth(latest_month)}
                </span>
                <span
                  className={`tabular-nums font-semibold ${
                    latest_net >= 0
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-text)]"
                  }`}
                >
                  {latest_net >= 0 ? "+" : ""}
                  {formatEur(latest_net)}
                </span>
              </span>
            ) : (
              <span className="italic text-[var(--color-text-subtle)]">
                No transactions yet
              </span>
            )}
            {total_transactions > 0 && (
              <span className="tabular-nums">
                {total_transactions} txn{total_transactions === 1 ? "" : "s"}
              </span>
            )}
            {last_upload && (
              <span>
                Last upload{" "}
                {new Date(last_upload).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            )}
          </div>

          {rent_debts.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-warning)]">
              <span className="inline-flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                <span className="font-medium">{formatEur(totalDebt)} owed</span>
              </span>
              {rent_debts.map((d) => (
                <span
                  key={d.name}
                  className="text-[var(--color-text-muted)] tabular-nums"
                >
                  <span className="font-medium text-[var(--color-text)]">{d.name}</span>{" "}
                  {formatEur(d.amount)}
                </span>
              ))}
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-subtle)] mt-1" />
      </div>
    </Link>
  );
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
