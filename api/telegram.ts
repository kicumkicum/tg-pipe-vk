import type { VercelRequest, VercelResponse } from "@vercel/node";

import { ApiError, ConfigError } from "../lib/errors";
import { formatForVK, isBridgeMessage, telegramMessageWebUrl } from "../lib/format";
import { createRequestLogger } from "../lib/log";
import { summarizeTelegramUpdate } from "../lib/log-sanitize";
import { safeRetry } from "../lib/retry";
import { getTelegramWebhookSecret, isTelegramWebhookAuthorized } from "../lib/security";
import { sendPhotoToVK, sendToVK } from "../lib/vk";

function tgMessageAttachmentFlags(message: any): Record<string, boolean> {
  return {
    has_photo: Array.isArray(message?.photo) && message.photo.length > 0,
    has_document: Boolean(message?.document),
    has_sticker: Boolean(message?.sticker),
    has_video: Boolean(message?.video),
    has_video_note: Boolean(message?.video_note),
    has_voice: Boolean(message?.voice),
    has_audio: Boolean(message?.audio),
    has_animation: Boolean(message?.animation),
    has_poll: Boolean(message?.poll),
    has_location: Boolean(message?.location),
    has_contact: Boolean(message?.contact),
    has_dice: Boolean(message?.dice)
  };
}

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

    const isPhoto = Array.isArray(message?.photo) && message.photo.length > 0;
    const text = typeof message?.text === "string" ? message.text : "";
    const caption = typeof message?.caption === "string" ? message.caption : "";
    const bodyText = isPhoto ? caption : text;

    if (bodyText.length === 0 && !isPhoto) {
      L.info("tg.update.ignored.non_text", {
        message_id: message?.message_id,
        chat_id: message?.chat?.id,
        message_keys: message && typeof message === "object" ? Object.keys(message).slice(0, 40) : undefined,
        ...tgMessageAttachmentFlags(message),
        duration_ms: Date.now() - startedAt
      });
      res.status(200).json({ ok: true });
      L.info("tg.http.response", { status: 200, kind: "ignored_non_text" });
      return;
    }

    if (isBridgeMessage(bodyText)) {
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

    const messageUrl = telegramMessageWebUrl({
      chatId: message.chat.id,
      messageId: message.message_id,
      chatUsername: typeof message.chat?.username === "string" ? message.chat.username : undefined
    });

    const embedSeed = `tg2vk:${message.message_id}:${message.chat?.id}`;
    const formatted = formatForVK({
      text: bodyText,
      displayName,
      messageUrl,
      embedSeed
    });
    const formattedPicFallback = isPhoto
      ? formatForVK({
          text: bodyText.length > 0 ? `${bodyText}\n[PIC]` : "[PIC]",
          displayName,
          messageUrl,
          embedSeed
        })
      : formatted;

    L.info("tg.relay.start", {
      message_id: message.message_id,
      chat_id: message?.chat?.id,
      outbound_text_len: formatted.message.length
    });

    if (!isPhoto) {
      await safeRetry(() => sendToVK(formatted.message, L, { format_data: formatted.format_data }), 3, L);
    } else {
      const tgToken = process.env.TG_TOKEN ?? "";
      const best = message.photo[message.photo.length - 1];
      const fileId = best?.file_id;
      if (!tgToken || typeof fileId !== "string" || fileId.length === 0) {
        await safeRetry(() => sendToVK(formattedPicFallback.message, L, { format_data: formattedPicFallback.format_data }), 3, L);
      } else {
        const fileResp = await fetch(`https://api.telegram.org/bot${tgToken}/getFile`, {
          method: "POST",
          headers: { "content-type": "application/json;charset=UTF-8" },
          body: JSON.stringify({ file_id: fileId })
        });
        const fileJson = (await fileResp.json()) as any;
        const filePath = fileJson?.result?.file_path;
        if (!fileResp.ok || typeof filePath !== "string" || filePath.length === 0) {
          L.warn("tg.file.getFile_failed", { http_status: fileResp.status });
          await safeRetry(() => sendToVK(formattedPicFallback.message, L, { format_data: formattedPicFallback.format_data }), 3, L);
        } else {
          const dl = await fetch(`https://api.telegram.org/file/bot${tgToken}/${filePath}`);
          if (!dl.ok) {
            L.warn("tg.file.download_failed", { http_status: dl.status });
            await safeRetry(() => sendToVK(formattedPicFallback.message, L, { format_data: formattedPicFallback.format_data }), 3, L);
          } else {
            const buf = new Uint8Array(await dl.arrayBuffer());
            const filename = filePath.split("/").pop() || "photo.jpg";
            try {
              await safeRetry(
                () => sendPhotoToVK({ buffer: buf, filename, caption: formatted.message, format_data: formatted.format_data }, L),
                3,
                L
              );
            } catch (e) {
              if (e instanceof ApiError && e.code === 15) {
                L.warn("vk.photo.relay.no_scope_fallback_text", {
                  vk_error_code: e.code,
                  hint: "Grant VK token access to call photos.getMessagesUploadServer / photos.saveMessagesPhoto (photos scope). Falling back to text-only."
                });
                await safeRetry(() => sendToVK(formattedPicFallback.message, L, { format_data: formattedPicFallback.format_data }), 3, L);
              } else {
                throw e;
              }
            }
          }
        }
      }
    }

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
