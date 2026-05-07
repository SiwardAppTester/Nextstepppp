import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { categorizeTransactions } from "@/lib/finance/ai/categorize";

export const maxDuration = 60;

const POCKET_PALETTE = [
  "#4DA8FF",
  "#00D4B8",
  "#FFB84D",
  "#B084FF",
  "#FF6B9D",
  "#7AE582",
  "#F2545B",
  "#7C82FF",
  "#FF8E4D",
  "#5EEAD4",
  "#FCD34D",
  "#A78BFA",
];

function pickPocketColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return POCKET_PALETTE[Math.abs(hash) % POCKET_PALETTE.length];
}

/**
 * Auto-fires after a successful save, and on demand from the "Re-categorize"
 * button. Re-runs every time over ALL transactions in the statement (not
 * just uncategorized ones) so the user can refine pockets and re-classify.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    statement_id?: string;
    transaction_ids?: string[];
  };
  if (!body.statement_id) {
    return NextResponse.json({ error: "Missing statement_id." }, { status: 400 });
  }
  if (!Array.isArray(body.transaction_ids) || body.transaction_ids.length === 0) {
    return NextResponse.json(
      { error: "Missing transaction_ids — categorize is now batched." },
      { status: 400 }
    );
  }

  const { data: statement } = await supabase
    .from("statements")
    .select("id, account_id")
    .eq("id", body.statement_id)
    .single();
  if (!statement) {
    return NextResponse.json({ error: "Statement not found." }, { status: 404 });
  }

  const { data: account } = await supabase
    .from("bank_accounts")
    .select("nickname, description")
    .eq("id", statement.account_id)
    .single();
  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const { data: txns } = await supabase
    .from("transactions")
    .select(
      "id, txn_date, amount, direction, raw_counterparty, counterparty_iban, description, bank_code"
    )
    .eq("statement_id", body.statement_id)
    .in("id", body.transaction_ids);
  if (!txns || txns.length === 0) {
    return NextResponse.json({ assigned: 0, new_pocket_count: 0, skipped: 0 });
  }

  const { data: pockets } = await supabase
    .from("finance_pockets")
    .select("id, name, description, group_name")
    .eq("is_archived", false);

  let result;
  try {
    result = await categorizeTransactions({
      account: { nickname: account.nickname, description: account.description },
      pockets: (pockets ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        description: (p.description as string | null) ?? null,
        group_name: (p.group_name as string | null) ?? null,
      })),
      transactions: txns.map((t) => ({
        id: t.id as string,
        txn_date: t.txn_date as string,
        amount: Number(t.amount),
        direction: t.direction as "in" | "out",
        raw_counterparty: t.raw_counterparty as string | null,
        counterparty_iban: t.counterparty_iban as string | null,
        description: t.description as string | null,
        bank_code: t.bank_code as string | null,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI categorization failed." },
      { status: 502 }
    );
  }

  // Case-insensitive dedup lookup. Protects against the AI inventing a new
  // pocket whose name (case-insensitively) already exists, AND against
  // parallel batches racing on the same fresh pocket — the second batch's
  // insert hits the prior batch's row via this lookup before trying again.
  const byLowerName = new Map<string, string>();
  for (const p of pockets ?? []) {
    byLowerName.set((p.name as string).toLowerCase(), p.id as string);
  }

  const tempToReal: Record<string, string> = {};
  let newlyCreated = 0;
  for (const p of result.new_pockets) {
    const key = p.name.toLowerCase();
    const existingId = byLowerName.get(key);
    if (existingId) {
      tempToReal[p.temp_id] = existingId;
      continue;
    }
    const { data: created, error } = await supabase
      .from("finance_pockets")
      .insert({
        user_id: user.id,
        name: p.name,
        description: p.description,
        color: pickPocketColor(p.name),
        group_name: p.group,
      })
      .select("id")
      .single();
    if (error || !created) {
      // Concurrent insert race: re-fetch by name and use whatever's there.
      const { data: existing } = await supabase
        .from("finance_pockets")
        .select("id")
        .eq("is_archived", false)
        .ilike("name", p.name)
        .maybeSingle();
      if (existing) {
        tempToReal[p.temp_id] = existing.id as string;
        byLowerName.set(key, existing.id as string);
        continue;
      }
      return NextResponse.json(
        { error: `Couldn't create pocket "${p.name}": ${error?.message}` },
        { status: 500 }
      );
    }
    tempToReal[p.temp_id] = created.id as string;
    byLowerName.set(key, created.id as string);
    newlyCreated++;
  }

  const validPocketIds = new Set<string>(byLowerName.values());

  // Apply pocket_group_updates: backfill group_name on existing pockets the
  // AI flagged. Run in parallel; ignore failures (last-write-wins is fine for
  // groups). Only target ids that actually exist to dodge typos.
  if (result.pocket_group_updates && result.pocket_group_updates.length > 0) {
    await Promise.all(
      result.pocket_group_updates
        .filter((u) => validPocketIds.has(u.pocket_id))
        .map((u) =>
          supabase
            .from("finance_pockets")
            .update({ group_name: u.group })
            .eq("id", u.pocket_id)
        )
    );
  }

  // Run all transaction updates in parallel.
  const updateResults = await Promise.all(
    result.assignments.map(async (a) => {
      const pocketId = tempToReal[a.pocket_ref] ?? a.pocket_ref;
      if (!validPocketIds.has(pocketId)) return { ok: false };
      const { error } = await supabase
        .from("transactions")
        .update({
          pocket_id: pocketId,
          clean_counterparty: a.clean_counterparty,
          is_recurring: a.is_recurring,
          ai_confidence: a.confidence,
        })
        .eq("id", a.transaction_id);
      return { ok: !error };
    })
  );

  const assigned = updateResults.filter((r) => r.ok).length;
  const skipped = updateResults.length - assigned;

  return NextResponse.json({
    assigned,
    skipped,
    new_pocket_count: newlyCreated,
  });
}
