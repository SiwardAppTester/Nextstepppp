"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeIban } from "@/lib/finance/iban";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function deleteStatement(id: string) {
  const { supabase } = await requireUser();
  // The transactions FK is `on delete cascade`, so the rows go with it.
  const { error } = await supabase.from("statements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/finance");
  return { ok: true };
}

export async function getStatementTransactionIds(statementId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("statement_id", statementId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, ids: (data ?? []).map((t) => t.id as string) };
}

export async function addRentalCheck(input: {
  account_id: string;
  name: string;
  expected_amount: number;
  counterparty_iban: string;
  start_date: string;
  notes?: string;
}) {
  const { supabase, user } = await requireUser();

  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Name can't be empty." };
  if (!Number.isFinite(input.expected_amount) || input.expected_amount <= 0) {
    return { ok: false as const, error: "Expected amount must be greater than zero." };
  }
  const iban = normalizeIban(input.counterparty_iban);
  if (!iban) return { ok: false as const, error: "Counterparty IBAN is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) {
    return { ok: false as const, error: "Start date is required (YYYY-MM-DD)." };
  }

  const { error } = await supabase.from("rental_checks").insert({
    user_id: user.id,
    account_id: input.account_id,
    name,
    expected_amount: input.expected_amount,
    counterparty_iban: iban,
    start_date: input.start_date,
    notes: input.notes?.trim() || null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/finance/${input.account_id}`);
  return { ok: true as const };
}

export async function updateRentalCheck(
  id: string,
  patch: {
    name?: string;
    expected_amount?: number;
    counterparty_iban?: string;
    start_date?: string;
    notes?: string | null;
    is_active?: boolean;
  }
) {
  const { supabase } = await requireUser();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) return { ok: false as const, error: "Name can't be empty." };
    update.name = trimmed;
  }
  if (patch.expected_amount !== undefined) {
    if (!Number.isFinite(patch.expected_amount) || patch.expected_amount <= 0) {
      return { ok: false as const, error: "Expected amount must be greater than zero." };
    }
    update.expected_amount = patch.expected_amount;
  }
  if (patch.counterparty_iban !== undefined) {
    const iban = normalizeIban(patch.counterparty_iban);
    if (!iban) return { ok: false as const, error: "Counterparty IBAN is required." };
    update.counterparty_iban = iban;
  }
  if (patch.start_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.start_date)) {
      return { ok: false as const, error: "Start date must be YYYY-MM-DD." };
    }
    update.start_date = patch.start_date;
  }
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;
  if (patch.is_active !== undefined) update.is_active = patch.is_active;
  if (Object.keys(update).length === 0) {
    return { ok: false as const, error: "Nothing to update." };
  }

  const { data, error } = await supabase
    .from("rental_checks")
    .update(update)
    .eq("id", id)
    .select("account_id")
    .single();
  if (error) return { ok: false as const, error: error.message };
  if (data?.account_id) revalidatePath(`/finance/${data.account_id}`);
  return { ok: true as const };
}

export async function deleteRentalCheck(id: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("rental_checks")
    .delete()
    .eq("id", id)
    .select("account_id")
    .single();
  if (error) return { ok: false as const, error: error.message };
  if (data?.account_id) revalidatePath(`/finance/${data.account_id}`);
  return { ok: true as const };
}
