import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseIngCsv } from "@/lib/finance/parsers/ing";
import { normalizeIban } from "@/lib/finance/iban";

/**
 * Phase 2: parse-only. No DB writes. The client uploads a CSV + chosen
 * account_id; we parse server-side and return the parsed rows for preview.
 * Phase 3 will add a sibling /persist route that writes to statements +
 * transactions.
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

  const csvIban = normalizeIban(result.iban);
  const accountIban = normalizeIban(account.iban);
  if (csvIban !== accountIban) {
    return NextResponse.json(
      {
        error: `This CSV is for a different IBAN (${csvIban}) than the selected account (${account.nickname} — ${accountIban}). Pick the matching account or upload a different file.`,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    iban: result.iban,
    period_start: result.period_start,
    period_end: result.period_end,
    filtered_count: result.filtered_count,
    transactions: result.transactions,
    filename: file.name,
  });
}
