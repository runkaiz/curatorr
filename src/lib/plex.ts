import { XMLParser } from "fast-xml-parser";
import type { PlexSection, PlexMediaItem } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

function getPlexUrl(): string {
  const url = process.env.PLEX_URL;
  if (!url) throw new Error("PLEX_URL is not set");
  return url.replace(/\/$/, "");
}

function getPlexToken(): string {
  const token = process.env.PLEX_TOKEN;
  if (!token) throw new Error("PLEX_TOKEN is not set");
  return token;
}

async function plexFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${getPlexUrl()}${path}`);
  url.searchParams.set("X-Plex-Token", getPlexToken());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`Plex API timeout for ${path}`);
    }
    throw new Error(`Plex API connection error for ${path}: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  if (!res.ok) {
    throw new Error(`Plex API error: ${res.status} ${res.statusText} for ${path}`);
  }

  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("json")) {
    return res.json();
  }

  // Fall back to XML parsing
  const text = await res.text();
  return parser.parse(text);
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toInt(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function toFloat(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

export async function getLibrarySections(): Promise<PlexSection[]> {
  const data = await plexFetch("/library/sections") as Record<string, unknown>;

  // Handle JSON response format
  const container =
    (data as Record<string, unknown>).MediaContainer ||
    data;
  const directories = ensureArray(
    (container as Record<string, unknown>).Directory as Record<string, unknown>[] | Record<string, unknown>
  );

  return directories
    .filter((dir: Record<string, unknown>) => dir.type === "movie" || dir.type === "show")
    .map((dir: Record<string, unknown>) => ({
      key: String(dir.key),
      type: dir.type as "movie" | "show",
      title: String(dir.title),
    }));
}

const PAGE_SIZE = 200;

export async function getLibraryItems(
  sectionId: string,
  sectionType: "movie" | "show"
): Promise<PlexMediaItem[]> {
  const items: PlexMediaItem[] = [];
  let start = 0;
  let totalSize = Infinity;

  while (start < totalSize) {
    const data = await plexFetch(`/library/sections/${sectionId}/all`, {
      "X-Plex-Container-Start": String(start),
      "X-Plex-Container-Size": String(PAGE_SIZE),
    }) as Record<string, unknown>;

    const container =
      (data as Record<string, unknown>).MediaContainer ||
      data;

    totalSize = toInt((container as Record<string, unknown>).totalSize || (container as Record<string, unknown>).size);
    if (totalSize === 0) break;

    // Items can be under "Metadata" or "Video" depending on response format
    const rawItems = ensureArray(
      (container as Record<string, unknown>).Metadata ||
      (container as Record<string, unknown>).Video ||
      (container as Record<string, unknown>).Directory
    ) as Record<string, unknown>[];

    for (const item of rawItems) {
      items.push(parseMediaItem(item, sectionType));
    }

    start += PAGE_SIZE;
    if (rawItems.length === 0) break;
  }

  return items;
}

function parseMediaItem(
  item: Record<string, unknown>,
  sectionType: "movie" | "show"
): PlexMediaItem {
  // Extract genres
  const genreData = ensureArray(item.Genre as Record<string, unknown>[] | Record<string, unknown>);
  const genres = genreData.map((g) =>
    typeof g === "string" ? g : String((g as Record<string, unknown>).tag || g)
  );

  // Extract file info from Media → Part
  let fileSize = 0;
  let resolution: string | null = null;
  let bitrate: number | null = null;
  let filePath: string | null = null;

  const mediaList = ensureArray(item.Media as Record<string, unknown>[] | Record<string, unknown>);
  for (const media of mediaList) {
    const m = media as Record<string, unknown>;
    if (!resolution) {
      resolution = String(m.videoResolution || "") || null;
      bitrate = toInt(m.bitrate) || null;
    }

    const parts = ensureArray(m.Part as Record<string, unknown>[] | Record<string, unknown>);
    for (const part of parts) {
      const p = part as Record<string, unknown>;
      fileSize += toInt(p.size);
      if (!filePath) filePath = String(p.file || "") || null;
    }
  }

  // Normalize resolution
  if (resolution) {
    if (resolution === "4k" || resolution === "2160") resolution = "4K";
    else if (resolution === "1080") resolution = "1080p";
    else if (resolution === "720") resolution = "720p";
    else if (resolution === "480" || resolution === "sd") resolution = "SD";
  }

  return {
    ratingKey: String(item.ratingKey),
    title: String(item.title),
    year: toInt(item.year) || null,
    rating: toFloat(item.rating),
    addedAt: toInt(item.addedAt) || null,
    lastViewedAt: toInt(item.lastViewedAt) || null,
    viewCount: toInt(item.viewCount),
    genres,
    fileSize,
    resolution,
    bitrate,
    episodeCount: sectionType === "show" ? toInt(item.leafCount) || null : null,
    filePath,
    thumbPath: item.thumb ? String(item.thumb) : null,
    type: sectionType,
  };
}

export async function getItemMetadata(ratingKey: string): Promise<PlexMediaItem | null> {
  try {
    const data = await plexFetch(`/library/metadata/${ratingKey}`) as Record<string, unknown>;
    const container =
      (data as Record<string, unknown>).MediaContainer ||
      data;
    const items = ensureArray(
      (container as Record<string, unknown>).Metadata ||
      (container as Record<string, unknown>).Video
    ) as Record<string, unknown>[];
    if (items.length === 0) return null;

    const item = items[0];
    const type = item.type === "show" ? "show" : "movie";
    return parseMediaItem(item, type);
  } catch {
    return null;
  }
}
