#!/usr/bin/env node
/**
 * One-time Telegram webhook registration.
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .env.local,
 * then tells Telegram to POST every update to your deployed webhook URL.
 *
 * Usage:
 *   node scripts/register-telegram-webhook.mjs https://nextsteppp.com
 *   node scripts/register-telegram-webhook.mjs https://nextsteppp.com --info
 *   node scripts/register-telegram-webhook.mjs --delete
 *
 * The trailing path /api/telegram/webhook is appended automatically.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(file) {
  try {
    const raw = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      if (process.env[k] === undefined) {
        process.env[k] = v.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env.local optional — env may already be set in shell
  }
}

loadEnv(".env.local");

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env.local");
  process.exit(1);
}
if (!secret) {
  console.error("Missing TELEGRAM_WEBHOOK_SECRET in .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const isDelete = args.includes("--delete");
const isInfo = args.includes("--info");
const baseUrl = args.find((a) => a.startsWith("http"));

const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function main() {
  if (isInfo) {
    const res = await fetch(api("getWebhookInfo"));
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  if (isDelete) {
    const res = await fetch(api("deleteWebhook"));
    const json = await res.json();
    console.log("deleteWebhook:", json);
    return;
  }

  if (!baseUrl) {
    console.error(
      "Usage: node scripts/register-telegram-webhook.mjs https://your-domain.com"
    );
    process.exit(1);
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  const res = await fetch(api("setWebhook"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      // Only the update types we handle. Drops noisy event types.
      allowed_updates: ["message"],
      // Drop any backlog from before this registration.
      drop_pending_updates: true,
    }),
  });
  const json = await res.json();
  console.log("setWebhook ->", url);
  console.log(JSON.stringify(json, null, 2));
  if (!json.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
