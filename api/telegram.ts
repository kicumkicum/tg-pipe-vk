import type { VercelRequest, VercelResponse } from "@vercel/node";

import { formatForVK, isBridgeMessage } from "../lib/format";
import { log } from "../lib/log";
import { safeRetry } from "../lib/retry";
import { isTelegramWebhookAuthorized } from "../lib/security";
import { sendToVK } from "../lib/vk";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  if (req.method !== "POST") {
    res.status(405).json({ ok: false });
    return;
  }

  if (!isTelegramWebhookAuthorized(req)) {
    log("warn", "tg.webhook.unauthorized");
    res.status(401).json({ ok: false });
    return;
  }

  const update = req.body as any;
  const message = update?.message;
  if (!message) {
    log("info", "tg.update.ignored.no_message", { duration_ms: Date.now() - startedAt });
    res.status(200).json({ ok: true });
    return;
  }

  const text = message?.text;
  if (typeof text !== "string" || text.length === 0) {
    log("info", "tg.update.ignored.non_text", { message_id: message?.message_id, duration_ms: Date.now() - startedAt });
    res.status(200).json({ ok: true });
    return;
  }

  if (isBridgeMessage(text)) {
    log("info", "tg.update.skipped.bridge_marker", { message_id: message?.message_id, duration_ms: Date.now() - startedAt });
    res.status(200).json({ ok: true });
    return;
  }

  const username =
    typeof message?.from?.username === "string"
      ? message.from.username
      : [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ") || undefined;

  const formatted = formatForVK({
    text,
    username,
    messageId: message.message_id
  });

  try {
    await safeRetry(() => sendToVK(formatted));
    log("info", "tg.relay.sent_to_vk", {
      message_id: message.message_id,
      chat_id: message?.chat?.id,
      duration_ms: Date.now() - startedAt
    });
  } catch (err) {
    log("error", "tg.relay.failed_to_vk", {
      message_id: message.message_id,
      chat_id: message?.chat?.id,
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err)
    });
    throw err;
  }

  res.status(200).json({ ok: true });
}

