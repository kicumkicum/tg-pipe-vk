type TelegramSendMessageOk<T> = { ok: true; result: T };
type TelegramSendMessageError = { ok: false; description?: string; error_code?: number };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export async function sendToTelegram(payload: { text: string }): Promise<void> {
  const token = requireEnv("TG_TOKEN");
  const chatId = requireEnv("TG_CHAT_ID");

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify({
      chat_id: chatId,
      text: payload.text
    })
  });

  if (!resp.ok) {
    throw new Error(`Telegram API HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as TelegramSendMessageOk<unknown> | TelegramSendMessageError;
  if (!data.ok) {
    throw new Error(`Telegram API error${data.error_code ? ` ${data.error_code}` : ""}: ${data.description ?? "unknown"}`);
  }
}

