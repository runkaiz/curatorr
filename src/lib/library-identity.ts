import { db } from "@/db";
import { libraryItems, permanentItems, plexItemAliases, watchHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { PlexMediaItem } from "./types";

interface Identity {
  id: string;
  type: string;
  title: string;
  year: number | null;
  guids: string[];
}

function titleKey(item: Identity): string | null {
  return item.year === null ? null
    : `${item.type}:${item.title.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")}:${item.year}`;
}

export function matchMovedItems(missing: Identity[], current: Identity[]) {
  const matches: { oldId: string; newId: string; method: "identity" | "title/year" }[] = [];
  const unresolved: string[] = [];
  const proposals = missing.map((old) => {
    let method: "identity" | "title/year" = "identity";
    let candidates = current.filter((item) => item.type === old.type &&
      old.guids.some((guid) => item.guids.includes(guid)));
    // Older Curatorr versions did not store GUIDs. Only use a unique exact
    // title/type/year match, never fuzzy matching or a conflicting known ID.
    if (!old.guids.length) {
      method = "title/year";
      const key = titleKey(old);
      candidates = key && missing.filter((item) => titleKey(item) === key).length === 1
        ? current.filter((item) => titleKey(item) === key) : [];
    }
    return { old, candidates, method };
  });
  for (const { old, candidates, method } of proposals) {
    if (candidates.length === 1 && proposals.filter((proposal) => proposal.candidates.some((item) => item.id === candidates[0].id)).length === 1) {
      matches.push({ oldId: old.id, newId: candidates[0].id, method });
    } else {
      unresolved.push(old.id);
    }
  }
  return { matches, unresolved };
}

function readGuids(value: string | null): string[] {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((guid): guid is string => typeof guid === "string") : [];
  } catch { return []; }
}

export function getPossiblePermanentMatchIds(): Set<string> {
  const items = db.select().from(libraryItems).all();
  const permanentIds = new Set(db.select().from(permanentItems).all().map((row) => row.itemId));
  const candidates = new Set<string>();
  for (const old of items.filter((item) => item.deletedFromSource && permanentIds.has(item.id))) {
    const guids = readGuids(old.identityGuids);
    for (const item of items) {
      if (item.deletedFromSource || old.type !== item.type) continue;
      if (guids.some((guid) => readGuids(item.identityGuids).includes(guid)) ||
          (!guids.length && old.title.normalize("NFKC").trim().toLowerCase() === item.title.normalize("NFKC").trim().toLowerCase() &&
            (old.year === null || item.year === null || old.year === item.year))) candidates.add(item.id);
    }
  }
  return candidates;
}

export function relinkPermanentItems(
  current: PlexMediaItem[],
  scannedSections: Set<string>,
  availableSections: Set<string>
) {
  const known = new Set(current.map((item) => item.ratingKey));
  const permanent = db.select({ item: libraryItems, permanent: permanentItems })
    .from(libraryItems).innerJoin(permanentItems, eq(permanentItems.itemId, libraryItems.id)).all();
  const missing = permanent.filter(({ item }) => !known.has(item.id) &&
    (!item.plexSectionId || scannedSections.has(item.plexSectionId) || !availableSections.has(item.plexSectionId)));
  const { matches, unresolved } = matchMovedItems(
    missing.map(({ item }) => ({ ...item, guids: readGuids(item.identityGuids) })),
    current.map((item) => ({ ...item, id: item.ratingKey }))
  );
  const warnings: string[] = [];
  db.transaction((tx) => {
    for (const match of matches) {
      const old = missing.find(({ item }) => item.id === match.oldId)!;
      const target = tx.select().from(permanentItems).where(eq(permanentItems.itemId, match.newId)).get();
      const notes = Array.from(new Set([old.permanent.note, target?.note].filter(Boolean))).join("\n\n") || null;
      const createdAt = Math.min(old.permanent.createdAt, target?.createdAt ?? Infinity);
      tx.insert(permanentItems).values({ itemId: match.newId, note: notes, createdAt })
        .onConflictDoUpdate({ target: permanentItems.itemId, set: { note: notes, createdAt } }).run();
      // Copy with conflict handling before deleting the stale row; this also
      // preserves history imported under a series' previous Plex key.
      for (const row of tx.select().from(watchHistory).where(eq(watchHistory.itemId, match.oldId)).all()) {
        const { id: _id, ...history } = row;
        tx.insert(watchHistory).values({ ...history, itemId: match.newId,
          mediaKey: old.item.type === "movie" ? match.newId : history.mediaKey,
        }).onConflictDoNothing().run();
      }
      tx.update(plexItemAliases).set({ itemId: match.newId }).where(eq(plexItemAliases.itemId, match.oldId)).run();
      tx.insert(plexItemAliases).values({ oldId: match.oldId, itemId: match.newId })
        .onConflictDoUpdate({ target: plexItemAliases.oldId, set: { itemId: match.newId } }).run();
      tx.delete(libraryItems).where(eq(libraryItems.id, match.oldId)).run();
      if (match.method === "title/year") warnings.push(`Reconnected permanent item "${old.item.title}" by its unique title and year; please review.`);
    }
  });
  for (const id of unresolved) {
    const old = missing.find(({ item }) => item.id === id)!;
    db.update(libraryItems).set({ deletedFromSource: old.item.deletedFromSource || Math.floor(Date.now() / 1000) })
      .where(eq(libraryItems.id, id)).run();
    warnings.push(`Permanent item "${old.item.title}" could not be uniquely reconnected. Its original record and note are retained.`);
  }
  return { relinked: matches.length, warnings };
}
