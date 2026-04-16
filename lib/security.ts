import type { VercelRequest } from "@vercel/node";

export function getTelegramWebhookSecret(req: VercelRequest): string | undefined {
  const header = req.headers["x-telegram-bot-api-secret-token"];
  if (Array.isArray(header)) return header[0];
  if (typeof header === "string") return header;
  return undefined;
}

export function isTelegramWebhookAuthorized(req: VercelRequest): boolean {
  const expected = process.env.TG_WEBHOOK_SECRET;
  if (!expected) return true;
  const got = getTelegramWebhookSecret(req);
  return got === expected;
}

export function isVkCallbackAuthorized(event: any): boolean {
  const expected = process.env.VK_SECRET;
  if (!expected) return true;
  return event?.secret === expected;
}

