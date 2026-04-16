type VkApiOk<T> = { response: T };
type VkApiError = { error: { error_code: number; error_msg: string } };

const VK_API_VERSION = "5.131";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export async function sendToVK(text: string): Promise<void> {
  const token = requireEnv("VK_TOKEN");
  const peerId = requireEnv("VK_CHAT_ID");

  const body = new URLSearchParams({
    peer_id: peerId,
    message: text,
    random_id: String(Date.now()),
    access_token: token,
    v: VK_API_VERSION
  });

  const resp = await fetch("https://api.vk.com/method/messages.send", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body
  });

  if (!resp.ok) {
    throw new Error(`VK API HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as VkApiOk<unknown> | VkApiError;
  if ("error" in data) {
    throw new Error(`VK API error ${data.error.error_code}: ${data.error.error_msg}`);
  }
}

