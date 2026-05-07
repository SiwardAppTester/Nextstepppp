import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const MODEL = "claude-haiku-4-5-20251001";

const ResponseSchema = z.object({
  new_pockets: z.array(
    z.object({
      temp_id: z
        .string()
        .describe('Temporary id to reference in assignments, e.g. "new_1", "new_2".'),
      name: z.string().describe("Short pocket name in sentence case, 2-3 words max."),
      description: z
        .string()
        .describe(
          "ONE sentence describing what belongs in this pocket so future runs stay consistent."
        ),
      group: z
        .string()
        .describe(
          "Parent group this pocket belongs to. Reuse existing groups when possible — see 'Existing pocket groups' in the prompt. Examples: 'Bills & utilities', 'Property income', 'Taxes & fees'."
        ),
    })
  ),
  pocket_group_updates: z
    .array(
      z.object({
        pocket_id: z
          .string()
          .describe("Existing pocket id (uuid) to update the group for."),
        group: z.string(),
      })
    )
    .describe(
      "Group assignments for EXISTING pockets. Use this to fill in groups for pockets that don't have one yet (group_name=null in the prompt), or to correct an existing group. Empty array if nothing to update."
    ),
  assignments: z.array(
    z.object({
      transaction_id: z.string(),
      pocket_ref: z
        .string()
        .describe(
          'Either an existing pocket id (uuid) OR a temp_id from new_pockets, e.g. "new_1".'
        ),
      clean_counterparty: z.string(),
      is_recurring: z.boolean(),
      confidence: z.number().min(0).max(1),
    })
  ),
});

export type CategorizeResult = z.infer<typeof ResponseSchema>;

export type CategorizeInput = {
  account: { nickname: string; description: string | null };
  pockets: Array<{
    id: string;
    name: string;
    description: string | null;
    group_name: string | null;
  }>;
  transactions: Array<{
    id: string;
    txn_date: string;
    amount: number;
    direction: "in" | "out";
    raw_counterparty: string | null;
    counterparty_iban: string | null;
    description: string | null;
    bank_code: string | null;
  }>;
};

export async function categorizeTransactions(
  input: CategorizeInput
): Promise<CategorizeResult> {
  const result = await generateObject({
    model: anthropic(MODEL),
    schema: ResponseSchema,
    schemaName: "CategorizeResponse",
    prompt: buildPrompt(input),
  });
  return result.object;
}

function buildPrompt(input: CategorizeInput): string {
  const pocketsBlock =
    input.pockets.length > 0
      ? input.pockets
          .map((p) => {
            const group = p.group_name ? `[${p.group_name}]` : "[NO GROUP — please assign one]";
            return `- id=${p.id}: ${p.name} ${group}${p.description ? ` — ${p.description}` : ""}`;
          })
          .join("\n")
      : "(none yet — you're building this list from scratch as you categorize)";

  // Distinct existing groups, for the AI to reuse.
  const existingGroups = [
    ...new Set(input.pockets.map((p) => p.group_name).filter(Boolean) as string[]),
  ];
  const groupsBlock =
    existingGroups.length > 0
      ? existingGroups.map((g) => `- ${g}`).join("\n")
      : "(none yet — invent appropriate groups based on the data)";

  const txnsBlock = input.transactions
    .map((t) => {
      const sign = t.direction === "in" ? "+" : "-";
      const amt = Math.abs(t.amount).toFixed(2);
      return `id=${t.id} | ${t.txn_date} | ${sign}€${amt} | code=${t.bank_code ?? ""} | naam="${t.raw_counterparty ?? ""}" | tegen="${t.counterparty_iban ?? ""}" | mededelingen="${t.description ?? ""}"`;
    })
    .join("\n");

  return `You categorize Dutch bank transactions into "pockets" (spending/income buckets) for a personal finance app. Each pocket belongs to a parent "group" (a broader category) so the dashboard can show grouped breakdowns. Output structured JSON.

# Account context
Nickname: ${input.account.nickname}
Description: ${input.account.description ?? "(no description)"}

# Existing pockets — REUSE these whenever they fit
${pocketsBlock}

# Existing pocket groups — REUSE these whenever a new pocket fits an existing group
${groupsBlock}

# Suggested top-level groups (use these names if appropriate, but invent your own when none fit)
- Bills & utilities (water, electricity, internet, gas)
- Property income (rent received, property sales)
- Property expenses (maintenance, cleaning, repairs)
- Business income (consulting, sales, fees received)
- Business expenses (consultants, professional services, shipping)
- Taxes & fees (tax payments, bank fees, licenses)
- Loans (loan repayments, interest paid)
- Travel (flights, hotels, transport)
- Personal (groceries, dining, entertainment, health)
- Subscriptions (recurring digital services)
- Transfers (between own accounts)

# Transactions to categorize (${input.transactions.length} total)
${txnsBlock}

# Your task

For EACH transaction:
1. **Pick a pocket.** ALWAYS prefer an existing pocket. Only create a new one when no existing pocket genuinely fits.
2. **Clean counterparty name.** Extract the real merchant/person from the raw fields. The "naam" field often says "Trans.Reference: ..." — useless. Dig into "mededelingen" for the real name. Examples: "Albert Heijn", "Belastingdienst", "Booking.com", "Rene Westerburgen", "Water- en Energiebedrijf Bonaire".
3. **is_recurring** — true for rent, salary, subscriptions, recurring bills.
4. **confidence** — 0.0–1.0 for how sure you are.

# Pocket creation rules

When you create a new pocket:
- **Name:** short (2–3 words), human-readable, sentence case. Examples: "Utilities", "Rent received", "Property maintenance", "Bank fees".
- **Description:** ONE sentence saying what belongs here.
- **Group:** assign a parent group. Reuse from "Existing pocket groups" first; if none fit, pick from "Suggested top-level groups"; only invent a new group if neither works.
- **NO near-duplicate pockets.** If you've already created "Utilities" in this batch, don't also create "Bills" or "Energy" — they all go in "Utilities".
- **NO near-duplicate groups.** Don't create "Bills" if "Bills & utilities" exists — use the existing group.
- **Income split by source.** Use distinct pockets like "Rent received", "Salary", "Business income".

# Backfilling groups for existing pockets

For any existing pocket marked "[NO GROUP — please assign one]", include it in pocket_group_updates with a sensible group from "Existing pocket groups" or "Suggested top-level groups". This backfills missing groups without re-creating the pocket.

If an existing pocket already has a group that fits, leave it alone (don't include in pocket_group_updates).

# Pocket reference rule

In each assignment's "pocket_ref":
- For existing pockets, use the EXACT uuid shown above.
- For pockets you create, use the "temp_id" you gave it in new_pockets, e.g. "new_1".

Categorize all ${input.transactions.length} transactions. Don't skip any.`;
}
