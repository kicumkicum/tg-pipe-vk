import crypto from "node:crypto";

export function isBridgeMessage(text: string | undefined): boolean {
  return typeof text === "string" && text.includes("[BRIDGE:");
}

function shortHash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 8);
}

export function formatForVK(params: { text: string; username?: string; messageId: number | string }): string {
  const who = params.username?.trim() ? params.username.trim() : "user";
  const hash = shortHash(String(params.messageId));
  return `[TG | ${who}]\n${params.text}\n\n[BRIDGE:TG→VK|${hash}]`;
}

export function formatForTelegram(params: { text: string; fromId: number | string; messageId: number | string }): { text: string } {
  const hash = shortHash(String(params.messageId));
  return {
    text: `[VK | ${params.fromId}]\n${params.text}\n\n[BRIDGE:VK→TG|${hash}]`
  };
}

