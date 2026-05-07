"use client";

import { useState, useRef, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Landmark,
  Upload,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Trash2,
  Sparkles,
  Tag,
  TrendingUp,
  TrendingDown,
  Wallet,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Repeat,
  XCircle,
  Home,
  Plus,
  Pencil,
  Clock,
} from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import type {
  BankAccount,
  FinanceStatement,
  Pocket,
  RentalCheck,
} from "@/lib/types";
import { formatIban, normalizeIban } from "@/lib/finance/iban";
import type { ParsedTxn } from "@/lib/finance/parsers/ing";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteStatement,
  getStatementTransactionIds,
  addRentalCheck,
  updateRentalCheck,
  deleteRentalCheck,
} from "../actions";

export type ScopedTxn = {
  id: string;
  pocket_id: string | null;
  amount: number;
  direction: "in" | "out";
  txn_date: string;
  statement_id: string;
  clean_counterparty: string | null;
  raw_counterparty: string | null;
  counterparty_iban: string | null;
  is_recurring: boolean;
};

const BATCH_SIZE = 30;
const CONCURRENCY = 3;

async function runCategorizeBatched(
  statementId: string,
  txnIds: string[],
  onProgress: (completed: number, total: number) => void
): Promise<{ ok: true; assigned: number; new_pockets: number } | { ok: false; error: string }> {
  const batches: string[][] = [];
  for (let i = 0; i < txnIds.length; i += BATCH_SIZE) {
    batches.push(txnIds.slice(i, i + BATCH_SIZE));
  }
  if (batches.length === 0) return { ok: true, assigned: 0, new_pockets: 0 };

  let completed = 0;
  let totalAssigned = 0;
  let totalNewPockets = 0;
  let firstError: string | null = null;

  async function processBatch(ids: string[]) {
    if (firstError) return;
    try {
      const res = await fetch("/api/finance/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement_id: statementId, transaction_ids: ids }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (!firstError) firstError = json.error ?? "Categorize failed.";
        return;
      }
      totalAssigned += Number(json.assigned ?? 0);
      totalNewPockets += Number(json.new_pocket_count ?? 0);
    } catch (e) {
      if (!firstError) firstError = e instanceof Error ? e.message : "Network error.";
    } finally {
      completed++;
      onProgress(completed, batches.length);
    }
  }

  await processBatch(batches[0]);
  if (firstError) return { ok: false, error: firstError };

  const remaining = batches.slice(1);
  if (remaining.length > 0) {
    let cursor = 0;
    async function worker() {
      while (cursor < remaining.length) {
        const idx = cursor++;
        await processBatch(remaining[idx]);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, remaining.length) }, worker)
    );
  }

  if (firstError) return { ok: false, error: firstError };
  return { ok: true, assigned: totalAssigned, new_pockets: totalNewPockets };
}

type Preview = {
  filename: string;
  period_start: string;
  period_end: string;
  filtered_count: number;
  transactions: ParsedTxn[];
};

type UploadState =
  | { status: "idle" }
  | { status: "parsing"; filename: string }
  | { status: "preview"; data: Preview; file: File }
  | { status: "saving"; filename: string }
  | {
      status: "categorizing";
      completed_batches: number;
      total_batches: number;
      total_txns: number;
    }
  | { status: "done"; assigned: number; new_pockets: number }
  | { status: "error"; message: string };

export type EnrichedPocket = Pocket & {
  total: number;
  txn_count: number;
  transactions: ScopedTxn[];
};

export function AccountView({
  account,
  statements,
  transactions,
  pockets,
  rentalChecks,
}: {
  account: BankAccount;
  statements: FinanceStatement[];
  transactions: ScopedTxn[];
  pockets: Pocket[];
  rentalChecks: RentalCheck[];
}) {
  const router = useRouter();

  // Modal state.
  const [statementsOpen, setStatementsOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [checksOpen, setChecksOpen] = useState(false);
  // View inside the rental-checks modal: the list, an add form, or an edit form.
  const [checkView, setCheckView] = useState<
    { kind: "list" } | { kind: "add" } | { kind: "edit"; check: RentalCheck }
  >({ kind: "list" });

  function openChecks() {
    setCheckView({ kind: "list" });
    setChecksOpen(true);
  }

  // Upload state lives at this level so closing/reopening the upload modal
  // doesn't drop a categorize-in-progress.
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setUploadState({ status: "error", message: "Please upload a .csv file." });
      return;
    }
    setUploadState({ status: "parsing", filename: file.name });
    const form = new FormData();
    form.append("file", file);
    form.append("account_id", account.id);
    try {
      const res = await fetch("/api/finance/parse", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setUploadState({ status: "error", message: json.error ?? "Parse failed." });
        return;
      }
      setUploadState({ status: "preview", data: json, file });
    } catch (e) {
      setUploadState({
        status: "error",
        message: e instanceof Error ? e.message : "Network error.",
      });
    }
  }

  async function handleSave() {
    if (uploadState.status !== "preview") return;
    const file = uploadState.file;

    setUploadState({ status: "saving", filename: file.name });
    const form = new FormData();
    form.append("file", file);
    form.append("account_id", account.id);

    let statementId: string;
    let txnIds: string[];
    try {
      const res = await fetch("/api/finance/persist", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setUploadState({ status: "error", message: json.error ?? "Save failed." });
        return;
      }
      statementId = json.statement_id as string;
      txnIds = (json.transaction_ids as string[]) ?? [];
    } catch (e) {
      setUploadState({
        status: "error",
        message: e instanceof Error ? e.message : "Network error.",
      });
      return;
    }

    if (txnIds.length === 0) {
      setUploadState({ status: "done", assigned: 0, new_pockets: 0 });
      router.refresh();
      return;
    }

    const totalBatches = Math.ceil(txnIds.length / BATCH_SIZE);
    setUploadState({
      status: "categorizing",
      completed_batches: 0,
      total_batches: totalBatches,
      total_txns: txnIds.length,
    });

    const result = await runCategorizeBatched(statementId, txnIds, (completed, total) => {
      setUploadState({
        status: "categorizing",
        completed_batches: completed,
        total_batches: total,
        total_txns: txnIds.length,
      });
    });

    if (!result.ok) {
      setUploadState({
        status: "error",
        message: `Saved, but categorization failed: ${result.error}. Hit "Re-categorize" to retry.`,
      });
      router.refresh();
      return;
    }

    setUploadState({
      status: "done",
      assigned: result.assigned,
      new_pockets: result.new_pockets,
    });
    router.refresh();
  }

  function closeUploadModal() {
    setUploadOpen(false);
    // Reset to idle on close if we're in a terminal state — keeps mid-flight
    // progress visible if you just collapsed the modal.
    if (uploadState.status === "done" || uploadState.status === "error") {
      setUploadState({ status: "idle" });
    }
  }

  // Available months derived from this account's transactions, newest first.
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) set.add(t.txn_date.slice(0, 7));
    return [...set].sort().reverse();
  }, [transactions]);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  // Derive at render so the month auto-refreshes when data changes (e.g.
  // after an upload pushes new months in via router.refresh()).
  const month: string | null = selectedMonth ?? availableMonths[0] ?? null;

  const monthTxns = useMemo(
    () => (month ? transactions.filter((t) => t.txn_date.startsWith(month)) : []),
    [transactions, month]
  );

  const enrichedPockets = useMemo<EnrichedPocket[]>(() => {
    const txnsByPocket = new Map<string, ScopedTxn[]>();
    for (const t of monthTxns) {
      if (!t.pocket_id) continue;
      const arr = txnsByPocket.get(t.pocket_id) ?? [];
      arr.push(t);
      txnsByPocket.set(t.pocket_id, arr);
    }
    return pockets.map((p) => {
      const txns = (txnsByPocket.get(p.id) ?? []).sort((a, b) =>
        b.txn_date.localeCompare(a.txn_date)
      );
      const total = txns.reduce((s, t) => s + t.amount, 0);
      return { ...p, total, txn_count: txns.length, transactions: txns };
    });
  }, [pockets, monthTxns]);

  const uncategorizedThisMonth = monthTxns.filter((t) => !t.pocket_id);

  const totalIn = monthTxns
    .filter((t) => t.direction === "in")
    .reduce((s, t) => s + t.amount, 0);
  const totalOut = monthTxns
    .filter((t) => t.direction === "out")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = totalIn - totalOut;

  const uploadInProgress =
    uploadState.status === "parsing" ||
    uploadState.status === "saving" ||
    uploadState.status === "categorizing";

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar
        crumbs={[{ label: "Finance", href: "/finance" }, { label: account.nickname }]}
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[820px] space-y-5">
          <Link
            href="/finance"
            className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All accounts
          </Link>

          <AccountHeader
            account={account}
            actions={
              <>
                <StatementsIconButton
                  count={statements.length}
                  onClick={() => setStatementsOpen(true)}
                />
                <RentalChecksIconButton
                  count={rentalChecks.filter((c) => c.is_active).length}
                  onClick={openChecks}
                />
                <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
                  {uploadInProgress ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-accent)]" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Upload
                </Button>
              </>
            }
          />

          {availableMonths.length > 0 && month && (
            <MonthSwitcher
              months={availableMonths}
              selected={month}
              onSelect={setSelectedMonth}
            />
          )}

          {availableMonths.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-[12.5px] text-[var(--color-text-muted)]">
                No transactions yet. Click <span className="font-medium">Upload statement</span>{" "}
                above to get started.
              </CardContent>
            </Card>
          ) : (
            <>
              <HeroNumbers totalIn={totalIn} totalOut={totalOut} net={net} />
              {monthTxns.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-[12.5px] text-[var(--color-text-muted)]">
                    {month ? `No transactions in ${fmtMonth(month)}.` : "No transactions."}
                  </CardContent>
                </Card>
              ) : (
                <PocketsBreakdown
                  pockets={enrichedPockets}
                  uncategorized={uncategorizedThisMonth}
                />
              )}
            </>
          )}

        </div>
      </div>

      <Modal
        open={statementsOpen}
        onClose={() => setStatementsOpen(false)}
        title="Statements"
        description="All uploads for this account. Re-categorize to refresh AI assignments."
        size="lg"
      >
        {statements.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-[var(--color-text-muted)]">
            No statements uploaded yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {statements.map((s) => (
              <StatementRow key={s.id} statement={s} />
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={uploadOpen}
        onClose={closeUploadModal}
        title="Upload statement"
        description={`ING CSV for ${account.nickname}.`}
        size="lg"
      >
        <UploadFlowBody
          state={uploadState}
          onFile={handleFile}
          onSave={handleSave}
          onDiscard={() => setUploadState({ status: "idle" })}
        />
      </Modal>

      <Modal
        open={checksOpen}
        onClose={() => setChecksOpen(false)}
        title={
          checkView.kind === "list"
            ? "Rental checks"
            : checkView.kind === "add"
              ? "Add rental check"
              : "Edit rental check"
        }
        description={
          checkView.kind === "list"
            ? "Track recurring incoming payments. Status is checked against transactions on this account for the selected month."
            : "Track an expected recurring payment against transactions on this account."
        }
        size="md"
      >
        {checkView.kind === "list" ? (
          <RentalChecksList
            checks={rentalChecks}
            monthTxns={monthTxns}
            month={month}
            onAdd={() => setCheckView({ kind: "add" })}
            onEdit={(check) => setCheckView({ kind: "edit", check })}
          />
        ) : (
          <RentalCheckForm
            accountId={account.id}
            existing={checkView.kind === "edit" ? checkView.check : null}
            onClose={() => setCheckView({ kind: "list" })}
          />
        )}
      </Modal>
    </div>
  );
}

function AccountHeader({
  account,
  actions,
}: {
  account: BankAccount;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
      <div className="flex items-start gap-4">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border"
          style={{
            backgroundColor: `${account.color}18`,
            borderColor: `${account.color}55`,
            color: account.color,
            boxShadow: `0 0 16px -6px ${account.color}66`,
          }}
        >
          <Landmark className="h-4 w-4" strokeWidth={2.4} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] font-semibold tracking-tight truncate">
            {account.nickname}
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--color-text-muted)]">
            {account.bank_name && (
              <span className="font-medium">{account.bank_name}</span>
            )}
            {account.bank_name && (
              <span className="text-[var(--color-text-subtle)]">·</span>
            )}
            <span className="font-mono">{formatIban(account.iban)}</span>
          </div>
          {account.description && (
            <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">
              {account.description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
        )}
      </div>
    </div>
  );
}

function StatementsIconButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${count} statement${count === 1 ? "" : "s"}`}
      aria-label={`${count} statements`}
      className="relative flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--color-border)] bg-transparent text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
    >
      <FileText className="h-3.5 w-3.5" />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[9.5px] font-semibold leading-none text-[var(--color-accent-foreground)]">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

function MonthSwitcher({
  months,
  selected,
  onSelect,
}: {
  months: string[];
  selected: string;
  onSelect: (m: string) => void;
}) {
  const idx = months.indexOf(selected);
  const olderMonth = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;
  const newerMonth = idx > 0 ? months[idx - 1] : null;

  return (
    <div className="flex items-center justify-between rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => olderMonth && onSelect(olderMonth)}
        disabled={!olderMonth}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        {olderMonth ? fmtMonth(olderMonth) : "—"}
      </Button>
      <div className="text-[14px] font-semibold tabular-nums">{fmtMonth(selected)}</div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => newerMonth && onSelect(newerMonth)}
        disabled={!newerMonth}
      >
        {newerMonth ? fmtMonth(newerMonth) : "—"}
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function HeroNumbers({
  totalIn,
  totalOut,
  net,
}: {
  totalIn: number;
  totalOut: number;
  net: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Hero
        label="Income"
        value={formatEur(totalIn)}
        icon={<TrendingUp className="h-3.5 w-3.5" />}
        tone="positive"
      />
      <Hero
        label="Expenses"
        value={formatEur(-totalOut)}
        icon={<TrendingDown className="h-3.5 w-3.5" />}
        tone="negative"
      />
      <Hero
        label="Net"
        value={formatEur(net)}
        icon={<Wallet className="h-3.5 w-3.5" />}
        tone={net >= 0 ? "positive" : "negative"}
      />
    </div>
  );
}

function Hero({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "positive" | "negative";
}) {
  const colorClass =
    tone === "positive" ? "text-[var(--color-success)]" : "text-[var(--color-text)]";
  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
        <span className={colorClass}>{icon}</span>
        {label}
      </div>
      <div className={`mt-1 text-[20px] font-semibold tabular-nums ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}

function PocketsBreakdown({
  pockets,
  uncategorized,
}: {
  pockets: EnrichedPocket[];
  uncategorized: ScopedTxn[];
}) {
  const active = pockets.filter((p) => p.txn_count > 0);
  const income = active.filter((p) => p.total > 0).sort((a, b) => b.total - a.total);
  const expenses = active.filter((p) => p.total < 0).sort((a, b) => a.total - b.total);

  if (active.length === 0 && uncategorized.length === 0) return null;

  const totalIn = income.reduce((s, p) => s + p.total, 0);
  const totalOut = expenses.reduce((s, p) => s + Math.abs(p.total), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Tag className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <CardTitle>Where it went</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {income.length > 0 && (
          <PocketSection
            title="Income"
            count={income.length}
            pockets={income}
            grandTotal={totalIn}
          />
        )}
        {expenses.length > 0 && (
          <PocketSection
            title="Expenses"
            count={expenses.length}
            pockets={expenses}
            grandTotal={totalOut}
          />
        )}
        {uncategorized.length > 0 && <UncategorizedNotice uncategorized={uncategorized} />}
      </CardContent>
    </Card>
  );
}

function UncategorizedNotice({ uncategorized }: { uncategorized: ScopedTxn[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<
    | { kind: "idle" }
    | { kind: "running"; completed: number; total: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function categorize() {
    // Group uncategorized by statement_id — categorize endpoint scopes per
    // statement, so we make one batched call per group.
    const byStatement = new Map<string, string[]>();
    for (const t of uncategorized) {
      const arr = byStatement.get(t.statement_id) ?? [];
      arr.push(t.id);
      byStatement.set(t.statement_id, arr);
    }

    const totalBatches = [...byStatement.values()].reduce(
      (s, ids) => s + Math.ceil(ids.length / BATCH_SIZE),
      0
    );
    let completedSoFar = 0;
    setBusy({ kind: "running", completed: 0, total: totalBatches });

    for (const [statementId, ids] of byStatement) {
      const result = await runCategorizeBatched(statementId, ids, (c) => {
        setBusy({ kind: "running", completed: completedSoFar + c, total: totalBatches });
      });
      if (!result.ok) {
        setBusy({ kind: "error", message: result.error });
        return;
      }
      completedSoFar += Math.ceil(ids.length / BATCH_SIZE);
    }

    setBusy({ kind: "idle" });
    router.refresh();
  }

  if (busy.kind === "running") {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[12px]">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--color-accent)]" />
        <span>
          Categorizing batch {busy.completed}/{busy.total} ({uncategorized.length}{" "}
          transactions)…
        </span>
      </div>
    );
  }

  if (busy.kind === "error") {
    return (
      <div className="flex items-start gap-2 rounded-[10px] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2.5 text-[12px] text-[var(--color-danger)]">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{busy.message}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[12px]">
      <Info className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-subtle)]" />
      <span className="flex-1 text-[var(--color-text-muted)]">
        {uncategorized.length} transaction{uncategorized.length === 1 ? "" : "s"} this
        month aren't categorized yet.
      </span>
      <Button size="sm" variant="primary" onClick={categorize}>
        <Sparkles className="h-3 w-3" />
        Categorize {uncategorized.length}
      </Button>
    </div>
  );
}

function PocketSection({
  title,
  count,
  pockets,
  grandTotal,
}: {
  title: string;
  count: number;
  pockets: EnrichedPocket[];
  grandTotal: number;
}) {
  const isIncome = title === "Income";

  const groupMap = new Map<string, EnrichedPocket[]>();
  for (const p of pockets) {
    const key = p.group_name?.trim() || "Other";
    const arr = groupMap.get(key) ?? [];
    arr.push(p);
    groupMap.set(key, arr);
  }

  const groups = [...groupMap.entries()]
    .map(([name, ps]) => {
      const total = ps.reduce((s, p) => s + Math.abs(p.total), 0);
      return {
        name,
        pockets: ps.sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
        total,
      };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
          {title} · {count} pocket{count === 1 ? "" : "s"}
        </div>
        <div className="text-[10.5px] tabular-nums text-[var(--color-text-subtle)]">
          {formatEur(isIncome ? grandTotal : -grandTotal)}
        </div>
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <GroupBlock
            key={g.name}
            group={g}
            grandTotal={grandTotal}
            isIncome={isIncome}
          />
        ))}
      </div>
    </div>
  );
}

function GroupBlock({
  group,
  grandTotal,
  isIncome,
}: {
  group: { name: string; pockets: EnrichedPocket[]; total: number };
  grandTotal: number;
  isIncome: boolean;
}) {
  const groupNet = isIncome ? group.total : -group.total;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1">
        <div className="text-[12px] font-medium text-[var(--color-text)]">
          {group.name}{" "}
          <span className="text-[var(--color-text-subtle)] font-normal">
            · {group.pockets.length}
          </span>
        </div>
        <div
          className={`text-[12px] tabular-nums font-semibold ${
            isIncome ? "text-[var(--color-success)]" : "text-[var(--color-text)]"
          }`}
        >
          {isIncome ? "+" : ""}
          {formatEur(groupNet)}
        </div>
      </div>
      <div className="space-y-1 pl-3 border-l border-[var(--color-border)]">
        {group.pockets.map((p) => (
          <PocketRow key={p.id} pocket={p} grandTotal={grandTotal} />
        ))}
      </div>
    </div>
  );
}

function PocketRow({
  pocket,
  grandTotal,
}: {
  pocket: EnrichedPocket;
  grandTotal: number;
}) {
  const [open, setOpen] = useState(false);
  const absTotal = Math.abs(pocket.total);
  const pct = grandTotal > 0 ? Math.min(100, (absTotal / grandTotal) * 100) : 0;
  const hasTxns = pocket.transactions.length > 0;

  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] transition-colors hover:border-[var(--color-border-strong)]">
      <button
        type="button"
        onClick={() => hasTxns && setOpen((v) => !v)}
        disabled={!hasTxns}
        className="relative block w-full text-left transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-default"
        title={pocket.description ?? undefined}
        aria-expanded={open}
      >
        <div
          className="absolute inset-y-0 left-0 transition-all"
          style={{ width: `${pct}%`, backgroundColor: `${pocket.color}1a` }}
        />
        <div className="relative flex items-center gap-3 px-3 py-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: pocket.color }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium truncate">{pocket.name}</div>
            <div className="text-[10.5px] text-[var(--color-text-subtle)]">
              {pocket.txn_count} txn{pocket.txn_count === 1 ? "" : "s"} ·{" "}
              {pct.toFixed(0)}%
            </div>
          </div>
          <div
            className={`text-[13px] font-semibold tabular-nums ${
              pocket.total > 0 ? "text-[var(--color-success)]" : "text-[var(--color-text)]"
            }`}
          >
            {pocket.total > 0 ? "+" : ""}
            {formatEur(pocket.total)}
          </div>
          {hasTxns && (
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-[var(--color-text-subtle)] transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          )}
        </div>
      </button>
      {open && hasTxns && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]/50">
          {pocket.transactions.map((t) => (
            <TxnLine key={t.id} txn={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TxnLine({ txn }: { txn: ScopedTxn }) {
  const counterparty = txn.clean_counterparty || txn.raw_counterparty || "—";
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-[11.5px]">
      <span className="w-[42px] shrink-0 font-mono text-[var(--color-text-subtle)]">
        {fmtDate(txn.txn_date)}
      </span>
      <span className="flex-1 min-w-0 truncate text-[var(--color-text-muted)]">
        {counterparty}
        {txn.is_recurring && (
          <span
            className="ml-2 inline-flex items-center gap-0.5 text-[9.5px] uppercase tracking-wider text-[var(--color-text-subtle)]"
            title="Recurring"
          >
            <Repeat className="h-2.5 w-2.5" />
          </span>
        )}
      </span>
      <span
        className={`shrink-0 font-mono tabular-nums ${
          txn.amount > 0 ? "text-[var(--color-success)]" : "text-[var(--color-text)]"
        }`}
      >
        {txn.amount > 0 ? "+" : ""}
        {formatEur(txn.amount)}
      </span>
    </div>
  );
}

function StatementRow({ statement }: { statement: FinanceStatement }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<
    { kind: "idle" } | { kind: "recategorizing"; completed: number; total: number }
  >({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (
      !confirm(
        `Delete "${statement.filename}"? Its ${statement.transaction_count} transactions go with it.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteStatement(statement.id);
      if (!r.ok) setError(r.error ?? "Couldn't delete.");
    });
  }

  async function recategorize() {
    setError(null);
    const r = await getStatementTransactionIds(statement.id);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.ids.length === 0) {
      router.refresh();
      return;
    }
    const totalBatches = Math.ceil(r.ids.length / BATCH_SIZE);
    setBusy({ kind: "recategorizing", completed: 0, total: totalBatches });
    const result = await runCategorizeBatched(statement.id, r.ids, (completed, total) => {
      setBusy({ kind: "recategorizing", completed, total });
    });
    setBusy({ kind: "idle" });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const recategorizing = busy.kind === "recategorizing";
  const disabled = pending || recategorizing;

  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)] transition-colors">
      <div className="flex items-center gap-3 px-3 py-2">
        <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium truncate">
            {statement.filename ?? "(unnamed)"}
          </div>
          <div className="text-[10.5px] text-[var(--color-text-subtle)]">
            {statement.period_start && statement.period_end
              ? `${fmtDate(statement.period_start)} — ${fmtDate(statement.period_end)} · `
              : ""}
            {statement.transaction_count} transactions · uploaded{" "}
            {new Date(statement.uploaded_at).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={recategorize} disabled={disabled}>
          {recategorizing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {recategorizing
            ? `Batch ${busy.kind === "recategorizing" ? busy.completed : 0}/${busy.kind === "recategorizing" ? busy.total : 0}`
            : "Re-categorize"}
        </Button>
        <Button size="sm" variant="ghost" onClick={remove} disabled={disabled}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {error && (
        <div className="border-t border-[var(--color-border)] px-3 py-1.5 text-[11.5px] text-[var(--color-danger)]">
          {error}
        </div>
      )}
    </div>
  );
}

function UploadFlowBody({
  state,
  onFile,
  onSave,
  onDiscard,
}: {
  state: UploadState;
  onFile: (f: File) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer rounded-[10px] border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? "border-[var(--color-border-accent)] bg-[var(--color-accent-soft)]"
            : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)]"
        }`}
      >
        <Upload className="mx-auto h-5 w-5 text-[var(--color-text-muted)]" />
        <div className="mt-2 text-[13px] font-medium">
          Drop a CSV statement, or click to choose
        </div>
        <div className="mt-0.5 text-[11.5px] text-[var(--color-text-subtle)]">
          ING bank export (.csv)
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {state.status === "parsing" && (
        <StatusRow icon="loader" tone="neutral">
          Parsing {state.filename}…
        </StatusRow>
      )}
      {state.status === "saving" && (
        <StatusRow icon="loader" tone="neutral">
          Saving {state.filename}…
        </StatusRow>
      )}
      {state.status === "categorizing" && (
        <StatusRow icon="sparkles" tone="neutral">
          Categorizing batch {state.completed_batches}/{state.total_batches} (
          {state.total_txns} transactions)…
        </StatusRow>
      )}
      {state.status === "done" && (
        <StatusRow icon="check" tone="success">
          Categorized {state.assigned} transactions
          {state.new_pockets > 0 &&
            ` · ${state.new_pockets} new pocket${state.new_pockets === 1 ? "" : "s"} created`}
        </StatusRow>
      )}
      {state.status === "error" && (
        <StatusRow icon="alert" tone="danger">
          {state.message}
        </StatusRow>
      )}

      {state.status === "preview" && (
        <Preview data={state.data} saving={false} onSave={onSave} onDiscard={onDiscard} />
      )}
    </div>
  );
}

function StatusRow({
  icon,
  tone,
  children,
}: {
  icon: "loader" | "alert" | "check" | "sparkles";
  tone: "neutral" | "danger" | "success";
  children: React.ReactNode;
}) {
  const Icon =
    icon === "loader"
      ? Loader2
      : icon === "alert"
        ? AlertCircle
        : icon === "sparkles"
          ? Sparkles
          : CheckCircle2;
  const toneClass =
    tone === "danger"
      ? "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
      : tone === "success"
        ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]"
        : "border-[var(--color-border)] bg-[var(--color-surface-2)]";
  return (
    <div
      className={`flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-[12.5px] ${toneClass}`}
    >
      <Icon
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
          icon === "loader" || icon === "sparkles"
            ? "animate-spin text-[var(--color-accent)]"
            : ""
        }`}
      />
      <span>{children}</span>
    </div>
  );
}

function Preview({
  data,
  saving,
  onSave,
  onDiscard,
}: {
  data: Preview;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const totalIn = data.transactions
    .filter((t) => t.direction === "in")
    .reduce((s, t) => s + t.amount, 0);
  const totalOut = data.transactions
    .filter((t) => t.direction === "out")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = totalIn - totalOut;

  return (
    <div className="space-y-3">
      <StatusRow icon="check" tone="success">
        Parsed {data.transactions.length} transactions from {data.filename}
        {data.filtered_count > 0 &&
          ` (${data.filtered_count} transfer-fee row${data.filtered_count === 1 ? "" : "s"} filtered)`}
      </StatusRow>

      <div className="grid grid-cols-3 gap-3">
        <Hero
          label="In"
          value={formatEur(totalIn)}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone="positive"
        />
        <Hero
          label="Out"
          value={formatEur(-totalOut)}
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          tone="negative"
        />
        <Hero
          label="Net"
          value={formatEur(net)}
          icon={<Wallet className="h-3.5 w-3.5" />}
          tone={net >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
        Period {fmtDate(data.period_start)} — {fmtDate(data.period_end)}
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[var(--color-border)]">
        <table className="w-full text-[12px]">
          <thead className="bg-[var(--color-surface-2)] text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-text-subtle)]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Counterparty</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((t, i) => (
              <tr key={i} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2 whitespace-nowrap font-mono text-[var(--color-text-muted)]">
                  {fmtDate(t.txn_date)}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium truncate max-w-[280px]">
                    {t.raw_counterparty || "—"}
                  </div>
                  <div className="text-[10.5px] text-[var(--color-text-subtle)] truncate max-w-[280px]">
                    {t.mutatiesoort}
                    {t.counterparty_iban ? ` · ${t.counterparty_iban}` : ""}
                  </div>
                </td>
                <td
                  className={`px-3 py-2 text-right whitespace-nowrap font-mono tabular-nums ${
                    t.direction === "in"
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-text)]"
                  }`}
                >
                  {t.direction === "in" ? "+" : ""}
                  {formatEur(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        <Button size="sm" variant="primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : `Save ${data.transactions.length} transactions`}
        </Button>
      </div>
    </div>
  );
}

type CheckStatus = "paid" | "partial" | "missing" | "not_started";

function statusFor(
  check: RentalCheck,
  monthTxns: ScopedTxn[],
  selectedMonth: string | null
): { status: CheckStatus; received: number } {
  // If the check has a start date and the selected month is earlier than the
  // start date's month, the check isn't active yet — don't flag it missing.
  if (selectedMonth && check.start_date) {
    const startMonth = check.start_date.slice(0, 7);
    if (selectedMonth < startMonth) {
      return { status: "not_started", received: 0 };
    }
  }

  const target = normalizeIban(check.counterparty_iban);
  let received = 0;
  for (const t of monthTxns) {
    if (t.direction !== "in") continue;
    if (!t.counterparty_iban) continue;
    if (normalizeIban(t.counterparty_iban) !== target) continue;
    received += t.amount;
  }
  let status: CheckStatus = "missing";
  if (received >= check.expected_amount) status = "paid";
  else if (received > 0) status = "partial";
  return { status, received };
}

function RentalChecksIconButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${count} rental check${count === 1 ? "" : "s"}`}
      aria-label={`${count} rental checks`}
      className="relative flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--color-border)] bg-transparent text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
    >
      <Home className="h-3.5 w-3.5" />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[9.5px] font-semibold leading-none text-[var(--color-accent-foreground)]">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

function RentalChecksList({
  checks,
  monthTxns,
  month,
  onAdd,
  onEdit,
}: {
  checks: RentalCheck[];
  monthTxns: ScopedTxn[];
  month: string | null;
  onAdd: () => void;
  onEdit: (check: RentalCheck) => void;
}) {
  const active = checks.filter((c) => c.is_active);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11.5px] text-[var(--color-text-muted)]">
          {month ? `Status for ${fmtMonth(month)}` : "No month selected"}
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add check
        </Button>
      </div>

      {active.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-8 text-center text-[12.5px] text-[var(--color-text-muted)]">
          No rental checks yet. Add one to track expected monthly payments.
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((check) => (
            <RentalCheckRow
              key={check.id}
              check={check}
              monthTxns={monthTxns}
              month={month}
              onEdit={() => onEdit(check)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RentalCheckRow({
  check,
  monthTxns,
  month,
  onEdit,
}: {
  check: RentalCheck;
  monthTxns: ScopedTxn[];
  month: string | null;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { status, received } = statusFor(check, monthTxns, month);

  function remove() {
    if (!confirm(`Delete rental check "${check.name}"?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteRentalCheck(check.id);
      if (!r.ok) setError(r.error ?? "Couldn't delete.");
      else router.refresh();
    });
  }

  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)] transition-colors">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <StatusDot status={status} />
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="text-[13px] font-semibold tracking-tight truncate">
            {check.name}
          </div>
          <div className="text-[11.5px] text-[var(--color-text-muted)]">
            {formatEur(check.expected_amount)} expected ·{" "}
            <span className="font-mono">{formatIban(check.counterparty_iban)}</span>
          </div>
          {check.start_date && (
            <div className="text-[10.5px] text-[var(--color-text-subtle)]">
              Started {fmtFullDate(check.start_date)}
            </div>
          )}
          <StatusLine
            status={status}
            received={received}
            expected={check.expected_amount}
            month={month}
            startDate={check.start_date}
          />
          {check.notes && (
            <div className="text-[11px] text-[var(--color-text-subtle)]">{check.notes}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            title="Edit"
            aria-label="Edit"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            title="Delete"
            aria-label="Delete"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {error && (
        <div className="border-t border-[var(--color-border)] px-3 py-1.5 text-[11.5px] text-[var(--color-danger)]">
          {error}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: CheckStatus }) {
  if (status === "paid") {
    return (
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]"
        aria-label="Paid"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-warning)]"
        aria-label="Partial"
      >
        <AlertCircle className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === "not_started") {
    return (
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-subtle)]"
        aria-label="Not started yet"
      >
        <Clock className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
      aria-label="Missing"
    >
      <XCircle className="h-3.5 w-3.5" />
    </span>
  );
}

function StatusLine({
  status,
  received,
  expected,
  month,
  startDate,
}: {
  status: CheckStatus;
  received: number;
  expected: number;
  month: string | null;
  startDate: string | null;
}) {
  const monthLabel = month ? fmtMonth(month) : "this month";
  if (status === "not_started") {
    return (
      <div className="text-[11.5px] text-[var(--color-text-subtle)]">
        Not active yet · starts {startDate ? fmtFullDate(startDate) : "later"}
      </div>
    );
  }
  if (status === "paid") {
    return (
      <div className="text-[11.5px] text-[var(--color-success)]">
        {monthLabel}: paid · {formatEur(received)} received
      </div>
    );
  }
  if (status === "partial") {
    return (
      <div className="text-[11.5px] text-[var(--color-warning)]">
        {monthLabel}: partial · {formatEur(received)} of {formatEur(expected)}
      </div>
    );
  }
  return (
    <div className="text-[11.5px] text-[var(--color-danger)]">
      {monthLabel}: nothing received yet
    </div>
  );
}

function fmtFullDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function RentalCheckForm({
  accountId,
  existing,
  onClose,
}: {
  accountId: string;
  existing: RentalCheck | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  const [amount, setAmount] = useState(
    existing ? String(existing.expected_amount) : ""
  );
  const [iban, setIban] = useState(existing?.counterparty_iban ?? "");
  const [startDate, setStartDate] = useState(existing?.start_date ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const num = Number(amount.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) {
      setError("Expected amount must be a number greater than zero.");
      return;
    }
    if (!iban.trim()) {
      setError("Counterparty IBAN is required.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setError("Pick a start date.");
      return;
    }
    startTransition(async () => {
      const r = existing
        ? await updateRentalCheck(existing.id, {
            name,
            expected_amount: num,
            counterparty_iban: iban,
            start_date: startDate,
            notes: notes.trim() || null,
          })
        : await addRentalCheck({
            account_id: accountId,
            name,
            expected_amount: num,
            counterparty_iban: iban,
            start_date: startDate,
            notes: notes.trim() || undefined,
          });
      if (!r.ok) {
        setError(r.error ?? "Couldn't save.");
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Name</FieldLabel>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Apartment 1 — Rene"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
        <div>
          <FieldLabel>Counterparty IBAN</FieldLabel>
          <Input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="NL37RABO0174853335"
          />
        </div>
        <div>
          <FieldLabel>Expected amount €</FieldLabel>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1100"
          />
        </div>
      </div>
      <div>
        <FieldLabel>Start date</FieldLabel>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <div className="mt-1 text-[10.5px] text-[var(--color-text-subtle)]">
          Months before this date won&apos;t be flagged as missing.
        </div>
      </div>
      <div>
        <FieldLabel>Notes (optional)</FieldLabel>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Any context about this tenant or payment."
        />
      </div>
      {error && <div className="text-[12px] text-[var(--color-danger)]">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={submit}
          disabled={pending || !name.trim()}
        >
          {pending ? "Saving…" : existing ? "Save changes" : "Add check"}
        </Button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
      {children}
    </div>
  );
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fmtMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
