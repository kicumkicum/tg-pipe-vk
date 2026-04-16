import type { VercelRequest, VercelResponse } from "@vercel/node";

import { formatForTelegram, isBridgeMessage } from "../lib/format";
import { log } from "../lib/log";
import { safeRetry } from "../lib/retry";
import { isVkCallbackAuthorized } from "../lib/security";
import { sendToTelegram } from "../lib/telegram";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return;
  }

  const event = req.body as any;

  if (!isVkCallbackAuthorized(event)) {
    log("warn", "vk.callback.unauthorized");
    res.status(401).send("unauthorized");
    return;
  }

  if (event?.type === "confirmation") {
    log("info", "vk.callback.confirmation");
    res.status(200).send(process.env.VK_CONFIRMATION ?? "");
    return;
  }

  if (event?.type !== "message_new") {
    log("info", "vk.callback.ignored", { type: event?.type, duration_ms: Date.now() - startedAt });
    res.status(200).send("ok");
    return;
  }

  const message = event?.object?.message ?? event?.object;
  const text = message?.text;
  if (typeof text !== "string" || text.length === 0) {
    log("info", "vk.message.ignored.non_text", {
      message_id: message?.id ?? message?.conversation_message_id,
      duration_ms: Date.now() - startedAt
    });
    res.status(200).send("ok");
    return;
  }

  if (isBridgeMessage(text)) {
    log("info", "vk.message.skipped.bridge_marker", {
      message_id: message?.id ?? message?.conversation_message_id,
      duration_ms: Date.now() - startedAt
    });
    res.status(200).send("ok");
    return;
  }

  const formatted = formatForTelegram({
    text,
    fromId: message?.from_id ?? "unknown",
    messageId: message?.id ?? message?.conversation_message_id ?? "unknown"
  });

  try {
    await safeRetry(() => sendToTelegram(formatted));
    log("info", "vk.relay.sent_to_tg", {
      message_id: message?.id ?? message?.conversation_message_id,
      peer_id: message?.peer_id,
      from_id: message?.from_id,
      duration_ms: Date.now() - startedAt
    });
  } catch (err) {
    log("error", "vk.relay.failed_to_tg", {
      message_id: message?.id ?? message?.conversation_message_id,
      peer_id: message?.peer_id,
      from_id: message?.from_id,
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err)
    });
    throw err;
  }

  res.status(200).send("ok");
}

