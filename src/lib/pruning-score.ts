export const SCORING_VERSION = 2;
export const DAY = 86400;
export const POLICY = { newDays: 60, recentDays: 30, minimumIdleDays: 180, historyDays: 180, staleDays: 7 };

export interface WatchSummary {
  plays: number;
  viewers: number;
  lastWatchedAt: number | null;
  unfinishedViewers: number;
  repeatPlays: number;
}

export interface ScoringItem {
  type: string;
  playCount: number;
  lastViewedAt: number | null;
  addedAt: number | null;
  latestMediaAddedAt: number | null;
  updatedAt: number | null;
  fileSizeBytes: number;
  episodeCount: number | null;
  isPermanent: boolean;
  possiblePermanentMatch: boolean;
  deletedFromSource: number | null;
  libraryEnabled: boolean;
  historyComplete: boolean;
  historySyncedAt: number | null;
  historyStartedAt: number | null;
  watch: WatchSummary;
}

export interface Recommendation {
  version: number;
  score: number;
  decision: "candidate" | "review" | "protected" | "insufficient_data" | "unavailable";
  dataQuality: "sufficient" | "limited";
  reasons: string[];
  cautions: string[];
  scoredAt: number;
  idleDays: number | null;
  viewers: number;
  unfinishedViewers: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const daysSince = (timestamp: number | null, now: number) =>
  timestamp && Number.isFinite(timestamp) && timestamp > 0 ? Math.max(0, (now - timestamp) / DAY) : null;

// Mid-ranks make tied sizes neutral. Cohorts are built per library, so the
// size of a complete TV series is not compared with a single movie.
export function sizePercentile(size: number, sorted: number[]): number {
  if (size <= 0 || sorted.length < 2) return 0.5;
  const bound = (upper: boolean) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] < size || (upper && sorted[mid] === size)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return clamp((bound(false) + bound(true) - 1) / (2 * (sorted.length - 1)));
}

export function recommend(item: ScoringItem, sortedSizes: number[], now: number): Recommendation {
  const reasons: string[] = [];
  const cautions: string[] = [];
  const result: Recommendation = {
    version: SCORING_VERSION, score: 0, decision: "review", dataQuality: "sufficient",
    reasons, cautions, scoredAt: now, idleDays: null,
    viewers: item.watch.viewers, unfinishedViewers: item.watch.unfinishedViewers,
  };
  if (item.isPermanent || item.possiblePermanentMatch || !item.libraryEnabled || item.deletedFromSource) {
    result.decision = item.deletedFromSource ? "unavailable" : "protected";
    reasons.push(item.isPermanent ? "Permanent collection: keep."
      : item.possiblePermanentMatch ? "Possible match for a missing permanent item: resolve the library move first."
      : item.deletedFromSource ? "No longer present in Plex; no verified space to reclaim."
      : "Library is excluded from sync.");
    return result;
  }

  const age = daysSince(item.addedAt, now);
  const contentAge = daysSince(Math.max(item.addedAt || 0, item.latestMediaAddedAt || 0), now);
  const lastWatched = Math.max(item.lastViewedAt || 0, item.watch.lastWatchedAt || 0);
  const watchedAgo = daysSince(lastWatched, now);
  const plays = Math.max(0, item.playCount, item.watch.plays);
  const idleDays = watchedAgo ?? (plays === 0 ? age : null);
  result.idleDays = idleDays === null ? null : Math.floor(idleDays);

  if (plays === 0) reasons.push(`No recorded plays${age === null ? "." : `; in library for ${Math.floor(age)} days.`}`);
  else if (watchedAgo !== null) reasons.push(`Last recorded viewing ${Math.floor(watchedAgo)} days ago.`);
  if (item.watch.viewers > 0) reasons.push(`Recorded use by ${item.watch.viewers} viewer${item.watch.viewers === 1 ? "" : "s"}.`);

  if (!item.historyComplete || !item.historySyncedAt) cautions.push("A complete history sync is required.");
  if (daysSince(item.updatedAt, now) === null || (daysSince(item.updatedAt, now) ?? Infinity) > POLICY.staleDays ||
      (daysSince(item.historySyncedAt, now) ?? Infinity) > POLICY.staleDays) {
    cautions.push("Library or watch data is over 7 days old or unavailable; sync before reviewing deletion.");
  }
  if (age === null) cautions.push("Date added is unknown.");
  if (plays > 0 && watchedAgo === null) cautions.push("Plays are recorded, but the last viewing date is unknown.");
  if (item.fileSizeBytes <= 0 || !Number.isFinite(item.fileSizeBytes)) cautions.push("Reclaimable size is unknown.");
  if (item.type === "show" && (!item.episodeCount || item.episodeCount <= 0)) cautions.push("Episode count is unknown.");
  if (plays > 0 && item.watch.plays === 0) cautions.push("Playback totals have no matching detailed history; unfinished viewing cannot be checked.");
  if (plays === 0 && (daysSince(item.historyStartedAt, now) ?? 0) < POLICY.historyDays) {
    cautions.push("Fewer than 180 days of recorded library history; absence of plays is weak evidence.");
  }

  // A season's episodes are one pass through a show, not independent rewatches.
  const units = item.type === "show" ? Math.max(1, item.episodeCount || 1) : 1;
  const equivalentPlays = plays / units;
  const idle = clamp(((idleDays ?? 0) - POLICY.recentDays) / (365 - POLICY.recentDays));
  const size = sizePercentile(item.fileSizeBytes, sortedSizes);
  let score = 55 * idle + 25 / (1 + equivalentPlays) + 15 * size + 5 * clamp((age ?? 0) / 365);
  score -= Math.min(15, Math.max(0, item.watch.viewers - 1) * 5);
  score -= Math.min(15, (item.watch.repeatPlays / units) * 10);
  if (size >= 0.75 && sortedSizes.length >= 4) reasons.push("Among the larger titles in this library.");
  if (item.watch.repeatPlays > 0) reasons.push("Repeat viewing lowers deletion priority.");

  let protectedItem = false;
  if (contentAge !== null && contentAge < POLICY.newDays) {
    protectedItem = true;
    score = Math.min(score, 20);
    reasons.unshift(`Added a title or episode within the last ${POLICY.newDays} days: keep for now.`);
  }
  if (watchedAgo !== null && watchedAgo < POLICY.recentDays) {
    protectedItem = true;
    score = Math.min(score, 20);
    reasons.unshift(`Viewed within the last ${POLICY.recentDays} days: keep for now.`);
  }
  if (item.watch.unfinishedViewers > 0) {
    protectedItem = true;
    score = Math.min(score, 49);
    reasons.unshift(`Unfinished viewing recorded for ${item.watch.unfinishedViewers} viewer${item.watch.unfinishedViewers === 1 ? "" : "s"}: check before deleting.`);
  }
  if (cautions.length) {
    result.dataQuality = "limited";
    score = Math.min(score, 49);
  }
  if ((idleDays ?? 0) < POLICY.minimumIdleDays) score = Math.min(score, 69);
  result.score = Math.round(Math.max(0, Math.min(100, score)));
  result.decision = protectedItem ? "protected" : cautions.length ? "insufficient_data"
    : result.score >= 70 ? "candidate" : "review";
  return result;
}

export function parseRecommendation(value: string | null | undefined): Recommendation | null {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}
