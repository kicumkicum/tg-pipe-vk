type TelegramSendMessageOk<T> = { ok: true; result: T };
type TelegramSendMessageError = { ok: false; description?: string; error_code?: number };

import { ApiError, HttpError } from "./errors";
import { requireEnv, requireEnvAll } from "./env";
import type { RequestLogger } from "./log";

const TG_TEXT_MAX = 4096;

export type OutboundTelegram = {
  text: string;
  parse_mode?: "HTML";
  /** Plain UTF-16 текст без HTML — если Telegram отверг parse_mode (entities). */
  fallback_text?: string;
};

function truncateUtf16(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function isTelegramHtmlEntityError(description?: string): boolean {
  if (!description) return false;
  const d = description.toLowerCase();
  return d.includes("can't parse entities") || d.includes("unsupported start tag") || (d.includes("parse") && d.includes("entit"));
}

type TelegramResponse = TelegramSendMessageOk<unknown> | TelegramSendMessageError;

async function callTelegramMethod(
  token: string,
  method: string,
  body: Record<string, unknown>,
  logger?: RequestLogger
): Promise<{ ok: true; data: TelegramSendMessageOk<unknown>; http_status: number } | { ok: false; data: TelegramResponse; http_status: number; raw: string }> {
  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify(body)
  });
  const raw = await resp.text();
  let data: TelegramResponse;
  try {
    data = JSON.parse(raw) as TelegramResponse;
  } catch {
    logger?.warn("tg.api.outbound.invalid_json", {
      method,
      http_status: resp.status,
      body_preview: raw.slice(0, 400)
    });
    throw new HttpError(`Telegram ${method} invalid JSON (HTTP ${resp.status})`, resp.status);
  }

  if (!data.ok) {
    return { ok: false, data, http_status: resp.status, raw };
  }
  return { ok: true, data: data as TelegramSendMessageOk<unknown>, http_status: resp.status };
}

export async function sendToTelegram(payload: OutboundTelegram, logger?: RequestLogger): Promise<void> {
  requireEnvAll(["TG_TOKEN", "TG_CHAT_ID"]);
  const token = requireEnv("TG_TOKEN");
  const chatId = requireEnv("TG_CHAT_ID");

  const parseMode = payload.parse_mode;
  const text = truncateUtf16(payload.text, TG_TEXT_MAX);

  logger?.info("tg.api.outbound.start", {
    method: "sendMessage",
    chat_id: chatId,
    text_len: text.length,
    has_parse_mode: Boolean(parseMode)
  });

  let sendResult = await callTelegramMethod(
    token,
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true
    },
    logger
  );

  if (!sendResult.ok) {
    const err = sendResult.data as TelegramSendMessageError;
    const code = err.error_code;
    const retryable = code === 429;
    logger?.warn("tg.api.outbound.api_error", {
      http_status: sendResult.http_status,
      tg_error_code: code,
      retryable,
      tg_description: err.description
    });

    const fb = payload.fallback_text ? truncateUtf16(payload.fallback_text, TG_TEXT_MAX) : undefined;
    if (parseMode === "HTML" && fb && isTelegramHtmlEntityError(err.description)) {
      logger?.warn("tg.api.outbound.retry_plain_text", { reason: "html_entity_parse_failed" });
      sendResult = await callTelegramMethod(
        token,
        "sendMessage",
        {
          chat_id: chatId,
          text: fb,
          disable_web_page_preview: true
        },
        logger
      );
    }
  }

  if (!sendResult.ok) {
    const err = sendResult.data as TelegramSendMessageError;
    const code = err.error_code;
    const retryable = code === 429;
    throw new ApiError(`Telegram API error${code ? ` ${code}` : ""}: ${err.description ?? "unknown"}`, { code, retryable });
  }

  const result = sendResult.data.result as { message_id?: number } | undefined;
  logger?.info("tg.api.outbound.ok", {
    method: "sendMessage",
    http_status: sendResult.http_status,
    tg_message_id: result?.message_id
  });
}
