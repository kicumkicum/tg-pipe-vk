type VkApiOk<T> = { response: T };
type VkApiError = { error: { error_code: number; error_msg: string } };

import { ApiError, HttpError } from "./errors";
import { requireEnv, requireEnvAll } from "./env";
import type { RequestLogger } from "./log";

const VK_API_VERSION = "5.199";

async function vkCall<T>(
  method: string,
  params: Record<string, string>,
  logger?: RequestLogger
): Promise<T> {
  const token = requireEnv("VK_TOKEN");
  const body = new URLSearchParams({
    ...params,
    access_token: token,
    v: VK_API_VERSION
  });

  const resp = await fetch(`https://api.vk.com/method/${method}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body
  });

  if (!resp.ok) {
    logger?.warn("vk.api.http_error", { method, http_status: resp.status });
    throw new HttpError(`VK ${method} HTTP ${resp.status}`, resp.status);
  }

  const data = (await resp.json()) as VkApiOk<T> | VkApiError;
  if ("error" in data) {
    const code = data.error.error_code;
    const retryable = code === 6 || code === 10;
    logger?.warn("vk.api.api_error", { method, vk_error_code: code, retryable, vk_error_msg: data.error.error_msg });
    throw new ApiError(`VK API error ${code}: ${data.error.error_msg}`, { code, retryable });
  }
  return data.response;
}

export async function sendToVK(
  text: string,
  logger?: RequestLogger,
  opts?: { format_data?: string; attachment?: string }
): Promise<void> {
  requireEnvAll(["VK_TOKEN", "VK_CHAT_ID"]);
  const peerId = requireEnv("VK_CHAT_ID");

  logger?.info("vk.api.outbound.start", {
    method: "messages.send",
    peer_id: peerId,
    text_len: text.length
  });

  const resp = await vkCall<unknown>(
    "messages.send",
    {
      peer_id: peerId,
      message: text,
      random_id: String(Date.now()),
      ...(opts?.attachment ? { attachment: opts.attachment } : {}),
      ...(opts?.format_data ? { format_data: opts.format_data } : {})
    },
    logger
  );

  logger?.info("vk.api.outbound.ok", { http_status: 200, vk_message_id: resp });
}

type VkUploadServer = { upload_url: string };
type VkUploadResponse = { server: number; photo: string; hash: string };
type VkSavedPhoto = { id: number; owner_id: number; access_key?: string };

export async function sendPhotoToVK(
  params: { buffer: Uint8Array; filename: string; caption: string; format_data?: string },
  logger?: RequestLogger
): Promise<void> {
  requireEnvAll(["VK_TOKEN", "VK_CHAT_ID"]);
  const peerId = requireEnv("VK_CHAT_ID");

  const uploadServer = await vkCall<VkUploadServer>(
    "photos.getMessagesUploadServer",
    { peer_id: peerId },
    logger
  );

  const form = new FormData();
  const u8 = new Uint8Array(params.buffer);
  form.set("file", new Blob([u8]), params.filename);
  const upResp = await fetch(uploadServer.upload_url, { method: "POST", body: form });
  if (!upResp.ok) {
    logger?.warn("vk.upload.http_error", { http_status: upResp.status });
    throw new HttpError(`VK upload HTTP ${upResp.status}`, upResp.status);
  }
  const up = (await upResp.json()) as VkUploadResponse;

  const saved = await vkCall<VkSavedPhoto[]>(
    "photos.saveMessagesPhoto",
    { server: String(up.server), photo: up.photo, hash: up.hash },
    logger
  );
  const p = saved?.[0];
  if (!p) throw new Error("VK saveMessagesPhoto returned empty response");

  const attachment = `photo${p.owner_id}_${p.id}${p.access_key ? `_${p.access_key}` : ""}`;
  await sendToVK(params.caption, logger, { attachment, format_data: params.format_data });
}

