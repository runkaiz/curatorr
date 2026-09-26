import { db } from "@/db";
import { libraryItems, permanentItems, watchHistory, syncSections, plexItemAliases } from "@/db/schema";
import { getLibrarySections, getLibraryItems } from "./plex";
import { getLibraryMediaInfo, getHistory } from "./tautulli";
import type {
  PlexCollectionSyncResult,
  PlexMediaItem,
  SyncResult,
  TautulliMediaItem,
  TautulliHistoryEntry,
} from "./types";
import { eq, sql } from "drizzle-orm";
import { computeAllPruningScores, invalidatePruningScores } from "./pruning";
import { reconcilePermanentCollection } from "./permanent-collection";
import { relinkPermanentItems } from "./library-identity";

const BATCH_SIZE = 500;
let activeSync: Promise<SyncResult> | null = null;

export function syncLibrary(onProgress?: (msg: string) => void): Promise<SyncResult> {
  if (!activeSync) activeSync = runSync(onProgress).finally(() => { activeSync = null; });
  return activeSync;
}

async function runSync(
  onProgress?: (msg: string) => void
): Promise<SyncResult> {
  const startTime = Date.now();
  invalidatePruningScores();
  let itemsSynced = 0;
  let historyEntries = 0;
  const knownItemIds = new Set<string>();
  const syncedPlexItems: PlexMediaItem[] = [];
  const histories: { sectionId: string; entries: TautulliHistoryEntry[] }[] = [];

  onProgress?.("Fetching library sections from Plex...");
  const allSections = await getLibrarySections();
  // Keep the Plex catalog current while preserving explicit choices.
  db.transaction((tx) => {
    for (const section of allSections) {
      tx.insert(syncSections).values({ ...section, enabled: true })
        .onConflictDoUpdate({ target: syncSections.key, set: { title: section.title, type: section.type } })
        .run();
    }
  });

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

  // Invalidate every selected section together, including during a long sync.
  db.transaction((tx) => {
    for (const section of sections) tx.update(syncSections).set({ historyComplete: false })
      .where(eq(syncSections.key, section.key)).run();
  });
  invalidatePruningScores();
  for (const section of sections) {
    onProgress?.(`Fetching items from "${section.title}" (${section.type})...`);

    // Fetch from Plex and Tautulli in parallel
    const [plexItems, tautulliItems] = await Promise.all([
      getLibraryItems(section.key, section.type, true),
      getLibraryMediaInfo(section.key),
    ]);
    syncedPlexItems.push(...plexItems);

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

    histories.push({ sectionId: section.key, entries: historyData });
  }

  // Restore permanent markers before cleanup and collection write-back. All
  // destination items must be known before any old episode history is mapped.
  const recovery = relinkPermanentItems(
    syncedPlexItems,
    new Set(sections.map((section) => section.key)),
    new Set(allSections.map((section) => section.key))
  );
  for (const warning of recovery.warnings) onProgress?.(warning);
  const aliases = new Map(db.select().from(plexItemAliases).all().map((row) => [row.oldId, row.itemId]));
  for (const { sectionId, entries } of histories) {
    db.transaction((tx) => {
      for (const entry of entries) {
        const itemId = knownItemIds.has(entry.ratingKey) ? entry.ratingKey : aliases.get(entry.ratingKey);
        if (!itemId || !knownItemIds.has(itemId)) continue;
        tx.insert(watchHistory).values({
          itemId, mediaKey: entry.mediaKey, user: entry.user, watchedAt: entry.date,
          percentComplete: entry.percentComplete, wasCompleted: entry.wasCompleted,
        }).onConflictDoUpdate({
          target: [watchHistory.itemId, watchHistory.user, watchHistory.mediaKey, watchHistory.watchedAt],
          set: { percentComplete: entry.percentComplete, wasCompleted: entry.wasCompleted },
        }).run();
        historyEntries++;
      }
      tx.update(syncSections).set({
        historyComplete: true,
        historySyncedAt: Math.floor(Date.now() / 1000),
        historyStartedAt: entries.reduce<number | null>((oldest, entry) => Math.min(oldest ?? entry.date, entry.date), null),
      }).where(eq(syncSections.key, sectionId)).run();
    });
  }
  db.run(sql`
    UPDATE library_items SET
      play_count = MAX(play_count, (SELECT COUNT(*) FROM watch_history wh WHERE wh.item_id = library_items.id)),
      last_viewed_at = NULLIF(MAX(COALESCE(last_viewed_at, 0), COALESCE(
        (SELECT MAX(watched_at) FROM watch_history wh WHERE wh.item_id = library_items.id), 0)), 0)
    WHERE id IN (SELECT DISTINCT item_id FROM watch_history)
  `);

  // Remove items from DB that no longer exist in Plex
  // Permanent items are preserved and flagged instead of deleted
  let itemsRemoved = 0;
  let permanentMissing = 0;
  if (knownItemIds.size > 0) {
    onProgress?.("Removing items no longer in Plex...");

    // Fetch all existing IDs from the database and diff against known
    const syncedSectionIds = new Set(sections.map((section) => section.key));
    const existingRows = db
      .select({ id: libraryItems.id, plexSectionId: libraryItems.plexSectionId })
      .from(libraryItems)
      .all();
    const idsToRemove = existingRows
      .filter((row) => row.plexSectionId && syncedSectionIds.has(row.plexSectionId))
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

  let permanentCollection: PlexCollectionSyncResult | undefined;
  try {
    onProgress?.("Reconciling the permanent exhibition in Plex...");
    permanentCollection = await reconcilePermanentCollection(syncedPlexItems);
    if (permanentCollection.enabled) {
      onProgress?.(
        `Permanent exhibition: ${permanentCollection.added} added, ${permanentCollection.removed} removed, ${permanentCollection.failed} failed`
      );
    }
  } catch (error) {
    onProgress?.(
      `Warning: Plex permanent exhibition reconciliation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  const durationMs = Date.now() - startTime;
  onProgress?.(`Sync complete: ${itemsSynced} items, ${historyEntries} history entries, ${itemsRemoved} removed in ${(durationMs / 1000).toFixed(1)}s`);

  return {
    itemsSynced,
    historyEntries,
    itemsRemoved,
    durationMs,
    permanentCollection,
    permanentRelinked: recovery.relinked,
    warnings: recovery.warnings,
  };
}

interface MergedLibraryItem {
  id: string;
  plexSectionId: string | null;
  identityGuids: string;
  type: string;
  title: string;
  year: number | null;
  genre: string | null;
  plexRating: number | null;
  addedAt: number | null;
  latestMediaAddedAt: number | null;
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
  const playCount = Math.max(tautulli?.playCount ?? 0, plex.viewCount);
  const lastViewed = Math.max(tautulli?.lastPlayed ?? 0, plex.lastViewedAt ?? 0);

  return {
    id: plex.ratingKey,
    plexSectionId: plex.librarySectionId,
    identityGuids: JSON.stringify(plex.guids),
    type: plex.type,
    title: plex.title,
    year: plex.year,
    genre: plex.genres.length > 0 ? JSON.stringify(plex.genres) : null,
    plexRating: plex.rating,
    addedAt: plex.addedAt,
    latestMediaAddedAt: plex.latestMediaAddedAt,
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
            plexSectionId: sql`excluded.plex_section_id`,
            identityGuids: sql`excluded.identity_guids`,
            title: sql`excluded.title`,
            year: sql`excluded.year`,
            genre: sql`excluded.genre`,
            plexRating: sql`excluded.plex_rating`,
            addedAt: sql`excluded.added_at`,
            latestMediaAddedAt: sql`excluded.latest_media_added_at`,
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
