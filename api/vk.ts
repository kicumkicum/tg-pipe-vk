import type { VercelRequest, VercelResponse } from "@vercel/node";

import { formatForTelegram, isBridgeMessage } from "../lib/format";
import { safeRetry } from "../lib/retry";
import { isVkCallbackAuthorized } from "../lib/security";
import { sendToTelegram } from "../lib/telegram";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return;
  }

  const event = req.body as any;

  if (!isVkCallbackAuthorized(event)) {
    res.status(401).send("unauthorized");
    return;
  }

  if (event?.type === "confirmation") {
    res.status(200).send(process.env.VK_CONFIRMATION ?? "");
    return;
  }

  if (event?.type !== "message_new") {
    res.status(200).send("ok");
    return;
  }

  const message = event?.object?.message ?? event?.object;
  const text = message?.text;
  if (typeof text !== "string" || text.length === 0) {
    res.status(200).send("ok");
    return;
  }

  if (isBridgeMessage(text)) {
    res.status(200).send("ok");
    return;
  }

  const formatted = formatForTelegram({
    text,
    fromId: message?.from_id ?? "unknown",
    messageId: message?.id ?? message?.conversation_message_id ?? "unknown"
  });

  await safeRetry(() => sendToTelegram(formatted));

  res.status(200).send("ok");
}

