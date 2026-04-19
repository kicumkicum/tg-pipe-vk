import type { VercelRequest, VercelResponse } from "@vercel/node";

import { ConfigError } from "../lib/errors";
import { formatForTelegramHtml, formatForTelegramPlain, isBridgeMessage, vkMessageWebUrl } from "../lib/format";
import { summarizeVkCallback } from "../lib/log-sanitize";
import { createRequestLogger } from "../lib/log";
import { safeRetry } from "../lib/retry";
import { isVkCallbackAuthorized } from "../lib/security";
import { sendToTelegram } from "../lib/telegram";
import { resolveVkAuthor } from "../lib/vk-profile";

function bestVkPhotoUrl(message: any): string | undefined {
  const atts = Array.isArray(message?.attachments) ? message.attachments : [];
  for (const a of atts) {
    if (a?.type !== "photo") continue;
    const sizes = Array.isArray(a?.photo?.sizes) ? a.photo.sizes : [];
    let best: any | undefined;
    for (const s of sizes) {
      if (typeof s?.url !== "string" || s.url.length === 0) continue;
      const w = typeof s?.width === "number" ? s.width : 0;
      const h = typeof s?.height === "number" ? s.height : 0;
      if (!best) best = s;
      else if (w * h > (best.width ?? 0) * (best.height ?? 0)) best = s;
    }
    if (best?.url) return String(best.url);
  }
  return undefined;
}

function vkPeerDiag(event: any, message: any): Record<string, unknown> {
  const obj = event?.object;
  const msg = obj?.message;

  const pick = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim().length > 0) {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };

  const peer_message = pick(message?.peer_id);
  const peer_object = pick(obj?.peer_id);
  const peer_msg_nested = pick(msg?.peer_id);

  const configured_chat_id = process.env.VK_CHAT_ID;

  return {
    object_keys: obj && typeof obj === "object" ? Object.keys(obj).slice(0, 20) : undefined,
    message_keys: message && typeof message === "object" ? Object.keys(message).slice(0, 24) : undefined,
    peer_id_message: peer_message,
    peer_id_object: peer_object,
    peer_id_object_message: peer_msg_nested,
    peer_ids_distinct: Array.from(
      new Set([peer_message, peer_object, peer_msg_nested].filter((x): x is number => typeof x === "number"))
    ),
    peer_id_mismatch_object_vs_message:
      typeof peer_message === "number" && typeof peer_object === "number" ? peer_message !== peer_object : undefined,
    vk_chat_id_env: configured_chat_id,
    vk_chat_id_env_matches_message_peer:
      typeof configured_chat_id === "string" && configured_chat_id.length > 0 && typeof peer_message === "number"
        ? configured_chat_id === String(peer_message)
        : undefined
  };
}

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
    L.info("vk.callback.peer_diag", { ...vkPeerDiag(event, message), duration_ms: Date.now() - startedAt });
    const photoUrl = bestVkPhotoUrl(message);
    const textRaw = message?.text;
    const text = typeof textRaw === "string" ? textRaw : "";

    if (text.length === 0 && !photoUrl) {
      L.info("vk.message.ignored.non_text", {
        message_id: message?.id ?? message?.conversation_message_id,
        peer_id: message?.peer_id,
        duration_ms: Date.now() - startedAt
      });
      res.status(200).send("ok");
      L.info("vk.http.response", { status: 200, kind: "ignored_non_text" });
      return;
    }

    // Сообщения, отправленные нашим же токеном в чат (эхо TG→VK), не пересылаем обратно в Telegram.
    if (message?.out === 1 || message?.out === true) {
      L.info("vk.message.skipped.outgoing", {
        message_id: message?.id ?? message?.conversation_message_id,
        peer_id: message?.peer_id,
        duration_ms: Date.now() - startedAt
      });
      res.status(200).send("ok");
      L.info("vk.http.response", { status: 200, kind: "skipped_outgoing" });
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

    const fromRaw = message?.from_id;
    const fromId = typeof fromRaw === "number" ? fromRaw : Number(fromRaw);
    const fromIdSafe = Number.isFinite(fromId) ? fromId : 0;

    const profile = await resolveVkAuthor(fromIdSafe, L);
    const vkMsgId = message?.id ?? message?.conversation_message_id;
    const embedSeed = `vk2tg:${vkMsgId}:${message?.peer_id}:${fromRaw}`;

    const peerRaw = message?.peer_id;
    const peerId = typeof peerRaw === "number" ? peerRaw : Number(peerRaw);
    const peerIdSafe = Number.isFinite(peerId) ? peerId : 0;
    const cmidRaw = message?.conversation_message_id ?? message?.id;
    const cmid = typeof cmidRaw === "number" ? cmidRaw : Number(cmidRaw);
    const cmidSafe = Number.isFinite(cmid) ? cmid : 0;
    const messageUrl = vkMessageWebUrl(peerIdSafe, cmidSafe);

    const formatted = formatForTelegramHtml({
      text,
      displayName: profile.displayName,
      messageUrl,
      embedSeed
    });
    const plain = formatForTelegramPlain({
      text,
      displayName: profile.displayName,
      messageUrl,
      embedSeed
    });

    const outbound = profile.avatarPhotoUrl
      ? { ...formatted, photo_url: profile.avatarPhotoUrl, photo_kind: "avatar" as const, fallback_text: plain.text }
      : { ...formatted, fallback_text: plain.text };

    const outboundWithPhoto = photoUrl
      ? { ...outbound, photo_url: photoUrl, photo_kind: "content" as const }
      : outbound;

    L.info("vk.relay.start", {
      vk_group_id: event?.group_id,
      message_id: message?.id ?? message?.conversation_message_id,
      peer_id: message?.peer_id,
      from_id: message?.from_id,
      outbound_text_len: outboundWithPhoto.text.length,
      has_photo: Boolean(photoUrl || profile.avatarPhotoUrl),
      has_content_photo: Boolean(photoUrl)
    });

    await safeRetry(() => sendToTelegram(outboundWithPhoto, L), 3, L);

    L.info("vk.relay.sent_to_tg", {
      vk_group_id: event?.group_id,
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
