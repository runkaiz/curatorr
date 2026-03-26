// Seerr (Jellyseerr) API client
// Handles media lookup by TMDB ID and deletion of files + records

function getSeerrUrl(): string {
  const url = process.env.SEERR_URL;
  if (!url) throw new Error("SEERR_URL is not set");
  return url.replace(/\/$/, "");
}

function getSeerrApiKey(): string {
  const key = process.env.SEERR_API_KEY;
  if (!key) throw new Error("SEERR_API_KEY is not set");
  return key;
}

export function isSeerrConfigured(): boolean {
  return !!(process.env.SEERR_URL && process.env.SEERR_API_KEY);
}

async function seerrFetch(
  path: string,
  options: { method?: string; params?: Record<string, string> } = {}
): Promise<Response> {
  const url = new URL(`${getSeerrUrl()}${path}`);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: options.method || "GET",
      headers: {
        "X-Api-Key": getSeerrApiKey(),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`Seerr API timeout for ${path}`);
    }
    throw new Error(
      `Seerr API connection error for ${path}: ${err instanceof Error ? err.message : "Unknown"}`
    );
  }

  return res;
}

interface SeerrMediaInfo {
  id: number;
  tmdbId: number;
  mediaType: "movie" | "tv";
  status: number;
}

/**
 * Look up a media item in Seerr by its TMDB ID and type.
 * Returns the Seerr internal media ID needed for deletion.
 */
export async function getSeerrMediaId(
  tmdbId: number,
  type: "movie" | "show"
): Promise<number | null> {
  // Seerr uses "movie" and "tv" as media types
  const mediaType = type === "show" ? "tv" : "movie";
  const path = `/api/v1/${mediaType}/${tmdbId}`;

  const res = await seerrFetch(path);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Seerr lookup failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  // The mediaInfo object contains the Seerr internal media ID
  const mediaInfo = data.mediaInfo as SeerrMediaInfo | undefined;
  if (!mediaInfo || !mediaInfo.id) return null;

  return mediaInfo.id;
}

/**
 * Delete the media files from Sonarr/Radarr via Seerr.
 * This sends the actual delete command to the *arr service.
 */
export async function deleteSeerrMediaFiles(mediaId: number): Promise<void> {
  const res = await seerrFetch(`/api/v1/media/${mediaId}/file`, {
    method: "DELETE",
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Seerr file deletion failed for media ${mediaId}: ${res.status} ${body}`
    );
  }
}

/**
 * Delete the media record from Seerr's database.
 * This cascades to delete all associated requests and seasons.
 */
export async function deleteSeerrMediaRecord(mediaId: number): Promise<void> {
  const res = await seerrFetch(`/api/v1/media/${mediaId}`, {
    method: "DELETE",
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Seerr record deletion failed for media ${mediaId}: ${res.status} ${body}`
    );
  }
}
