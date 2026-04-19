import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const flags = new Set();
  const kv = new Map();
  for (const a of argv) {
    if (a === "--info") flags.add("info");
    else if (a === "--drop-pending-updates") flags.add("drop_pending_updates");
    else if (a.startsWith("--url=")) kv.set("url", a.slice("--url=".length));
    else if (a.startsWith("--secret-token=")) kv.set("secret_token", a.slice("--secret-token=".length));
  }
  return { flags, kv };
}

function loadDotEnvFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;

    const key = m[1];
    if (process.env[key] && String(process.env[key]).trim() !== "") continue;

    let val = m[2] ?? "";
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    process.env[key] = val;
  }
}

async function tgApi(method, body) {
  const token = process.env.TG_TOKEN;
  if (!token || token.trim() === "") {
    throw new Error("Missing TG_TOKEN");
  }

  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify(body ?? {})
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Telegram ${method}: invalid JSON (HTTP ${resp.status}): ${text.slice(0, 300)}`);
  }

  if (!json?.ok) {
    const desc = json?.description ? String(json.description) : text.slice(0, 300);
    throw new Error(`Telegram ${method} failed (HTTP ${resp.status}): ${desc}`);
  }

  return json;
}

function usage() {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      "  npm run tg:set-webhook",
      "",
      "Env:",
      "  TG_TOKEN                 (required)",
      "  TG_WEBHOOK_URL           (required unless --url=...)",
      "  TG_WEBHOOK_SECRET        (optional; sets secret_token)",
      "",
      "Flags:",
      "  --url=https://.../api/telegram",
      "  --secret-token=...       (optional override)",
      "  --drop-pending-updates   (optional)",
      "  --info                   (print getWebhookInfo and exit)",
      "",
      "Notes:",
      "  - Loads ./.env.local automatically if present (set TG_LOAD_DOTENV=0 to disable).",
      "  - allowed_updates is restricted to [message] for this bridge."
    ].join("\n")
  );
}

const { flags, kv } = parseArgs(process.argv.slice(2));

if (flags.has("info")) {
  try {
    if (process.env.TG_LOAD_DOTENV !== "0") {
      loadDotEnvFile(path.join(repoRoot, ".env.local"));
    }

    const info = await tgApi("getWebhookInfo", {});
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(info.result ?? info, null, 2));
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  usage();
  process.exit(0);
}

try {
  if (process.env.TG_LOAD_DOTENV !== "0") {
    loadDotEnvFile(path.join(repoRoot, ".env.local"));
  }

  const url = (kv.get("url") ?? process.env.TG_WEBHOOK_URL ?? "").trim();
  const secretToken = (kv.get("secret_token") ?? process.env.TG_WEBHOOK_SECRET ?? "").trim();

  if (!url) {
    usage();
    process.exit(1);
  }

  const payload = {
    url,
    allowed_updates: ["message"],
    ...(secretToken ? { secret_token: secretToken } : {}),
    ...(flags.has("drop_pending_updates") ? { drop_pending_updates: true } : {})
  };

  const set = await tgApi("setWebhook", payload);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(set.result ?? set, null, 2));

  const info = await tgApi("getWebhookInfo", {});
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(info.result ?? info, null, 2));

  process.exit(0);
} catch (e) {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  usage();
  process.exit(1);
}
