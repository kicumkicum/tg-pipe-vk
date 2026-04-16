import crypto from "node:crypto";

export function isBridgeMessage(text: string | undefined): boolean {
  return typeof text === "string" && text.includes("[BRIDGE:");
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shortHash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 8);
}

export function formatForVK(params: { text: string; username?: string; messageId: number | string }): string {
  const who = params.username?.trim() ? params.username.trim() : "user";
  const hash = shortHash(String(params.messageId));
  return `[TG | ${who}]\n${params.text}\n\n[BRIDGE:TG→VK|${hash}]`;
}

export type TelegramHtmlPayload = {
  text: string;
  parse_mode: "HTML";
};

/**
 * Красивое сообщение в Telegram: имя + ссылка на VK, текст с переносами через br, маркер моста в spoiler.
 * Без blockquote — на части клиентов/версий Bot API это давало 400 / can't parse entities.
 * Маркер по-прежнему в plain text внутри spoiler — `isBridgeMessage` на ответах из TG продолжит работать.
 */
export function formatForTelegramHtml(params: {
  text: string;
  messageId: number | string;
  displayName: string;
  profileUrl: string;
}): TelegramHtmlPayload {
  const hash = shortHash(String(params.messageId));
  const bridge = `[BRIDGE:VK→TG|${hash}]`;
  const name = escapeHtml(params.displayName);
  const body = escapeHtml(params.text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const href = encodeURI(params.profileUrl);
  const header = `🧑 <b>${name}</b> · <a href="${href}">VK</a>`;
  const bodyHtml = body.replace(/\n/g, "<br/>");
  const footer = `<tg-spoiler>${escapeHtml(bridge)}</tg-spoiler>`;

  return {
    text: `${header}\n\n${bodyHtml}\n\n${footer}`,
    parse_mode: "HTML"
  };
}

/** Plain fallback без parse_mode (если Telegram отверг HTML). */
export function formatForTelegramPlain(params: {
  text: string;
  messageId: number | string;
  displayName: string;
  profileUrl: string;
}): { text: string } {
  const hash = shortHash(String(params.messageId));
  const bridge = `[BRIDGE:VK→TG|${hash}]`;
  return {
    text: `🧑 ${params.displayName} · ${params.profileUrl}\n\n${params.text}\n\n${bridge}`
  };
}

