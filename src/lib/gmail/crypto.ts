import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// AES-256-GCM. Format: "<iv_b64>.<authTag_b64>.<ciphertext_b64>" — three
// dot-separated base64 chunks. The key is 32 bytes; we accept either a 64-char
// hex string (recommended; produced by `openssl rand -hex 32`) or a 32-byte
// base64 string in GMAIL_TOKEN_ENCRYPTION_KEY.

function loadKey(): Buffer {
  const raw = process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not set");
  const hex = /^[0-9a-fA-F]+$/.test(raw) && raw.length === 64;
  const buf = hex ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "GMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (use `openssl rand -hex 32`)"
    );
  }
  return buf;
}

export function encrypt(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(12); // 96-bit IV is the standard for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const key = loadKey();
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Malformed encrypted payload");
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
