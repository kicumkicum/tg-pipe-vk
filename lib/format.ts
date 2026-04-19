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
  const mid = Number.isFinite(conversationMessageId) && conversationMessageId > 0 ? conversationMessageId : 0;
  const msgid = mid > 0 ? `&msgid=${encodeURIComponent(String(mid))}` : "";

  // Беседы: в веб-клиенте обычно `im/convo/20000000XX` и `sel=c20000000XX`, а не `sel=20000000XX`.
  if (Number.isFinite(peerId) && peerId >= 2000000000) {
    return `https://vk.com/im?sel=c${encodeURIComponent(String(peerId))}${msgid}`;
  }

  return `https://vk.com/im?sel=${encodeURIComponent(String(peerId))}${msgid}`;
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

function relayHeaderPlainLine(p: { displayName: string; messageUrl: string }): string {
  const name = p.displayName.trim() || "user";
  return `${name} · 🔗 ${p.messageUrl}`;
}

function relayHeaderHtmlLine(p: { displayName: string; messageUrl: string }): string {
  const name = escapeHtml(p.displayName);
  const hm = escapeHtmlAttr(p.messageUrl);
  return `<b>${name}</b> · <a href="${hm}">🔗</a>`;
}

/** Длина префикса в UTF-16 code units (как в VK `format_data`). */
function vkUtf16CodeUnitLength(s: string): number {
  return Buffer.from(s, "utf16le").length / 2;
}

export type VkRelayPayload = {
  message: string;
  /** Параметр `messages.send` → `format_data`: жирное только имя в начале текста. */
  format_data: string;
};

export function formatForVK(params: {
  text: string;
  displayName: string;
  messageUrl: string;
  embedSeed: string;
}): VkRelayPayload {
  const name = params.displayName.trim() || "user";
  const head = relayHeaderPlainLine({
    displayName: name,
    messageUrl: params.messageUrl
  });
  const message = `${head}\n\n${params.text}${embedRelayTag(params.embedSeed)}`;
  const format_data = JSON.stringify({
    version: 1,
    items: [{ type: "bold", offset: 0, length: vkUtf16CodeUnitLength(name) }]
  });
  return { message, format_data };
}

export type TelegramHtmlPayload = {
  text: string;
  parse_mode: "HTML";
};

/**
 * Сообщение в Telegram: имя + ссылка на исходное сообщение (🔗), текст через br.
 * Анти-петля: в TG пропускаем `from.is_bot`, в VK — исходящие `out` (см. обработчики).
 */
export function formatForTelegramHtml(params: {
  text: string;
  displayName: string;
  messageUrl: string;
  embedSeed: string;
}): TelegramHtmlPayload {
  const body = escapeHtml(params.text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const header = relayHeaderHtmlLine({
    displayName: params.displayName,
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
  messageUrl: string;
  embedSeed: string;
}): { text: string } {
  const tail = embedRelayTag(params.embedSeed);
  const head = relayHeaderPlainLine({
    displayName: params.displayName,
    messageUrl: params.messageUrl
  });
  return {
    text: `${head}\n\n${params.text}${tail}`
  };
}

