"use client";

import { useState, useTransition } from "react";
import {
  Bell,
  Mail,
  Brain,
  Database,
  User,
  Palette,
  Landmark,
  User as UserIcon,
  Home as HomeIcon,
  Briefcase,
  Rocket,
  Dumbbell,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { BankAccount, Category, GmailAccount } from "@/lib/types";
import { formatIban } from "@/lib/finance/iban";
import { GmailSection } from "./gmail-section";
import {
  updateCategoryContext,
  sendTestReminder,
  updateMemory,
  deleteMemory,
  setAutoConfirm,
  addBankAccount,
  updateBankAccount,
  deleteBankAccount,
} from "./actions";

export type Memory = {
  id: string;
  content: string;
  importance: number;
  category_id: string | null;
  created_at: string;
};

const iconMap: Record<string, LucideIcon> = {
  User: UserIcon,
  Home: HomeIcon,
  Briefcase,
  Rocket,
  Dumbbell,
};

export function SettingsView({
  categories,
  memories,
  userEmail,
  autoConfirm,
  bankAccounts,
  gmailAccounts,
}: {
  categories: Category[];
  memories: Memory[];
  userEmail: string;
  autoConfirm: boolean;
  bankAccounts: BankAccount[];
  gmailAccounts: GmailAccount[];
}) {
  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar crumbs={[{ label: "Settings" }]} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[820px] space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                <CardTitle>Profile</CardTitle>
              </div>
              <CardDescription>How the Coach addresses you and where it sends notifications.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Name" value="Sief" />
              <Field label="Timezone" value="Europe/Amsterdam" />
              <Field label="Owner email" value={userEmail} hint="Only this email can sign in." />
              <Field label="Coach tone" value="Neutral" hint="Casual, direct, no lectures." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                <CardTitle>Coach behavior</CardTitle>
              </div>
              <CardDescription>
                When auto-confirm is on, the Coach acts immediately on captures (tasks, events,
                goals, context updates) and just tells you what it did. When off, it confirms first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AutoConfirmToggle initial={autoConfirm} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Palette className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                    <CardTitle>Categories</CardTitle>
                  </div>
                  <CardDescription className="mt-1">
                    Each gets a context blurb the Coach uses when relevant.
                  </CardDescription>
                </div>
                <Button size="sm" variant="secondary" disabled>
                  Add category
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {categories.length === 0 && (
                <div className="rounded-[10px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 text-center text-[12.5px] text-[var(--color-text-muted)]">
                  No categories yet. Default categories are seeded on first sign-in.
                </div>
              )}
              {categories.map((cat) => (
                <CategoryRow key={cat.id} cat={cat} />
              ))}
            </CardContent>
          </Card>

          <BankAccountsCard accounts={bankAccounts} />

          <GmailSection accounts={gmailAccounts} />

          <NotificationsCard />


          <MemoryBrowser memories={memories} />


          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                <CardTitle>Data</CardTitle>
              </div>
              <CardDescription>Export everything or wipe locally.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button size="sm" variant="secondary" disabled>Export JSON</Button>
              <Button size="sm" variant="danger" disabled>Reset workspace</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({ cat }: { cat: Category }) {
  const Icon = iconMap[cat.icon] ?? UserIcon;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cat.context ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateCategoryContext(cat.id, draft.trim());
      if (r?.error) {
        setError(r.error);
        return;
      }
      setEditing(false);
    });
  }

  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)] transition-colors">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
          style={{
            backgroundColor: `${cat.color}18`,
            borderColor: `${cat.color}55`,
            color: cat.color,
            boxShadow: `0 0 14px -4px ${cat.color}55`,
          }}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">{cat.name}</div>
          {!editing && (
            <div className="text-[11.5px] text-[var(--color-text-muted)] truncate">
              {cat.context || (
                <span className="italic text-[var(--color-text-subtle)]">No context yet — add one to help the Coach.</span>
              )}
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          <Pencil className="h-3 w-3" />
          {editing ? "Cancel" : "Edit"}
        </Button>
      </div>
      {editing && (
        <div className="border-t border-[var(--color-border)] p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`What's "${cat.name}" about? e.g. "SaaS for dentists, launching Q3."`}
            rows={3}
          />
          {error && <div className="mt-2 text-[12px] text-[var(--color-danger)]">{error}</div>}
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setDraft(cat.context ?? ""); setEditing(false); }}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save context"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)] mb-1.5">
        {label}
      </div>
      <Input value={value} readOnly />
      {hint && <div className="mt-1.5 text-[11px] text-[var(--color-text-subtle)]">{hint}</div>}
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  hint,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium">{title}</span>
          {badge && <Badge tone="accent">{badge}</Badge>}
        </div>
        <div className="text-[11.5px] text-[var(--color-text-muted)]">{hint}</div>
      </div>
      <button
        className="relative h-5 w-9 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] transition-all"
        disabled
      >
        <span className="absolute left-0.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-[var(--color-text-subtle)]" />
      </button>
    </div>
  );
}

function MemoryBrowser({ memories }: { memories: Memory[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              <CardTitle>Memory</CardTitle>
            </div>
            <CardDescription className="mt-1">
              What the Coach has saved about you. Edit content, change importance, or delete anything that's wrong.
            </CardDescription>
          </div>
          <Badge tone="neutral">{memories.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {memories.length === 0 && (
          <div className="rounded-[10px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 text-center">
            <div className="text-[13px] text-[var(--color-text-muted)] mb-1">No memories yet.</div>
            <div className="text-[11.5px] text-[var(--color-text-subtle)]">
              The Coach saves these automatically when you share preferences or patterns about yourself.
            </div>
          </div>
        )}
        {memories.map((m) => (
          <MemoryRow key={m.id} memory={m} />
        ))}
      </CardContent>
    </Card>
  );
}

function MemoryRow({ memory }: { memory: Memory }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memory.content);
  const [importance, setImportance] = useState(memory.importance);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateMemory(memory.id, content, importance);
      if (r?.error) {
        setError(r.error);
        return;
      }
      setEditing(false);
    });
  }

  function remove() {
    if (!confirm("Delete this memory? The Coach won't recall it any more.")) return;
    startTransition(async () => {
      const r = await deleteMemory(memory.id);
      if (r?.error) setError(r.error);
    });
  }

  const importanceLabels: Record<number, { label: string; tone: "danger" | "warning" | "neutral" | "success" | "accent" }> = {
    5: { label: "Critical", tone: "danger" },
    4: { label: "High", tone: "warning" },
    3: { label: "Useful", tone: "neutral" },
    2: { label: "Low", tone: "neutral" },
    1: { label: "Trivia", tone: "neutral" },
  };

  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)] transition-colors">
      <div className="px-3 py-2.5">
        {editing ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            autoFocus
          />
        ) : (
          <div className="text-[13px] leading-snug text-[var(--color-text)]">
            {memory.content}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {editing ? (
              <select
                value={importance}
                onChange={(e) => setImportance(Number(e.target.value))}
                className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[11.5px] focus:outline-none focus:border-[var(--color-border-accent)]"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    P{n} · {importanceLabels[n].label}
                  </option>
                ))}
              </select>
            ) : (
              <Badge tone={importanceLabels[memory.importance]?.tone ?? "neutral"}>
                P{memory.importance} · {importanceLabels[memory.importance]?.label ?? "—"}
              </Badge>
            )}
            <span className="text-[10.5px] text-[var(--color-text-subtle)]">
              {new Date(memory.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setContent(memory.content);
                    setImportance(memory.importance);
                    setEditing(false);
                    setError(null);
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={save} disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
        {error && <div className="mt-2 text-[12px] text-[var(--color-danger)]">{error}</div>}
      </div>
    </div>
  );
}

function NotificationsCard() {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  function onTest() {
    setFeedback(null);
    startTransition(async () => {
      const r = await sendTestReminder();
      if (r.ok) setFeedback({ ok: true, msg: `Sent to ${r.to}. Check your inbox (also spam).` });
      else setFeedback({ ok: false, msg: r.error ?? "Couldn't send test." });
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <CardTitle>Notifications</CardTitle>
        </div>
        <CardDescription>
          Reminders fire automatically every 5 minutes for tasks with a scheduled time. Email goes
          via Resend; Web Push lands in a follow-up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ToggleRow
          icon={Bell}
          title="Web Push"
          hint="Browser notifications. Requires permission."
          badge="Coming soon"
        />
        <div className="flex items-center gap-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]">
            <Mail className="h-3.5 w-3.5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium">Email reminders (Resend)</span>
              <Badge tone="success">Live</Badge>
            </div>
            <div className="text-[11.5px] text-[var(--color-text-muted)]">
              Sent to the address in <code className="text-[var(--color-text-muted)]">REMINDER_EMAIL</code> env var.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onTest} disabled={pending}>
            {pending ? "Sending…" : "Send test reminder"}
          </Button>
          {feedback && (
            <span
              className={`text-[12px] ${
                feedback.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
              }`}
            >
              {feedback.msg}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BankAccountsCard({ accounts }: { accounts: BankAccount[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Landmark className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              <CardTitle>Bank accounts</CardTitle>
            </div>
            <CardDescription className="mt-1">
              IBANs you upload statements from. The description helps the AI understand each account.
            </CardDescription>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "Add account"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && <AddBankAccountForm onDone={() => setAdding(false)} />}

        {accounts.length === 0 && !adding && (
          <div className="rounded-[10px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 text-center text-[12.5px] text-[var(--color-text-muted)]">
            No bank accounts yet. Add an IBAN to start tracking finances.
          </div>
        )}

        {accounts.map((acc) => (
          <BankAccountRow key={acc.id} account={acc} />
        ))}
      </CardContent>
    </Card>
  );
}

function AddBankAccountForm({ onDone }: { onDone: () => void }) {
  const [iban, setIban] = useState("");
  const [nickname, setNickname] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await addBankAccount({ iban, nickname, description });
      if (!r.ok) {
        setError(r.error ?? "Couldn't add account.");
        return;
      }
      onDone();
    });
  }

  return (
    <div className="rounded-[10px] border border-[var(--color-border-accent)] bg-[var(--color-surface-2)] p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)] mb-1.5">
            IBAN
          </div>
          <Input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="NL95 INGB 0674 8143 12"
            autoFocus
          />
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)] mb-1.5">
            Nickname
          </div>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Daily ING"
          />
        </div>
      </div>
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)] mb-1.5">
          Description
        </div>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this account for? E.g. 'Personal daily spending' or 'Rental income from my apartment'."
          rows={2}
        />
      </div>
      {error && <div className="text-[12px] text-[var(--color-danger)]">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={submit}
          disabled={pending || !iban.trim() || !nickname.trim()}
        >
          {pending ? "Saving…" : "Add account"}
        </Button>
      </div>
    </div>
  );
}

function BankAccountRow({ account }: { account: BankAccount }) {
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(account.nickname);
  const [description, setDescription] = useState(account.description ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateBankAccount(account.id, { nickname, description });
      if (!r.ok) {
        setError(r.error ?? "Couldn't save changes.");
        return;
      }
      setEditing(false);
    });
  }

  function remove() {
    if (
      !confirm(
        `Delete "${account.nickname}"? Any uploaded statements and transactions for this account go with it.`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteBankAccount(account.id);
      if (!r.ok) setError(r.error ?? "Couldn't delete.");
    });
  }

  function cancelEdit() {
    setNickname(account.nickname);
    setDescription(account.description ?? "");
    setEditing(false);
    setError(null);
  }

  return (
    <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)] transition-colors">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
          style={{
            backgroundColor: `${account.color}18`,
            borderColor: `${account.color}55`,
            color: account.color,
            boxShadow: `0 0 14px -4px ${account.color}55`,
          }}
        >
          <Landmark className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium">{account.nickname}</span>
            {account.bank_name && <Badge tone="neutral">{account.bank_name}</Badge>}
          </div>
          <div className="text-[11px] font-mono text-[var(--color-text-muted)] mt-0.5">
            {formatIban(account.iban)}
          </div>
          {!editing && account.description && (
            <div className="text-[11.5px] text-[var(--color-text-muted)] mt-1">
              {account.description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
            <Pencil className="h-3 w-3" />
            {editing ? "Cancel" : "Edit"}
          </Button>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="border-t border-[var(--color-border)] p-3 space-y-3">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)] mb-1.5">
              Nickname
            </div>
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)] mb-1.5">
              Description
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What's this account for?"
            />
          </div>
          {error && <div className="text-[12px] text-[var(--color-danger)]">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={cancelEdit} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AutoConfirmToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // optimistic
    startTransition(async () => {
      const res = await setAutoConfirm(next);
      if (!res.ok) setOn(!next); // revert on failure
    });
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">Auto-confirm</div>
        <div className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">
          {on
            ? "Coach acts immediately on captures and tells you what it did."
            : "Coach asks before creating or changing things."}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        disabled={pending}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
          on
            ? "bg-[var(--color-accent)] border-[var(--color-accent)]"
            : "bg-[var(--color-surface-2)] border-[var(--color-border)]"
        } ${pending ? "opacity-60" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
