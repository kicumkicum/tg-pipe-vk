type TelegramSendMessageOk<T> = { ok: true; result: T };
type TelegramSendMessageError = { ok: false; description?: string; error_code?: number };

import { ApiError, HttpError } from "./errors";
import { requireEnv, requireEnvAll } from "./env";
import type { RequestLogger } from "./log";

const TG_TEXT_MAX = 4096;
const TG_CAPTION_MAX = 1024;

export type OutboundTelegram = {
  text: string;
  parse_mode?: "HTML";
  photo_url?: string;
};

function truncateUtf16(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

export async function sendToTelegram(payload: OutboundTelegram, logger?: RequestLogger): Promise<void> {
  requireEnvAll(["TG_TOKEN", "TG_CHAT_ID"]);
  const token = requireEnv("TG_TOKEN");
  const chatId = requireEnv("TG_CHAT_ID");

  const parseMode = payload.parse_mode;
  const text = truncateUtf16(payload.text, TG_TEXT_MAX);

  if (payload.photo_url) {
    const caption = truncateUtf16(text, TG_CAPTION_MAX);
    logger?.info("tg.api.outbound.start", {
      method: "sendPhoto",
      chat_id: chatId,
      caption_len: caption.length,
      has_parse_mode: Boolean(parseMode)
    });

    const photoResp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "content-type": "application/json;charset=UTF-8" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: payload.photo_url,
        caption,
        parse_mode: parseMode
      })
    });

    const photoData = (await photoResp.json()) as TelegramSendMessageOk<unknown> | TelegramSendMessageError;

    if (photoResp.ok && photoData.ok) {
      const result = photoData.result as { message_id?: number } | undefined;
      logger?.info("tg.api.outbound.ok", { method: "sendPhoto", http_status: photoResp.status, tg_message_id: result?.message_id });
      return;
    }

    const photoErr = !photoData.ok ? photoData : undefined;
    logger?.warn("tg.api.outbound.photo_failed_fallback", {
      http_status: photoResp.status,
      ok: photoData.ok,
      tg_error_code: photoErr?.error_code,
      tg_description: photoErr?.description
    });
  }

  logger?.info("tg.api.outbound.start", {
    method: "sendMessage",
    chat_id: chatId,
    text_len: text.length,
    has_parse_mode: Boolean(parseMode)
  });

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true
    })
  });

  if (!resp.ok) {
    logger?.warn("tg.api.outbound.http_error", { http_status: resp.status });
    throw new HttpError(`Telegram API HTTP ${resp.status}`, resp.status);
  }

  const data = (await resp.json()) as TelegramSendMessageOk<unknown> | TelegramSendMessageError;
  if (!data.ok) {
    const code = data.error_code;
    const retryable = code === 429;
    logger?.warn("tg.api.outbound.api_error", { tg_error_code: code, retryable, tg_description: data.description });
    throw new ApiError(`Telegram API error${code ? ` ${code}` : ""}: ${data.description ?? "unknown"}`, { code, retryable });
  }

  const result = data.result as { message_id?: number } | undefined;
  logger?.info("tg.api.outbound.ok", { method: "sendMessage", http_status: resp.status, tg_message_id: result?.message_id });
}
