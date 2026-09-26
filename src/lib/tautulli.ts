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
      refresh: start === 0 ? "true" : "false",
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
        playCount: item.play_count == null || item.play_count === ""
          ? null : Math.max(0, Number(item.play_count) || 0),
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
  sectionId?: string
): Promise<TautulliHistoryEntry[]> {
  const entries: TautulliHistoryEntry[] = [];
  let start = 0;
  let totalCount = Infinity;

  while (start < totalCount) {
    const params: Record<string, string> = {
      length: String(TAUTULLI_PAGE_SIZE),
      start: String(start),
      grouping: "1", // Treat resumed sessions as one viewing.
      include_activity: "0",
      order_column: "date",
      order_dir: "asc",
    };
    if (sectionId) {
      params.section_id = sectionId;
    }

    const data = (await tautulliFetch("get_history", params)) as {
      recordsFiltered: number;
      data: Record<string, unknown>[];
    };

    const count = Number(data.recordsFiltered);
    if (!Number.isFinite(count) || count < 0 || !Array.isArray(data.data)) {
      throw new Error("Tautulli returned an invalid history page");
    }
    totalCount = count;
    if (data.data.length === 0) {
      if (start < totalCount) throw new Error("Tautulli history ended before all records were fetched");
      break;
    }

    for (const item of data.data) {
      const entry = parseHistoryEntry(item);
      if (entry) entries.push(entry);
    }

    start += data.data.length;
  }

  return entries;
}

export function parseHistoryEntry(item: Record<string, unknown>): TautulliHistoryEntry | null {
  const mediaType = item.media_type;
  if (mediaType && mediaType !== "movie" && mediaType !== "episode") return null;
  let mediaKey = String(item.rating_key || "");
  const ratingKey = mediaType === "episode" || item.grandparent_rating_key
    ? String(item.grandparent_rating_key || "") : mediaKey;
  const user = String(item.user || item.user_id || "");
  const date = Number(item.date || item.started || 0);
  if (!ratingKey || !mediaKey || !user || !Number.isFinite(date) || date <= 0) return null;
  if (mediaType === "episode" && item.parent_media_index != null && item.media_index != null &&
      item.parent_media_index !== "" && item.media_index !== "") {
    const season = Number(item.parent_media_index), episode = Number(item.media_index);
    if (Number.isInteger(season) && season >= 0 && Number.isInteger(episode) && episode >= 0) {
      mediaKey = `s${season}e${episode}`;
    }
  }
  return {
    ratingKey,
    mediaKey,
    user,
    date,
    percentComplete: Math.min(100, Math.max(0, Number(item.percent_complete) || 0)),
    wasCompleted: Number(item.watched_status) === 1,
  };
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
