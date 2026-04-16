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
  /** Если задан — отправим как фото с подписью (аватар из VK, если API вернул URL). */
  photo_url?: string;
};

/**
 * Красивое сообщение в Telegram: имя + ссылка на VK, текст в blockquote, маркер моста в spoiler (меньше шума в чате).
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
  const quoted = `<blockquote>${body.replace(/\n/g, "<br/>")}</blockquote>`;
  const footer = `<tg-spoiler>${escapeHtml(bridge)}</tg-spoiler>`;

  return {
    text: `${header}\n\n${quoted}\n\n${footer}`,
    parse_mode: "HTML"
  };
}

