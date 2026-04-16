type TelegramSendMessageOk<T> = { ok: true; result: T };
type TelegramSendMessageError = { ok: false; description?: string; error_code?: number };

import { ApiError, HttpError } from "./errors";
import { requireEnv, requireEnvAll } from "./env";
import type { RequestLogger } from "./log";

export async function sendToTelegram(payload: { text: string }, logger?: RequestLogger): Promise<void> {
  requireEnvAll(["TG_TOKEN", "TG_CHAT_ID"]);
  const token = requireEnv("TG_TOKEN");
  const chatId = requireEnv("TG_CHAT_ID");

  logger?.info("tg.api.outbound.start", {
    method: "sendMessage",
    chat_id: chatId,
    text_len: payload.text.length
  });

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify({
      chat_id: chatId,
      text: payload.text
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
  logger?.info("tg.api.outbound.ok", { http_status: resp.status, tg_message_id: result?.message_id });
}

