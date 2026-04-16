import type { VercelRequest, VercelResponse } from "@vercel/node";

import { ConfigError } from "../lib/errors";
import { formatForTelegram, isBridgeMessage } from "../lib/format";
import { summarizeVkCallback } from "../lib/log-sanitize";
import { createRequestLogger } from "../lib/log";
import { safeRetry } from "../lib/retry";
import { isVkCallbackAuthorized } from "../lib/security";
import { sendToTelegram } from "../lib/telegram";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const L = createRequestLogger("vk.webhook");
  const startedAt = Date.now();

  try {
    L.info("vk.http.request", {
      method: req.method,
      url: req.url,
      content_type: req.headers["content-type"],
      content_length: req.headers["content-length"],
      vercel_id: req.headers["x-vercel-id"]
    });

    if (req.method !== "POST") {
      L.warn("vk.http.method_not_allowed", { method: req.method });
      res.status(405).send("method not allowed");
      return;
    }

    const event = req.body as any;
    L.info("vk.callback.summary", { ...summarizeVkCallback(event), duration_ms: Date.now() - startedAt });

    // VK не всегда присылает `secret` в запросе подтверждения сервера — проверяем secret только после confirmation.
    if (event?.type === "confirmation") {
      const body = process.env.VK_CONFIRMATION ?? "";
      L.info("vk.callback.confirmation", {
        group_id: event?.group_id,
        response_len: body.length,
        duration_ms: Date.now() - startedAt
      });
      res.status(200).send(body);
      L.info("vk.http.response", { status: 200, kind: "confirmation" });
      return;
    }

    if (!isVkCallbackAuthorized(event)) {
      L.warn("vk.callback.unauthorized", { type: event?.type, group_id: event?.group_id });
      res.status(401).send("unauthorized");
      L.info("vk.http.response", { status: 401, kind: "unauthorized" });
      return;
    }

    if (event?.type !== "message_new") {
      L.info("vk.callback.ignored", { type: event?.type, duration_ms: Date.now() - startedAt });
      res.status(200).send("ok");
      L.info("vk.http.response", { status: 200, kind: "ignored_event" });
      return;
    }

    const message = event?.object?.message ?? event?.object;
    const text = message?.text;
    if (typeof text !== "string" || text.length === 0) {
      L.info("vk.message.ignored.non_text", {
        message_id: message?.id ?? message?.conversation_message_id,
        peer_id: message?.peer_id,
        duration_ms: Date.now() - startedAt
      });
      res.status(200).send("ok");
      L.info("vk.http.response", { status: 200, kind: "ignored_non_text" });
      return;
    }

    if (isBridgeMessage(text)) {
      L.info("vk.message.skipped.bridge_marker", {
        message_id: message?.id ?? message?.conversation_message_id,
        peer_id: message?.peer_id,
        duration_ms: Date.now() - startedAt
      });
      res.status(200).send("ok");
      L.info("vk.http.response", { status: 200, kind: "skipped_bridge" });
      return;
    }

    const formatted = formatForTelegram({
      text,
      fromId: message?.from_id ?? "unknown",
      messageId: message?.id ?? message?.conversation_message_id ?? "unknown"
    });

    L.info("vk.relay.start", {
      message_id: message?.id ?? message?.conversation_message_id,
      peer_id: message?.peer_id,
      from_id: message?.from_id,
      outbound_text_len: formatted.text.length
    });

    await safeRetry(() => sendToTelegram(formatted, L), 3, L);

    L.info("vk.relay.sent_to_tg", {
      message_id: message?.id ?? message?.conversation_message_id,
      peer_id: message?.peer_id,
      from_id: message?.from_id,
      duration_ms: Date.now() - startedAt
    });

    res.status(200).send("ok");
    L.info("vk.http.response", { status: 200, kind: "relay_ok", duration_ms: Date.now() - startedAt });
  } catch (err) {
    if (err instanceof ConfigError) {
      L.error("vk.config.missing_env", {
        duration_ms: Date.now() - startedAt,
        missing: err.missing,
        hint: "Add these in Vercel Project → Settings → Environment Variables for this environment (Production/Preview), then redeploy."
      });
      if (!res.headersSent) {
        res.status(503).send("misconfigured");
        L.info("vk.http.response", { status: 503, kind: "config_error" });
      }
      return;
    }

    L.error("vk.handler.unhandled", {
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8).join("\n") : undefined
    });
    if (!res.headersSent) {
      res.status(500).send("error");
      L.info("vk.http.response", { status: 500, kind: "handler_error" });
    }
  }
}
