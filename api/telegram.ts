import type { VercelRequest, VercelResponse } from "@vercel/node";

import { formatForVK, isBridgeMessage } from "../lib/format";
import { safeRetry } from "../lib/retry";
import { isTelegramWebhookAuthorized } from "../lib/security";
import { sendToVK } from "../lib/vk";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false });
    return;
  }

  if (!isTelegramWebhookAuthorized(req)) {
    res.status(401).json({ ok: false });
    return;
  }

  const update = req.body as any;
  const message = update?.message;
  if (!message) {
    res.status(200).json({ ok: true });
    return;
  }

  const text = message?.text;
  if (typeof text !== "string" || text.length === 0) {
    res.status(200).json({ ok: true });
    return;
  }

  if (isBridgeMessage(text)) {
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

  await safeRetry(() => sendToVK(formatted));

  res.status(200).json({ ok: true });
}

