/** Легаси: старые сообщения с маркером моста (раньше добавляли в текст). */
export function isBridgeMessage(text: string | undefined): boolean {
  return typeof text === "string" && text.includes("[BRIDGE:");
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatForVK(params: { text: string; username?: string }): string {
  const who = params.username?.trim() ? params.username.trim() : "user";
  return `[TG | ${who}]\n${params.text}`;
}

export type TelegramHtmlPayload = {
  text: string;
  parse_mode: "HTML";
};

/**
 * Сообщение в Telegram: имя + ссылка на VK, текст с переносами через br.
 * Анти-петля: в TG пропускаем `from.is_bot`, в VK — исходящие `out` (см. обработчики).
 */
export function formatForTelegramHtml(params: { text: string; displayName: string; profileUrl: string }): TelegramHtmlPayload {
  const name = escapeHtml(params.displayName);
  const body = escapeHtml(params.text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const href = encodeURI(params.profileUrl);
  const header = `🧑 <b>${name}</b> · <a href="${href}">VK</a>`;
  const bodyHtml = body.replace(/\n/g, "<br/>");

  return {
    text: `${header}\n\n${bodyHtml}`,
    parse_mode: "HTML"
  };
}

/** Plain fallback без parse_mode (если Telegram отверг HTML). */
export function formatForTelegramPlain(params: { text: string; displayName: string; profileUrl: string }): { text: string } {
  return {
    text: `🧑 ${params.displayName} · ${params.profileUrl}\n\n${params.text}`
  };
}

