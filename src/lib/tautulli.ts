import type {
  TautulliMediaItem,
  TautulliHistoryEntry,
  TautulliUser,
} from "./types";

function getTautulliUrl(): string {
  const url = process.env.TAUTULLI_URL;
  if (!url) throw new Error("TAUTULLI_URL is not set");
  return url.replace(/\/$/, "");
}

function getTautulliApiKey(): string {
  const key = process.env.TAUTULLI_API_KEY;
  if (!key) throw new Error("TAUTULLI_API_KEY is not set");
  return key;
}

interface TautulliResponse {
  response: {
    result: string;
    message: string | null;
    data: unknown;
  };
}

async function tautulliFetch(
  cmd: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const url = new URL(`${getTautulliUrl()}/api/v2`);
  url.searchParams.set("apikey", getTautulliApiKey());
  url.searchParams.set("cmd", cmd);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`Tautulli API timeout for ${cmd}`);
    }
    throw new Error(`Tautulli API connection error for ${cmd}: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  if (!res.ok) {
    throw new Error(
      `Tautulli API error: ${res.status} ${res.statusText} for ${cmd}`
    );
  }

  const json: TautulliResponse = await res.json();
  if (json.response.result !== "success") {
    throw new Error(
      `Tautulli API error: ${json.response.message || "Unknown error"} for ${cmd}`
    );
  }

  return json.response.data;
}

const TAUTULLI_PAGE_SIZE = 500;

export async function getLibraryMediaInfo(
  sectionId: string
): Promise<TautulliMediaItem[]> {
  const items: TautulliMediaItem[] = [];
  let start = 0;
  let totalCount = Infinity;

  while (start < totalCount) {
    const data = (await tautulliFetch("get_library_media_info", {
      section_id: sectionId,
      length: String(TAUTULLI_PAGE_SIZE),
      start: String(start),
    })) as {
      recordsFiltered: number;
      data: Record<string, unknown>[];
    };

    totalCount = data.recordsFiltered || 0;
    if (!data.data || data.data.length === 0) break;

    for (const item of data.data) {
      items.push({
        ratingKey: String(item.rating_key),
        fileSize: parseInt(String(item.file_size || "0"), 10) || 0,
        playCount: parseInt(String(item.play_count || "0"), 10) || 0,
        lastPlayed: item.last_played
          ? parseInt(String(item.last_played), 10)
          : null,
        bitrate: item.bitrate
          ? parseInt(String(item.bitrate), 10)
          : null,
      });
    }

    start += TAUTULLI_PAGE_SIZE;
  }

  return items;
}

export async function getHistory(
  sectionId?: string,
  length: number = 10000
): Promise<TautulliHistoryEntry[]> {
  const entries: TautulliHistoryEntry[] = [];
  let start = 0;
  let totalCount = Infinity;

  while (start < totalCount) {
    const pageLength = Math.min(TAUTULLI_PAGE_SIZE, length - start);
    if (pageLength <= 0) break;

    const params: Record<string, string> = {
      length: String(pageLength),
      start: String(start),
    };
    if (sectionId) {
      params.section_id = sectionId;
    }

    const data = (await tautulliFetch("get_history", params)) as {
      recordsFiltered: number;
      data: Record<string, unknown>[];
    };

    totalCount = Math.min(data.recordsFiltered || 0, length);
    if (!data.data || data.data.length === 0) break;

    for (const item of data.data) {
      const watchedStatus = parseInt(String(item.watched_status || "0"), 10);
      const percentComplete = parseInt(
        String(item.percent_complete || "0"),
        10
      );

      entries.push({
        ratingKey: String(
          item.rating_key || item.grandparent_rating_key || ""
        ),
        user: String(item.user || ""),
        date: parseInt(String(item.date || item.started || "0"), 10),
        percentComplete,
        wasCompleted: watchedStatus === 1,
      });
    }

    start += pageLength;
  }

  return entries;
}

export async function getUsers(): Promise<TautulliUser[]> {
  const data = (await tautulliFetch("get_users")) as Record<
    string,
    unknown
  >[];

  if (!Array.isArray(data)) return [];

  return data.map((user) => ({
    userId: parseInt(String(user.user_id || "0"), 10),
    username: String(user.username || user.friendly_name || ""),
    isAdmin: user.is_admin === 1 || user.is_admin === "1",
  }));
}
