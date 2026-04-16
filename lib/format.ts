import crypto from "node:crypto";

/** Начало невидимого хвоста (редко встречается в обычном тексте). */
const RELAY_EMBED_SENTINEL = "\u2060\u200d\u2060";

/**
 * Невидимый хвост в конце исходящего текста: внутри сообщения, без видимого `[BRIDGE:…]`.
 * Детект копипаста / легаси: `isBridgeMessage`.
 */
export function embedRelayTag(seed: string): string {
  const digest = crypto.createHash("sha256").update(seed, "utf8").digest();
  let out = RELAY_EMBED_SENTINEL;
  for (let i = 0; i < 4; i++) {
    const b = digest[i]!;
    for (let bit = 7; bit >= 0; bit--) {
      out += (b >> bit) & 1 ? "\u200c" : "\u200b";
    }
  }
  return out;
}

/** Легаси `[BRIDGE:` или невидимый хвост моста. */
export function isBridgeMessage(text: string | undefined): boolean {
  if (typeof text !== "string") return false;
  if (text.includes("[BRIDGE:")) return true;
  return text.includes(RELAY_EMBED_SENTINEL);
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Ссылка на сообщение в диалоге VK (веб / приложение). */
export function vkMessageWebUrl(peerId: number, conversationMessageId: number): string {
  return `https://vk.com/im?sel=${encodeURIComponent(String(peerId))}&msgid=${encodeURIComponent(String(conversationMessageId))}`;
}

/**
 * Ссылка на сообщение в Telegram: публичная t.me или tg:// для приватных чатов.
 */
export function telegramMessageWebUrl(params: { chatId: number; messageId: number; chatUsername?: string }): string {
  const u = params.chatUsername?.trim();
  if (u) return `https://t.me/${u}/${params.messageId}`;
  const s = String(params.chatId);
  if (s.startsWith("-100")) return `https://t.me/c/${s.slice(4)}/${params.messageId}`;
  return `tg://openmessage?chat_id=${params.chatId}&message_id=${params.messageId}`;
}

function relayHeaderPlainLine(p: { displayName: string; profileUrl: string; messageUrl: string }): string {
  const name = p.displayName.trim() || "user";
  return `${name} · VK ${p.profileUrl} · 🔗 ${p.messageUrl}`;
}

function relayHeaderHtmlLine(p: { displayName: string; profileUrl: string; messageUrl: string }): string {
  const name = escapeHtml(p.displayName);
  const hp = escapeHtmlAttr(p.profileUrl);
  const hm = escapeHtmlAttr(p.messageUrl);
  return `<b>${name}</b> · <a href="${hp}">VK</a> · <a href="${hm}">🔗</a>`;
}

export function formatForVK(params: {
  text: string;
  displayName: string;
  profileUrl: string;
  messageUrl: string;
  embedSeed: string;
}): string {
  const head = relayHeaderPlainLine({
    displayName: params.displayName,
    profileUrl: params.profileUrl,
    messageUrl: params.messageUrl
  });
  return `${head}\n\n${params.text}${embedRelayTag(params.embedSeed)}`;
}

export type TelegramHtmlPayload = {
  text: string;
  parse_mode: "HTML";
};

/**
 * Сообщение в Telegram: имя + ссылка на VK, текст с переносами через br.
 * Анти-петля: в TG пропускаем `from.is_bot`, в VK — исходящие `out` (см. обработчики).
 */
export function formatForTelegramHtml(params: {
  text: string;
  displayName: string;
  profileUrl: string;
  messageUrl: string;
  embedSeed: string;
}): TelegramHtmlPayload {
  const body = escapeHtml(params.text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const header = relayHeaderHtmlLine({
    displayName: params.displayName,
    profileUrl: params.profileUrl,
    messageUrl: params.messageUrl
  });
  const bodyHtml = body.replace(/\n/g, "<br/>");
  const tail = embedRelayTag(params.embedSeed);

  return {
    text: `${header}\n\n${bodyHtml}${tail}`,
    parse_mode: "HTML"
  };
}

/** Plain fallback без parse_mode (если Telegram отверг HTML). */
export function formatForTelegramPlain(params: {
  text: string;
  displayName: string;
  profileUrl: string;
  messageUrl: string;
  embedSeed: string;
}): { text: string } {
  const tail = embedRelayTag(params.embedSeed);
  const head = relayHeaderPlainLine({
    displayName: params.displayName,
    profileUrl: params.profileUrl,
    messageUrl: params.messageUrl
  });
  return {
    text: `${head}\n\n${params.text}${tail}`
  };
}

