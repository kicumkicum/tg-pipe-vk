import { ConfigError } from "./errors";
import { requireEnv } from "./env";
import type { RequestLogger } from "./log";

export type VkAuthorProfile = {
  displayName: string;
  profileUrl: string;
  photoUrl?: string;
};

type VkApiOk<T> = { response: T };
type VkApiError = { error: { error_code: number; error_msg: string } };

const VK_API_VERSION = "5.131";

function vkMethodUrl(method: string, params: Record<string, string>): string {
  const q = new URLSearchParams({
    ...params,
    access_token: requireEnv("VK_TOKEN"),
    v: VK_API_VERSION
  });
  return `https://api.vk.com/method/${method}?${q.toString()}`;
}

async function vkCall<T>(method: string, params: Record<string, string>, logger?: RequestLogger): Promise<T> {
  const url = vkMethodUrl(method, params);
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    logger?.warn("vk.profile.http_error", { method, http_status: resp.status });
    throw new Error(`VK ${method} HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as VkApiOk<T> | VkApiError;
  if ("error" in data) {
    logger?.warn("vk.profile.api_error", { method, vk_error_code: data.error.error_code, vk_error_msg: data.error.error_msg });
    throw new Error(`VK ${method} error ${data.error.error_code}`);
  }
  return data.response;
}

/** Имя, ссылка и (если доступно) URL аватарки автора сообщения VK. */
export async function resolveVkAuthor(fromId: number, logger?: RequestLogger): Promise<VkAuthorProfile> {
  if (!Number.isFinite(fromId) || fromId === 0) {
    return { displayName: "VK", profileUrl: "https://vk.com/" };
  }

  try {
    if (fromId > 0) {
      const rows = await vkCall<Array<Record<string, unknown>>>(
        "users.get",
        {
          user_ids: String(fromId),
          fields: "photo_200,first_name,last_name,screen_name"
        },
        logger
      );
      const u = rows?.[0];
      const fn = typeof u?.first_name === "string" ? u.first_name : "";
      const ln = typeof u?.last_name === "string" ? u.last_name : "";
      const name = `${fn} ${ln}`.trim();
      const screen = typeof u?.screen_name === "string" ? u.screen_name : "";
      const photo = typeof u?.photo_200 === "string" ? u.photo_200 : undefined;
      const displayName = name || (screen ? `@${screen}` : `id ${fromId}`);
      const profileUrl = screen ? `https://vk.com/${screen}` : `https://vk.com/id${fromId}`;
      return { displayName, profileUrl, photoUrl: photo };
    }

    const gid = Math.abs(fromId);
    const rows = await vkCall<Array<Record<string, unknown>>>(
      "groups.getById",
      {
        group_ids: String(gid),
        fields: "photo_200,name,screen_name"
      },
      logger
    );
    const g = rows?.[0];
    const name = typeof g?.name === "string" ? g.name : `club ${gid}`;
    const screen = typeof g?.screen_name === "string" ? g.screen_name : "";
    const photo = typeof g?.photo_200 === "string" ? g.photo_200 : undefined;
    const profileUrl = screen ? `https://vk.com/${screen}` : `https://vk.com/club${gid}`;
    return { displayName: name, profileUrl, photoUrl: photo };
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    if (fromId > 0) return { displayName: `id ${fromId}`, profileUrl: `https://vk.com/id${fromId}` };
    const gid = Math.abs(fromId);
    return { displayName: `club ${gid}`, profileUrl: `https://vk.com/club${gid}` };
  }
}
