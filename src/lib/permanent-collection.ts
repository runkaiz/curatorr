import { db } from "@/db";
import { libraryItems, permanentItems, syncSections } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getItemMetadata,
  getLibraryItems,
  getLibrarySections,
  setItemCollectionMembership,
} from "./plex";
import type { PlexCollectionSyncResult, PlexMediaItem } from "./types";

const DEFAULT_COLLECTION_NAME = "Permanent Exhibition";

let reconciliationQueue: Promise<void> = Promise.resolve();

export function isPermanentCollectionSyncEnabled(): boolean {
  return (
    process.env.PLEX_PERMANENT_COLLECTION_SYNC?.trim().toLowerCase() === "true"
  );
}

export function getPermanentCollectionName(): string {
  return (
    process.env.PLEX_PERMANENT_COLLECTION_NAME?.trim() ||
    DEFAULT_COLLECTION_NAME
  );
}

function createResult(enabled: boolean): PlexCollectionSyncResult {
  return {
    enabled,
    collectionName: getPermanentCollectionName(),
    scanned: 0,
    added: 0,
    removed: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
}

function hasCollection(item: PlexMediaItem, collectionName: string): boolean {
  const normalizedName = collectionName.toLowerCase();
  return item.collections.some(
    (name) => name.trim().toLowerCase() === normalizedName
  );
}

async function loadConfiguredPlexItems(): Promise<PlexMediaItem[]> {
  const allSections = await getLibrarySections();
  const savedSections = db.select().from(syncSections).all();
  const enabledKeys = new Set(
    savedSections.filter((section) => section.enabled).map((section) => section.key)
  );
  const sections =
    savedSections.length > 0
      ? allSections.filter((section) => enabledKeys.has(section.key))
      : allSections;

  const sectionItems = await Promise.all(
    sections.map((section) => getLibraryItems(section.key, section.type))
  );
  return sectionItems.flat();
}

async function reconcileNow(
  suppliedItems?: PlexMediaItem[]
): Promise<PlexCollectionSyncResult> {
  if (!isPermanentCollectionSyncEnabled()) {
    return createResult(false);
  }

  const result = createResult(true);
  const collectionName = result.collectionName;
  const items = suppliedItems || (await loadConfiguredPlexItems());
  const permanentIds = new Set(
    db
      .select({ itemId: permanentItems.itemId })
      .from(permanentItems)
      .all()
      .map((row) => row.itemId)
  );

  result.scanned = items.length;

  for (const item of items) {
    const shouldInclude = permanentIds.has(item.ratingKey);
    const isIncluded = hasCollection(item, collectionName);

    if (shouldInclude === isIncluded) {
      result.unchanged += 1;
      continue;
    }

    if (!item.librarySectionId) {
      result.skipped += 1;
      result.errors.push(
        `${item.title} (${item.ratingKey}): Plex library section is unknown`
      );
      continue;
    }

    try {
      let editItem = item;
      if (shouldInclude) {
        const metadata = await getItemMetadata(item.ratingKey);
        if (!metadata) {
          throw new Error("Could not load current Plex collection tags");
        }
        metadata.librarySectionId =
          metadata.librarySectionId || item.librarySectionId;
        metadata.type = item.type;
        editItem = metadata;

        // The section listing can omit optional collection elements. Avoid a
        // write when the full metadata response shows membership already set.
        if (hasCollection(editItem, collectionName)) {
          result.unchanged += 1;
          continue;
        }
      }

      await setItemCollectionMembership(
        editItem,
        collectionName,
        shouldInclude
      );
      if (shouldInclude) result.added += 1;
      else result.removed += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(
        `${item.title} (${item.ratingKey}): ${
          error instanceof Error ? error.message : "Unknown Plex error"
        }`
      );
    }
  }

  return result;
}

/**
 * Serialize write-back operations within this process. A manual permanent-item
 * change and a full library sync can otherwise edit the same Plex metadata at
 * the same time.
 */
export function reconcilePermanentCollection(
  items?: PlexMediaItem[]
): Promise<PlexCollectionSyncResult> {
  const task = reconciliationQueue.then(
    () => reconcileNow(items),
    () => reconcileNow(items)
  );
  reconciliationQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

export async function reconcilePermanentItem(
  itemId: string
): Promise<PlexCollectionSyncResult> {
  if (!isPermanentCollectionSyncEnabled()) {
    return createResult(false);
  }

  const row = db
    .select({
      plexSectionId: libraryItems.plexSectionId,
      type: libraryItems.type,
    })
    .from(libraryItems)
    .where(eq(libraryItems.id, itemId))
    .get();

  const item = await getItemMetadata(itemId);
  if (!row || !item) {
    const result = createResult(true);
    result.skipped = 1;
    result.errors.push(`Plex item ${itemId} is unavailable`);
    return result;
  }

  item.librarySectionId = item.librarySectionId || row.plexSectionId;
  item.type = row.type === "show" ? "show" : "movie";
  return reconcilePermanentCollection([item]);
}
