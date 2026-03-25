import { db } from "@/db";
import { libraryItems, permanentItems, watchHistory, syncSections } from "@/db/schema";
import { getLibrarySections, getLibraryItems } from "./plex";
import { getLibraryMediaInfo, getHistory } from "./tautulli";
import type { SyncResult, PlexMediaItem, TautulliMediaItem } from "./types";
import { eq, sql, isNotNull } from "drizzle-orm";
import { computeAllPruningScores } from "./pruning";

const BATCH_SIZE = 500;

export async function syncLibrary(
  onProgress?: (msg: string) => void
): Promise<SyncResult> {
  const startTime = Date.now();
  let itemsSynced = 0;
  let historyEntries = 0;
  const knownItemIds = new Set<string>();

  onProgress?.("Fetching library sections from Plex...");
  const allSections = await getLibrarySections();

  // Filter to only enabled sections (if configured)
  const savedSections = db.select().from(syncSections).all();
  const hasConfig = savedSections.length > 0;
  let sections = allSections;

  if (hasConfig) {
    const enabledKeys = new Set(
      savedSections.filter((s) => s.enabled).map((s) => s.key)
    );
    sections = allSections.filter((s) => enabledKeys.has(s.key));
    onProgress?.(
      `Syncing ${sections.length} of ${allSections.length} libraries...`
    );
  }

  for (const section of sections) {
    onProgress?.(`Fetching items from "${section.title}" (${section.type})...`);

    // Fetch from Plex and Tautulli in parallel
    const [plexItems, tautulliItems] = await Promise.all([
      getLibraryItems(section.key, section.type),
      getLibraryMediaInfo(section.key),
    ]);

    // Build lookup map from Tautulli data
    const tautulliMap = new Map<string, TautulliMediaItem>();
    for (const item of tautulliItems) {
      tautulliMap.set(item.ratingKey, item);
    }

    // Merge and upsert library items
    onProgress?.(
      `Syncing ${plexItems.length} items from "${section.title}"...`
    );

    const mergedItems = plexItems.map((plex) =>
      mergeItem(plex, tautulliMap.get(plex.ratingKey))
    );

    for (const item of mergedItems) {
      knownItemIds.add(item.id);
    }

    for (let i = 0; i < mergedItems.length; i += BATCH_SIZE) {
      const batch = mergedItems.slice(i, i + BATCH_SIZE);
      await upsertLibraryItems(batch);
      itemsSynced += batch.length;
      onProgress?.(
        `Synced ${Math.min(i + BATCH_SIZE, mergedItems.length)}/${mergedItems.length} items from "${section.title}"`
      );
    }

    // Fetch and upsert watch history
    onProgress?.(`Fetching watch history for "${section.title}"...`);
    const historyData = await getHistory(section.key);

    onProgress?.(
      `Syncing ${historyData.length} history entries for "${section.title}"...`
    );

    for (let i = 0; i < historyData.length; i += BATCH_SIZE) {
      const batch = historyData.slice(i, i + BATCH_SIZE);

      db.transaction((tx) => {
        for (const entry of batch) {
          if (!entry.ratingKey || !entry.user || !entry.date) continue;
          if (!knownItemIds.has(entry.ratingKey)) continue;
          tx.insert(watchHistory)
            .values({
              itemId: entry.ratingKey,
              user: entry.user,
              watchedAt: entry.date,
              percentComplete: entry.percentComplete,
              wasCompleted: entry.wasCompleted,
            })
            .onConflictDoUpdate({
              target: [
                watchHistory.itemId,
                watchHistory.user,
                watchHistory.watchedAt,
              ],
              set: {
                percentComplete: sql`excluded.percent_complete`,
                wasCompleted: sql`excluded.was_completed`,
              },
            })
            .run();
        }
      });

      historyEntries += batch.length;
      onProgress?.(
        `Synced ${Math.min(i + BATCH_SIZE, historyData.length)}/${historyData.length} history entries`
      );
    }
  }

  // Remove items from DB that no longer exist in Plex
  // Permanent items are preserved and flagged instead of deleted
  let itemsRemoved = 0;
  let permanentMissing = 0;
  if (knownItemIds.size > 0) {
    onProgress?.("Removing items no longer in Plex...");

    // Fetch all existing IDs from the database and diff against known
    const existingRows = db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .all();
    const idsToRemove = existingRows
      .map((row) => row.id)
      .filter((id) => !knownItemIds.has(id));

    // Find which items to remove are permanent
    const permanentSet = new Set(
      db
        .select({ itemId: permanentItems.itemId })
        .from(permanentItems)
        .all()
        .map((row) => row.itemId)
    );

    const deletableIds = idsToRemove.filter((id) => !permanentSet.has(id));
    const protectedIds = idsToRemove.filter((id) => permanentSet.has(id));

    // Delete non-permanent items
    for (let i = 0; i < deletableIds.length; i += BATCH_SIZE) {
      const batch = deletableIds.slice(i, i + BATCH_SIZE);
      db.delete(libraryItems)
        .where(sql`${libraryItems.id} IN (${sql.join(batch.map((id) => sql`${id}`), sql`, `)})`)
        .run();
      itemsRemoved += batch.length;
    }

    // Clear deletedFromSource flag for any previously-flagged items still in Plex
    db.update(libraryItems)
      .set({ deletedFromSource: null })
      .where(isNotNull(libraryItems.deletedFromSource))
      .run();

    // Flag permanent items as deleted from source
    if (protectedIds.length > 0) {
      const now = Math.floor(Date.now() / 1000);
      for (const id of protectedIds) {
        db.update(libraryItems)
          .set({ deletedFromSource: now })
          .where(eq(libraryItems.id, id))
          .run();
      }
      permanentMissing = protectedIds.length;
      onProgress?.(`Warning: ${permanentMissing} permanent item(s) no longer found in Plex`);
    }

    if (itemsRemoved > 0) {
      onProgress?.(`Removed ${itemsRemoved} items no longer in Plex`);
    }
  }

  // Compute pruning scores
  onProgress?.("Computing pruning scores...");
  computeAllPruningScores();

  const durationMs = Date.now() - startTime;
  onProgress?.(`Sync complete: ${itemsSynced} items, ${historyEntries} history entries, ${itemsRemoved} removed in ${(durationMs / 1000).toFixed(1)}s`);

  return { itemsSynced, historyEntries, itemsRemoved, durationMs };
}

interface MergedLibraryItem {
  id: string;
  type: string;
  title: string;
  year: number | null;
  genre: string | null;
  plexRating: number | null;
  addedAt: number | null;
  lastViewedAt: number | null;
  playCount: number;
  fileSizeBytes: number;
  resolution: string | null;
  bitrate: number | null;
  episodeCount: number | null;
  filePath: string | null;
  thumbUrl: string | null;
  updatedAt: number;
}

function mergeItem(
  plex: PlexMediaItem,
  tautulli?: TautulliMediaItem
): MergedLibraryItem {
  // Prefer Tautulli for file size (especially for shows), play count, last played
  const fileSize = tautulli?.fileSize || plex.fileSize;
  const playCount = tautulli?.playCount ?? plex.viewCount;
  const lastViewed = tautulli?.lastPlayed ?? plex.lastViewedAt;

  return {
    id: plex.ratingKey,
    type: plex.type,
    title: plex.title,
    year: plex.year,
    genre: plex.genres.length > 0 ? JSON.stringify(plex.genres) : null,
    plexRating: plex.rating,
    addedAt: plex.addedAt,
    lastViewedAt: lastViewed || null,
    playCount,
    fileSizeBytes: fileSize,
    resolution: plex.resolution,
    bitrate: tautulli?.bitrate ?? plex.bitrate,
    episodeCount: plex.episodeCount,
    filePath: plex.filePath,
    thumbUrl: plex.thumbPath,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

function upsertLibraryItems(items: MergedLibraryItem[]): void {
  db.transaction((tx) => {
    for (const item of items) {
      tx.insert(libraryItems)
        .values(item)
        .onConflictDoUpdate({
          target: libraryItems.id,
          set: {
            type: sql`excluded.type`,
            title: sql`excluded.title`,
            year: sql`excluded.year`,
            genre: sql`excluded.genre`,
            plexRating: sql`excluded.plex_rating`,
            addedAt: sql`excluded.added_at`,
            lastViewedAt: sql`excluded.last_viewed_at`,
            playCount: sql`excluded.play_count`,
            fileSizeBytes: sql`excluded.file_size_bytes`,
            resolution: sql`excluded.resolution`,
            bitrate: sql`excluded.bitrate`,
            episodeCount: sql`excluded.episode_count`,
            filePath: sql`excluded.file_path`,
            thumbUrl: sql`excluded.thumb_url`,
            updatedAt: sql`excluded.updated_at`,
            deletedFromSource: sql`NULL`,
          },
        })
        .run();
    }
  });
}
