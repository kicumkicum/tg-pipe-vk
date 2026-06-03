import { requireEnv } from "./env";

/** Разрешённый Telegram chat_id из `TG_CHAT_ID` (сравнение как строки: `-100…`). */
export function isAllowedTelegramChat(chatId: unknown): boolean {
  const expected = requireEnv("TG_CHAT_ID").trim();
  if (chatId === undefined || chatId === null) return false;
  return String(chatId).trim() === expected;
}

/** Разрешённый VK peer_id диалога из `VK_CHAT_ID`. */
export function isAllowedVkPeer(peerId: unknown): boolean {
  const expected = requireEnv("VK_CHAT_ID").trim();
  if (peerId === undefined || peerId === null) return false;
  return String(peerId).trim() === expected;
}
