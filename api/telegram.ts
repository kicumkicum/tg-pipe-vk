import type { VercelRequest, VercelResponse } from "@vercel/node";

import { isTelegramWebhookAuthorized } from "../lib/security";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false });
    return;
  }

  if (!isTelegramWebhookAuthorized(req)) {
    res.status(401).json({ ok: false });
    return;
  }

  res.status(200).json({ ok: true });
}

