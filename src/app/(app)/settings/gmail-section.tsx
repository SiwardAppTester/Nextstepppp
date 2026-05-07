"use client";

import { useState, useTransition, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mail, RefreshCw, Trash2, Plus, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GmailAccount } from "@/lib/types";
import {
  disconnectGmailAccount,
  refreshGmailAccounts,
  refreshOneGmailAccount,
} from "./actions";

type Banner = { kind: "ok" | "err"; msg: string } | null;

function bannerFromParams(params: { get(key: string): string | null }): Banner {
  const status = params.get("gmail");
  if (status === "connected") {
    return { kind: "ok", msg: `Connected ${params.get("email") ?? "Gmail account"}.` };
  }
  if (status === "error") {
    const reason = params.get("reason") ?? "unknown";
    return { kind: "err", msg: `Couldn't connect Gmail: ${decodeURIComponent(reason)}` };
  }
  return null;
}

export function GmailSection({ accounts }: { accounts: GmailAccount[] }) {
  const router = useRouter();
  const params = useSearchParams();
  // Snapshot the banner from initial params; we never re-derive (cleared once below).
  const [initialBanner] = useState<Banner>(() => bannerFromParams(params));
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const banner: Banner = refreshError ? { kind: "err", msg: refreshError } : initialBanner;

  // Strip the OAuth callback params so a refresh doesn't re-show the success banner.
  useEffect(() => {
    if (!initialBanner) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("gmail");
    url.searchParams.delete("email");
    url.searchParams.delete("reason");
    window.history.replaceState(null, "", url.toString());
  }, [initialBanner]);

  function refreshAll() {
    setRefreshError(null);
    startRefresh(async () => {
      const r = await refreshGmailAccounts();
      if (!r.ok) setRefreshError("Refresh failed.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              <CardTitle>Gmail accounts</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Read-only. We only check the unread count of each inbox so you see new mail in the
              sidebar. No subjects, no bodies, no sending.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {accounts.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={refreshAll}
                disabled={refreshing}
                title="Refresh all"
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </Button>
            )}
            <a href="/api/gmail/connect/start">
              <Button size="sm" variant="secondary">
                <Plus className="h-3 w-3" />
                Connect Gmail
              </Button>
            </a>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {banner && (
          <div
            className={`rounded-[10px] border px-3 py-2 text-[12.5px] ${
              banner.kind === "ok"
                ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]"
                : "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
            }`}
          >
            {banner.msg}
          </div>
        )}

        {accounts.length === 0 && (
          <div className="rounded-[10px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 text-center text-[12.5px] text-[var(--color-text-muted)]">
            No Gmail accounts connected yet. Connect one and its unread count will show up in the
            sidebar.
          </div>
        )}

        {accounts.map((acc) => (
          <GmailAccountRow key={acc.id} account={acc} />
        ))}
      </CardContent>
    </Card>
  );
}

function GmailAccountRow({ account }: { account: GmailAccount }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(account.last_sync_error);
  const router = useRouter();

  function refresh() {
    setError(null);
    startTransition(async () => {
      const r = await refreshOneGmailAccount(account.id);
      if (!r.ok) setError(r.error ?? "Refresh failed.");
      router.refresh();
    });
  }

  function disconnect() {
    if (!confirm(`Disconnect ${account.email}?`)) return;
    startTransition(async () => {
      const r = await disconnectGmailAccount(account.id);
      if (!r.ok) setError(r.error ?? "Couldn't disconnect.");
      router.refresh();
    });
  }

  const lastSynced = account.last_synced_at
    ? new Date(account.last_synced_at).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "never";

  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)] transition-colors">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]">
          <Mail className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium truncate">{account.email}</span>
            <Badge tone={account.unread_count > 0 ? "accent" : "neutral"}>
              {account.unread_count} unread
            </Badge>
            {error && (
              <Badge tone="danger">
                <AlertCircle className="h-2.5 w-2.5 mr-0.5 inline" />
                error
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-[var(--color-text-subtle)] mt-0.5">
            Last synced {lastSynced}
            {error && <span className="text-[var(--color-danger)]"> — {error}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={refresh} disabled={pending} title="Refresh">
            <RefreshCw className={`h-3 w-3 ${pending ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={disconnect}
            disabled={pending}
            title="Disconnect"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
