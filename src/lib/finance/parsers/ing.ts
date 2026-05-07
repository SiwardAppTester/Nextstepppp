/**
 * ING (Netherlands) CSV statement parser.
 *
 * Format: semicolon-delimited, every field quoted, comma decimals, YYYYMMDD dates.
 * Filters out international-transfer fee rows ("Transfer provisie") since the
 * user only does European transfers in normal months and these are noise.
 */

export type ParsedTxn = {
  txn_date: string;             // ISO date: YYYY-MM-DD
  raw_counterparty: string;     // column 2 (Naam / Omschrijving)
  account_iban: string;         // column 3 (your IBAN)
  counterparty_iban: string | null;  // column 4 (may be empty or non-IBAN)
  bank_code: string;            // column 5 (OV, GT, IW, BA, GM, IC, DV)
  direction: "in" | "out";
  amount: number;               // signed: negative = expense, positive = income
  mutatiesoort: string;         // column 8 (transaction type label)
  description: string;          // column 9 (Mededelingen — rich detail)
  balance_after: number | null; // column 10 (Saldo na mutatie)
};

export type ParseIngResult =
  | {
      ok: true;
      iban: string;
      period_start: string;
      period_end: string;
      transactions: ParsedTxn[];
      filtered_count: number;
    }
  | { ok: false; error: string };

const EXPECTED_HEADER = [
  "Datum",
  "Naam / Omschrijving",
  "Rekening",
  "Tegenrekening",
  "Code",
  "Af Bij",
  "Bedrag (EUR)",
  "Mutatiesoort",
  "Mededelingen",
  "Saldo na mutatie",
];

export function parseIngCsv(text: string): ParseIngResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: "CSV is empty or has no data rows." };
  }

  const header = parseCsvLine(lines[0]);
  for (let i = 0; i < EXPECTED_HEADER.length; i++) {
    if (header[i] !== EXPECTED_HEADER[i]) {
      return {
        ok: false,
        error: `Header doesn't match ING format. Expected "${EXPECTED_HEADER[i]}" at column ${i + 1}, got "${header[i] ?? ""}".`,
      };
    }
  }

  const txns: ParsedTxn[] = [];
  let filtered = 0;
  let detectedIban: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 10) continue;

    const [
      datum,
      naam,
      rekening,
      tegenrekening,
      code,
      afBij,
      bedrag,
      mutatiesoort,
      mededelingen,
      saldo,
    ] = fields;

    // Skip international-transfer fee rows (Diversen + "Transfer provisie").
    // Real Diversen rows like account-maintenance fees stay.
    if (mutatiesoort === "Diversen" && mededelingen.includes("Transfer provisie")) {
      filtered++;
      continue;
    }

    if (!detectedIban) detectedIban = rekening;

    const rawAmount = parseAmount(bedrag);
    if (rawAmount == null) continue;
    const direction: "in" | "out" = afBij === "Bij" ? "in" : "out";

    txns.push({
      txn_date: parseDate(datum),
      raw_counterparty: naam,
      account_iban: rekening,
      counterparty_iban: tegenrekening || null,
      bank_code: code,
      direction,
      amount: direction === "out" ? -rawAmount : rawAmount,
      mutatiesoort,
      description: mededelingen,
      balance_after: parseAmount(saldo),
    });
  }

  if (txns.length === 0) {
    return { ok: false, error: "No valid transactions found." };
  }
  if (!detectedIban) {
    return { ok: false, error: "Couldn't detect the account IBAN from the CSV." };
  }

  const dates = txns.map((t) => t.txn_date).sort();
  return {
    ok: true,
    iban: detectedIban,
    period_start: dates[0],
    period_end: dates[dates.length - 1],
    transactions: txns,
    filtered_count: filtered,
  };
}

/**
 * Splits one CSV line on `;`, respecting double-quoted fields and the
 * standard `""` escape for embedded quotes. ING never embeds newlines in
 * fields, so per-line splitting is safe.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    let field = "";
    if (line[i] === '"') {
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          field += line[i];
          i++;
        }
      }
    } else {
      while (i < line.length && line[i] !== ";") {
        field += line[i];
        i++;
      }
    }
    fields.push(field);
    if (line[i] === ";") i++;
  }
  return fields;
}

function parseDate(raw: string): string {
  if (!/^\d{8}$/.test(raw)) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  // Dutch format: `.` as thousand separator, `,` as decimal.
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
