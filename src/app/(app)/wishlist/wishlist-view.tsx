"use client";

import { useState, useTransition } from "react";
import {
  Heart,
  ExternalLink,
  ShoppingBag,
  Plus,
  Trash2,
  Check,
  RotateCcw,
  Pencil,
  ChevronDown,
} from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { WishlistItem } from "@/lib/types";
import {
  addWishlistItem,
  updateWishlistItem,
  setWishlistStatus,
  deleteWishlistItem,
} from "./actions";

export function WishlistView({ items }: { items: WishlistItem[] }) {
  const [adding, setAdding] = useState(false);
  const open = items.filter((i) => i.status === "open");
  const bought = items.filter((i) => i.status === "bought");
  const totalPrice = open.reduce((sum, i) => sum + (i.price ?? 0), 0);
  const itemsWithoutPrice = open.filter((i) => i.price === null).length;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar crumbs={[{ label: "Wishlist" }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[680px] space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight">
                <Heart className="h-4 w-4 text-[var(--color-accent)]" strokeWidth={2.2} />
                Wishlist
                {open.length > 0 && <Badge tone="neutral">{open.length}</Badge>}
              </h1>
              <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                {open.length === 0 ? (
                  "Things you want to buy later. Add from the chat or here."
                ) : (
                  <>
                    <span className="font-semibold tabular-nums text-[var(--color-text)]">
                      {formatEur(totalPrice)}
                    </span>
                    <span> total across {open.length} item{open.length === 1 ? "" : "s"}</span>
                    {itemsWithoutPrice > 0 && (
                      <span className="text-[var(--color-text-subtle)]">
                        {" · "}
                        {itemsWithoutPrice} without price
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant={adding ? "secondary" : "primary"}
              onClick={() => setAdding((v) => !v)}
            >
              <Plus className="h-3.5 w-3.5" />
              {adding ? "Close" : "Add item"}
            </Button>
          </div>

          {adding && <AddItemForm onDone={() => setAdding(false)} />}

          {open.length === 0 && !adding ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {open.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          )}

          {bought.length > 0 && <BoughtSection items={bought} />}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[14px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-6 py-14 text-center">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]"
        aria-hidden
      >
        <Heart
          className="h-5 w-5 text-[var(--color-text-subtle)]"
          strokeWidth={1.6}
        />
      </div>
      <div className="mt-4 text-[13px] font-medium">Nothing on the wishlist yet</div>
      <div className="mt-1 text-[11.5px] text-[var(--color-text-subtle)]">
        Tell the chat &quot;I want this&quot; with a URL, or click <span className="font-medium">Add item</span>.
      </div>
    </div>
  );
}

function AddItemForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    let priceNum: number | null = null;
    if (price.trim()) {
      const n = Number(price.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        setError("Price isn't a valid number.");
        return;
      }
      priceNum = n;
    }
    startTransition(async () => {
      const r = await addWishlistItem({
        title,
        url: url || undefined,
        price: priceNum,
        notes: notes || undefined,
      });
      if (!r.ok) {
        setError(r.error ?? "Couldn't add.");
        return;
      }
      setTitle("");
      setUrl("");
      setPrice("");
      setNotes("");
      onDone();
    });
  }

  return (
    <div className="rounded-[12px] border border-[var(--color-border-accent)] bg-[var(--color-surface)] p-4 shadow-sm space-y-3">
      <div>
        <FieldLabel>What do you want?</FieldLabel>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="MacBook Pro 16-inch"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
        <div>
          <FieldLabel>URL (optional)</FieldLabel>
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div>
          <FieldLabel>Price € (optional)</FieldLabel>
          <Input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="2499"
          />
        </div>
      </div>
      <div>
        <FieldLabel>Notes (optional)</FieldLabel>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Why you want it, color, size, etc."
        />
      </div>
      {error && <div className="text-[12px] text-[var(--color-danger)]">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={submit}
          disabled={pending || !title.trim()}
        >
          {pending ? "Adding…" : "Add to wishlist"}
        </Button>
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: WishlistItem }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function markBought() {
    setError(null);
    startTransition(async () => {
      const r = await setWishlistStatus(item.id, "bought");
      if (!r.ok) setError(r.error ?? "Couldn't update.");
    });
  }

  function remove() {
    if (!confirm(`Delete "${item.title}"?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteWishlistItem(item.id);
      if (!r.ok) setError(r.error ?? "Couldn't delete.");
    });
  }

  if (editing) {
    return <EditItemCard item={item} onClose={() => setEditing(false)} />;
  }

  return (
    <div className="group rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[var(--color-border-strong)]">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold tracking-tight truncate">
              {item.title}
            </span>
            {item.price !== null ? (
              <Badge tone="accent">{formatEur(item.price)}</Badge>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="No price tracked yet — click to add"
                className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-[var(--color-warning)]/50 bg-[var(--color-warning)]/5 px-2 py-0.5 text-[10.5px] font-medium text-[var(--color-warning)] transition-colors hover:bg-[var(--color-warning)]/10"
              >
                + Add price
              </button>
            )}
          </div>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex max-w-full items-center gap-1.5 text-[11.5px] text-[var(--color-accent)] hover:underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{prettyUrl(item.url)}</span>
            </a>
          )}
          {item.notes && (
            <div className="text-[11.5px] text-[var(--color-text-muted)] line-clamp-2">
              {item.notes}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-0.5">
            <IconButton
              label="Edit"
              onClick={() => setEditing(true)}
              disabled={pending}
            >
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Delete" onClick={remove} disabled={pending}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
          <Button size="sm" variant="outline" onClick={markBought} disabled={pending}>
            <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
            Bought
          </Button>
        </div>
      </div>
      {error && (
        <div className="mt-2 text-[11.5px] text-[var(--color-danger)]">{error}</div>
      )}
    </div>
  );
}

function EditItemCard({ item, onClose }: { item: WishlistItem; onClose: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url ?? "");
  const [price, setPrice] = useState(item.price !== null ? String(item.price) : "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    let priceNum: number | null = null;
    if (price.trim()) {
      const n = Number(price.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        setError("Price isn't a valid number.");
        return;
      }
      priceNum = n;
    }
    startTransition(async () => {
      const r = await updateWishlistItem(item.id, {
        title,
        url: url.trim() || null,
        price: priceNum,
        notes: notes.trim() || null,
      });
      if (!r.ok) {
        setError(r.error ?? "Couldn't save.");
        return;
      }
      onClose();
    });
  }

  return (
    <div className="rounded-[12px] border border-[var(--color-border-accent)] bg-[var(--color-surface)] p-4 shadow-sm space-y-3">
      <div>
        <FieldLabel>Title</FieldLabel>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
        <div>
          <FieldLabel>URL</FieldLabel>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} type="url" />
        </div>
        <div>
          <FieldLabel>Price €</FieldLabel>
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
          />
        </div>
      </div>
      <div>
        <FieldLabel>Notes</FieldLabel>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      {error && <div className="text-[12px] text-[var(--color-danger)]">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={save}
          disabled={pending || !title.trim()}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function BoughtSection({ items }: { items: WishlistItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 border-t border-[var(--color-border)] pt-4 text-left text-[12.5px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
      >
        <ShoppingBag className="h-3.5 w-3.5" />
        <span className="font-medium">Bought</span>
        <Badge tone="neutral">{items.length}</Badge>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-2">
          {items.map((item) => (
            <BoughtCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function BoughtCard({ item }: { item: WishlistItem }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const boughtDate = item.bought_at
    ? new Date(item.bought_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  function unmark() {
    setError(null);
    startTransition(async () => {
      const r = await setWishlistStatus(item.id, "open");
      if (!r.ok) setError(r.error ?? "Couldn't update.");
    });
  }

  function remove() {
    if (!confirm(`Delete "${item.title}"?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteWishlistItem(item.id);
      if (!r.ok) setError(r.error ?? "Couldn't delete.");
    });
  }

  return (
    <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[var(--color-border-strong)]">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold tracking-tight text-[var(--color-text-muted)] line-through truncate">
              {item.title}
            </span>
            {item.price !== null && <Badge tone="neutral">{formatEur(item.price)}</Badge>}
            {boughtDate && (
              <span className="text-[10.5px] text-[var(--color-text-subtle)]">
                Bought {boughtDate}
              </span>
            )}
          </div>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 text-[11.5px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{prettyUrl(item.url)}</span>
            </a>
          )}
          {item.notes && (
            <div className="text-[11.5px] text-[var(--color-text-subtle)] line-clamp-2">
              {item.notes}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <IconButton label="Delete" onClick={remove} disabled={pending}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
          <Button size="sm" variant="outline" onClick={unmark} disabled={pending}>
            <RotateCcw className="h-3.5 w-3.5" />
            Restore
          </Button>
        </div>
      </div>
      {error && (
        <div className="mt-2 text-[11.5px] text-[var(--color-danger)]">{error}</div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
      {children}
    </div>
  );
}

function prettyUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return raw;
  }
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}
