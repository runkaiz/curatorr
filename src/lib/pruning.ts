import { db } from "@/db";
import { libraryItems, permanentItems, pruningConfig, syncSections } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { recommend, SCORING_VERSION, type WatchSummary } from "./pruning-score";
import { getPossiblePermanentMatchIds } from "./library-identity";

interface HistoryUnit {
  item_id: string;
  user: string;
  media_key: string;
  plays: number;
  completed_plays: number;
  last_watched: number;
  last_incomplete: number | null;
  last_completed: number | null;
}

export function summarizeHistory(units: HistoryUnit[], type: string, episodeCount: number | null): WatchSummary {
  const users = new Map<string, { completed: Set<string>; unfinished: boolean }>();
  const summary: WatchSummary = { plays: 0, viewers: 0, lastWatchedAt: null, unfinishedViewers: 0, repeatPlays: 0 };
  for (const unit of units) {
    const user = users.get(unit.user) || { completed: new Set<string>(), unfinished: false };
    if (unit.completed_plays > 0 && unit.media_key) user.completed.add(unit.media_key);
    if ((unit.last_incomplete || 0) > (unit.last_completed || 0)) user.unfinished = true;
    users.set(unit.user, user);
    summary.plays += unit.plays;
    summary.lastWatchedAt = Math.max(summary.lastWatchedAt || 0, unit.last_watched);
    summary.repeatPlays += Math.max(0, unit.completed_plays - 1);
  }
  summary.viewers = users.size;
  summary.unfinishedViewers = Array.from(users.values()).filter((user) => user.unfinished ||
    (type === "show" && user.completed.size > 0 && (!episodeCount || user.completed.size < episodeCount))).length;
  return summary;
}

export function invalidatePruningScores(): void {
  db.delete(pruningConfig).where(eq(pruningConfig.key, "scores_computed_at")).run();
}

export function ensurePruningScores(): void {
  const version = db.select().from(pruningConfig).where(eq(pruningConfig.key, "scoring_version")).get()?.value;
  const computedAt = db.select().from(pruningConfig).where(eq(pruningConfig.key, "scores_computed_at")).get()?.value || 0;
  if (version !== SCORING_VERSION || Date.now() / 1000 - computedAt >= 3600) computeAllPruningScores();
}

export function computeAllPruningScores(now = Math.floor(Date.now() / 1000)): void {
  const items = db.select({ item: libraryItems, section: syncSections,
    isPermanent: sql<number>`${permanentItems.itemId} IS NOT NULL`,
  }).from(libraryItems)
    .leftJoin(permanentItems, eq(libraryItems.id, permanentItems.itemId))
    .leftJoin(syncSections, eq(libraryItems.plexSectionId, syncSections.key)).all();
  const history = db.all<HistoryUnit>(sql`
    SELECT item_id, user, media_key, COUNT(*) AS plays,
      SUM(was_completed) AS completed_plays, MAX(watched_at) AS last_watched,
      MAX(CASE WHEN was_completed = 0 AND percent_complete >= 10 THEN watched_at END) AS last_incomplete,
      MAX(CASE WHEN was_completed = 1 THEN watched_at END) AS last_completed
    FROM watch_history GROUP BY item_id, user, media_key
  `);
  const historyByItem = new Map<string, HistoryUnit[]>();
  for (const row of history) {
    const units = historyByItem.get(row.item_id) || [];
    units.push(row);
    historyByItem.set(row.item_id, units);
  }
  const cohorts = new Map<string, number[]>();
  const cohortKey = (item: typeof libraryItems.$inferSelect) => `${item.plexSectionId || "unknown"}:${item.type}`;
  for (const { item, section } of items) {
    if (item.deletedFromSource || section?.enabled === false || item.fileSizeBytes <= 0) continue;
    const sizes = cohorts.get(cohortKey(item)) || [];
    sizes.push(item.fileSizeBytes);
    cohorts.set(cohortKey(item), sizes);
  }
  for (const sizes of Array.from(cohorts.values())) sizes.sort((a, b) => a - b);

  // If recovery could not choose between copies, none of the possible
  // destination entries should become a deletion recommendation.
  const possibleMatches = getPossiblePermanentMatchIds();

  db.transaction((tx) => {
    for (const { item, section, isPermanent } of items) {
      const recommendation = recommend({
        ...item, isPermanent: !!isPermanent, possiblePermanentMatch: possibleMatches.has(item.id),
        libraryEnabled: section?.enabled !== false,
        historyComplete: section?.historyComplete || false,
        historySyncedAt: section?.historySyncedAt || null,
        historyStartedAt: section?.historyStartedAt || null,
        watch: summarizeHistory(historyByItem.get(item.id) || [], item.type, item.episodeCount),
      }, cohorts.get(cohortKey(item)) || [], now);
      tx.update(libraryItems).set({ pruningScore: recommendation.score, pruningDetails: JSON.stringify(recommendation) })
        .where(eq(libraryItems.id, item.id)).run();
    }
    for (const [key, value] of [["scoring_version", SCORING_VERSION], ["scores_computed_at", now]] as const) {
      tx.insert(pruningConfig).values({ key, value, updatedAt: now })
        .onConflictDoUpdate({ target: pruningConfig.key, set: { value, updatedAt: now } }).run();
    }
  });
}
