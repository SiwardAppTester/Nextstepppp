/**
 * IBAN helpers for Dutch bank accounts.
 * v1 only validates NL IBANs — extending to other countries means relaxing
 * the regex and adding their lengths to a country-length table.
 */

const NL_BANK_CODES: Record<string, string> = {
  INGB: "ING",
  ABNA: "ABN AMRO",
  RABO: "Rabobank",
  BUNQ: "Bunq",
  NTSB: "N26",
  TRIO: "Triodos",
  SNSB: "SNS",
  ASNB: "ASN",
  KNAB: "Knab",
  RBRB: "RegioBank",
  REVO: "Revolut",
};

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})/g, "$1 ").trim();
}

export type IbanValidation =
  | { ok: true; iban: string }
  | { ok: false; error: string };

export function validateIban(raw: string): IbanValidation {
  const iban = normalizeIban(raw);
  if (!/^NL\d{2}[A-Z]{4}\d{10}$/.test(iban)) {
    return {
      ok: false,
      error: "Expected a Dutch IBAN: NL + 2 digits + 4 letters + 10 digits.",
    };
  }
  // mod-97 check: rotate first 4 chars to the end, map letters A-Z → 10-35,
  // then the resulting numeric string must equal 1 mod 97.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let numeric = "";
  for (const ch of rearranged) {
    if (ch >= "A" && ch <= "Z") numeric += (ch.charCodeAt(0) - 55).toString();
    else numeric += ch;
  }
  // Streaming modulo so we don't overflow on the long numeric string.
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  if (remainder !== 1) {
    return { ok: false, error: "Checksum failed — double-check the IBAN." };
  }
  return { ok: true, iban };
}

export function parseBankFromIban(iban: string): string | null {
  const clean = normalizeIban(iban);
  if (clean.length < 8) return null;
  return NL_BANK_CODES[clean.slice(4, 8)] ?? null;
}

const ACCOUNT_PALETTE = [
  "#4DA8FF",
  "#00D4B8",
  "#FFB84D",
  "#B084FF",
  "#FF6B9D",
  "#7AE582",
];

export function pickColorForIban(iban: string): string {
  let hash = 0;
  for (const ch of iban) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return ACCOUNT_PALETTE[Math.abs(hash) % ACCOUNT_PALETTE.length];
}
