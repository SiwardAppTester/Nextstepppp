import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseIngCsv } from "@/lib/finance/parsers/ing";
import { normalizeIban } from "@/lib/finance/iban";

/**
 * Phase 3: parse + persist. Re-parses the same CSV the client uploaded for
 * preview, validates IBAN match, inserts a statements row and all
 * transactions linked to it. If transactions insert fails, the just-created
 * statement is rolled back manually (Supabase JS client doesn't expose a
 * cross-table transaction).
 *
 * Pocket categorization comes in Phase 4 — for now `pocket` stays null.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const accountId = form.get("account_id");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing CSV file." }, { status: 400 });
  }
  if (typeof accountId !== "string" || !accountId) {
    return NextResponse.json({ error: "Missing account_id." }, { status: 400 });
  }

  const { data: account, error: accErr } = await supabase
    .from("bank_accounts")
    .select("id, iban, nickname")
    .eq("id", accountId)
    .single();
  if (accErr || !account) {
    return NextResponse.json({ error: "Bank account not found." }, { status: 404 });
  }

  const text = await file.text();
  const result = parseIngCsv(text);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (normalizeIban(result.iban) !== normalizeIban(account.iban)) {
    return NextResponse.json(
      {
        error: `This CSV is for a different IBAN than ${account.nickname}.`,
      },
      { status: 400 }
    );
  }

  // Duplicate guard: same account + same filename means the user is
  // re-uploading something already on file.
  const { data: existing } = await supabase
    .from("statements")
    .select("id")
    .eq("account_id", account.id)
    .eq("filename", file.name)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      {
        error: `"${file.name}" is already uploaded for this account. Delete the existing statement first if you want to re-upload.`,
      },
      { status: 409 }
    );
  }

  // Insert the statement first; we need its id to link transactions.
  const { data: statement, error: stmtErr } = await supabase
    .from("statements")
    .insert({
      user_id: user.id,
      account_id: account.id,
      filename: file.name,
      period_start: result.period_start,
      period_end: result.period_end,
      transaction_count: result.transactions.length,
    })
    .select("id")
    .single();
  if (stmtErr || !statement) {
    return NextResponse.json(
      { error: stmtErr?.message ?? "Couldn't create statement." },
      { status: 500 }
    );
  }

  const rows = result.transactions.map((t) => ({
    user_id: user.id,
    statement_id: statement.id,
    account_id: account.id,
    txn_date: t.txn_date,
    amount: t.amount,
    direction: t.direction,
    raw_counterparty: t.raw_counterparty,
    counterparty_iban: t.counterparty_iban,
    description: t.description,
    bank_code: t.bank_code,
    balance_after: t.balance_after,
  }));

  const { data: insertedTxns, error: txErr } = await supabase
    .from("transactions")
    .insert(rows)
    .select("id");
  if (txErr) {
    // Manual rollback: delete the orphan statement we just made.
    await supabase.from("statements").delete().eq("id", statement.id);
    return NextResponse.json(
      { error: `Couldn't insert transactions: ${txErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    statement_id: statement.id,
    transaction_count: result.transactions.length,
    transaction_ids: (insertedTxns ?? []).map((t) => t.id as string),
  });
}
