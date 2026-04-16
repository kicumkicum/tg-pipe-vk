/** Укороченное превью текста для логов (без утечки длинных сообщений целиком). */
export function previewText(text: string | undefined, max = 160): string | undefined {
  if (typeof text !== "string" || text.length === 0) return undefined;
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/** Безопасная сводка VK Callback (никогда не логируем `secret` и токены). */
export function summarizeVkCallback(event: unknown): Record<string, unknown> {
  if (!event || typeof event !== "object") return { parse: "invalid" };
  const e = event as Record<string, unknown>;
  const obj = e.object as Record<string, unknown> | undefined;
  const msg = (obj?.message as Record<string, unknown> | undefined) ?? obj;
  const text = typeof msg?.text === "string" ? msg.text : undefined;
  return {
    type: e.type,
    group_id: e.group_id,
    api_version: e.v,
    has_secret_field: typeof e.secret === "string",
    object_keys: obj && typeof obj === "object" ? Object.keys(obj).slice(0, 12) : undefined,
    message_id: msg?.id ?? msg?.conversation_message_id,
    peer_id: msg?.peer_id,
    from_id: msg?.from_id,
    text_len: typeof text === "string" ? text.length : undefined,
    text_preview: previewText(text)
  };
}

/** Безопасная сводка Telegram update (без токенов). */
export function summarizeTelegramUpdate(update: unknown): Record<string, unknown> {
  if (!update || typeof update !== "object") return { parse: "invalid" };
  const u = update as Record<string, unknown>;
  const message = u.message as Record<string, unknown> | undefined;
  const chat = message?.chat as Record<string, unknown> | undefined;
  const from = message?.from as Record<string, unknown> | undefined;
  const text = typeof message?.text === "string" ? message.text : undefined;
  return {
    update_id: u.update_id,
    update_keys: Object.keys(u).slice(0, 16),
    message_id: message?.message_id,
    chat_id: chat?.id,
    chat_type: chat?.type,
    from_id: from?.id,
    username: typeof from?.username === "string" ? from.username : undefined,
    text_len: typeof text === "string" ? text.length : undefined,
    text_preview: previewText(text)
  };
}
