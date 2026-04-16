import type { VercelRequest, VercelResponse } from "@vercel/node";

import { ConfigError } from "../lib/errors";
import { formatForVK, isBridgeMessage, telegramMessageWebUrl } from "../lib/format";
import { createRequestLogger } from "../lib/log";
import { summarizeTelegramUpdate } from "../lib/log-sanitize";
import { safeRetry } from "../lib/retry";
import { getTelegramWebhookSecret, isTelegramWebhookAuthorized } from "../lib/security";
import { sendToVK } from "../lib/vk";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const L = createRequestLogger("tg.webhook");
  const startedAt = Date.now();

  try {
    L.info("tg.http.request", {
      method: req.method,
      url: req.url,
      content_type: req.headers["content-type"],
      content_length: req.headers["content-length"],
      vercel_id: req.headers["x-vercel-id"],
      has_secret_token_header: Boolean(getTelegramWebhookSecret(req)),
      tg_webhook_secret_configured: Boolean(process.env.TG_WEBHOOK_SECRET)
    });

    if (req.method !== "POST") {
      L.warn("tg.http.method_not_allowed", { method: req.method });
      res.status(405).json({ ok: false });
      L.info("tg.http.response", { status: 405, kind: "method_not_allowed" });
      return;
    }

    if (!isTelegramWebhookAuthorized(req)) {
      L.warn("tg.webhook.unauthorized");
      res.status(401).json({ ok: false });
      L.info("tg.http.response", { status: 401, kind: "unauthorized" });
      return;
    }

    const update = req.body as any;
    L.info("tg.update.summary", { ...summarizeTelegramUpdate(update), duration_ms: Date.now() - startedAt });

    const message = update?.message;
    if (!message) {
      L.info("tg.update.ignored.no_message", { duration_ms: Date.now() - startedAt });
      res.status(200).json({ ok: true });
      L.info("tg.http.response", { status: 200, kind: "ignored_no_message" });
      return;
    }

    if (message.from?.is_bot) {
      L.info("tg.update.skipped.from_bot", { message_id: message?.message_id, duration_ms: Date.now() - startedAt });
      res.status(200).json({ ok: true });
      L.info("tg.http.response", { status: 200, kind: "skipped_from_bot" });
      return;
    }

    const text = message?.text;
    if (typeof text !== "string" || text.length === 0) {
      L.info("tg.update.ignored.non_text", { message_id: message?.message_id, duration_ms: Date.now() - startedAt });
      res.status(200).json({ ok: true });
      L.info("tg.http.response", { status: 200, kind: "ignored_non_text" });
      return;
    }

    if (isBridgeMessage(text)) {
      L.info("tg.update.skipped.bridge_marker", { message_id: message?.message_id, duration_ms: Date.now() - startedAt });
      res.status(200).json({ ok: true });
      L.info("tg.http.response", { status: 200, kind: "skipped_bridge" });
      return;
    }

    const from = message.from;
    const fullName = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim();
    const displayName =
      fullName ||
      (typeof from?.username === "string" && from.username.length > 0 ? `@${from.username}` : "Telegram");

    const profileUrl =
      typeof from?.username === "string" && from.username.length > 0
        ? `https://t.me/${from.username}`
        : typeof from?.id === "number"
          ? `tg://user?id=${from.id}`
          : "https://t.me/";

    const messageUrl = telegramMessageWebUrl({
      chatId: message.chat.id,
      messageId: message.message_id,
      chatUsername: typeof message.chat?.username === "string" ? message.chat.username : undefined
    });

    const embedSeed = `tg2vk:${message.message_id}:${message.chat?.id}`;
    const formatted = formatForVK({
      text,
      displayName,
      profileUrl,
      messageUrl,
      embedSeed
    });

    L.info("tg.relay.start", {
      message_id: message.message_id,
      chat_id: message?.chat?.id,
      outbound_text_len: formatted.length
    });

    await safeRetry(() => sendToVK(formatted, L), 3, L);

    L.info("tg.relay.sent_to_vk", {
      message_id: message.message_id,
      chat_id: message?.chat?.id,
      duration_ms: Date.now() - startedAt
    });

    res.status(200).json({ ok: true });
    L.info("tg.http.response", { status: 200, kind: "relay_ok", duration_ms: Date.now() - startedAt });
  } catch (err) {
    if (err instanceof ConfigError) {
      L.error("tg.config.missing_env", {
        duration_ms: Date.now() - startedAt,
        missing: err.missing,
        hint: "Add these in Vercel Project → Settings → Environment Variables for this environment (Production/Preview), then redeploy."
      });
      if (!res.headersSent) {
        res.status(503).json({ ok: false, error: "misconfigured" });
        L.info("tg.http.response", { status: 503, kind: "config_error" });
      }
      return;
    }

    L.error("tg.handler.unhandled", {
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8).join("\n") : undefined
    });
    if (!res.headersSent) {
      res.status(500).json({ ok: false });
      L.info("tg.http.response", { status: 500, kind: "handler_error" });
    }
  }
}
