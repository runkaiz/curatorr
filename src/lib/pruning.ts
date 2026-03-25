import { db } from "@/db";
import { pruningConfig } from "@/db/schema";
import { sql } from "drizzle-orm";

interface Weights {
  engagement: number;
  recency: number;
  size: number;
  reach: number;
  resolution: number;
  staleness: number;
  gracePeriodDays: number;
  gracePeriodMaxScore: number;
}

const DEFAULT_WEIGHTS: Weights = {
  engagement: 0.3,
  recency: 0.25,
  size: 0.15,
  reach: 0.15,
  resolution: 0.05,
  staleness: 0.1,
  gracePeriodDays: 30,
  gracePeriodMaxScore: 50,
};

interface ItemRow {
  id: string;
  play_count: number;
  last_viewed_at: number | null;
  file_size_bytes: number;
  resolution: string | null;
  added_at: number | null;
  is_permanent: number;
  unique_users: number;
  completed_users: number;
  avg_percent: number;
}

export function loadWeights(): Weights {
  const rows = db
    .select({ key: pruningConfig.key, value: pruningConfig.value })
    .from(pruningConfig)
    .all();

  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    engagement: map.get("engagement_weight") ?? DEFAULT_WEIGHTS.engagement,
    recency: map.get("recency_weight") ?? DEFAULT_WEIGHTS.recency,
    size: map.get("size_weight") ?? DEFAULT_WEIGHTS.size,
    reach: map.get("reach_weight") ?? DEFAULT_WEIGHTS.reach,
    resolution: map.get("resolution_weight") ?? DEFAULT_WEIGHTS.resolution,
    staleness: map.get("staleness_weight") ?? DEFAULT_WEIGHTS.staleness,
    gracePeriodDays:
      map.get("grace_period_days") ?? DEFAULT_WEIGHTS.gracePeriodDays,
    gracePeriodMaxScore:
      map.get("grace_period_max_score") ?? DEFAULT_WEIGHTS.gracePeriodMaxScore,
  };
}

function computeEngagement(
  playCount: number,
  completedUsers: number,
  avgPercent: number,
  totalUsers: number
): number {
  const playFactor = Math.min(playCount / 10, 1.0);
  const completionFactor =
    totalUsers > 0 ? Math.min(completedUsers / totalUsers, 1.0) : 0;
  const depthFactor = avgPercent / 100;

  const engagement =
    0.5 * playFactor + 0.3 * completionFactor + 0.2 * depthFactor;
  return 1.0 - engagement;
}

function computeRecency(lastViewedAt: number | null, now: number): number {
  if (!lastViewedAt) return 1.0;
  const daysSince = (now - lastViewedAt) / 86400;
  return Math.min(daysSince / 730, 1.0);
}

function computeSizePercentile(
  fileSize: number,
  sortedSizes: number[]
): number {
  if (sortedSizes.length === 0 || fileSize <= 0) return 0;
  // Binary search for position
  let lo = 0;
  let hi = sortedSizes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedSizes[mid] < fileSize) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedSizes.length;
}

function computeReach(
  uniqueUsers: number,
  completedUsers: number,
  totalUsers: number
): number {
  if (totalUsers <= 1) return 0.5;
  if (uniqueUsers === 0) return 1.0;

  const watchRatio = uniqueUsers / totalUsers;
  const completeRatio = completedUsers / totalUsers;
  const reach = 0.6 * watchRatio + 0.4 * completeRatio;
  return 1.0 - reach;
}

function computeResolution(resolution: string | null): number {
  switch (resolution) {
    case "4K":
      return 0.0;
    case "1080p":
      return 0.2;
    case "720p":
      return 0.6;
    case "SD":
    case "480p":
      return 0.8;
    default:
      return 0.4;
  }
}

function computeStaleness(
  addedAt: number | null,
  playCount: number,
  now: number
): number {
  const daysSinceAdded = addedAt ? (now - addedAt) / 86400 : 365;

  if (playCount === 0) {
    return Math.min(daysSinceAdded / 365, 1.0);
  }

  const monthsSinceAdded = Math.max(daysSinceAdded / 30, 1);
  const velocity = playCount / monthsSinceAdded;
  return 1.0 - Math.min(velocity / 0.5, 1.0);
}

export function computeItemScore(
  item: ItemRow,
  ctx: {
    totalUsers: number;
    sortedSizes: number[];
    weights: Weights;
    now: number;
  }
): number {
  if (item.is_permanent) return 0;

  const { totalUsers, sortedSizes, weights, now } = ctx;

  const engagement = computeEngagement(
    item.play_count,
    item.completed_users,
    item.avg_percent,
    totalUsers
  );
  const recency = computeRecency(item.last_viewed_at, now);
  const size = computeSizePercentile(item.file_size_bytes, sortedSizes);
  const reach = computeReach(
    item.unique_users,
    item.completed_users,
    totalUsers
  );
  const resolution = computeResolution(item.resolution);
  const staleness = computeStaleness(item.added_at, item.play_count, now);

  let score = Math.round(
    100 *
      (weights.engagement * engagement +
        weights.recency * recency +
        weights.size * size +
        weights.reach * reach +
        weights.resolution * resolution +
        weights.staleness * staleness)
  );

  score = Math.max(0, Math.min(100, score));

  // Grace period for new items
  const daysSinceAdded = item.added_at ? (now - item.added_at) / 86400 : 365;
  if (daysSinceAdded < weights.gracePeriodDays) {
    score = Math.min(score, weights.gracePeriodMaxScore);
  }

  return score;
}

export function computeAllPruningScores(): void {
  const now = Math.floor(Date.now() / 1000);
  const weights = loadWeights();

  // Get total distinct users
  const userResult = db.get<{ count: number }>(
    sql`SELECT COUNT(DISTINCT user) as count FROM watch_history`
  );
  const totalUsers = userResult?.count ?? 0;

  // Get all items with aggregated watch stats in one query
  const items = db.all<ItemRow>(sql`
    SELECT
      li.id,
      li.play_count,
      li.last_viewed_at,
      li.file_size_bytes,
      li.resolution,
      li.added_at,
      (p.item_id IS NOT NULL) as is_permanent,
      COALESCE(wh.unique_users, 0) as unique_users,
      COALESCE(wh.completed_users, 0) as completed_users,
      COALESCE(wh.avg_percent, 0) as avg_percent
    FROM library_items li
    LEFT JOIN permanent_items p ON li.id = p.item_id
    LEFT JOIN (
      SELECT
        item_id,
        COUNT(DISTINCT user) as unique_users,
        COUNT(DISTINCT CASE WHEN was_completed = 1 THEN user END) as completed_users,
        AVG(percent_complete) as avg_percent
      FROM watch_history
      GROUP BY item_id
    ) wh ON li.id = wh.item_id
  `);

  // Build sorted sizes for percentile calculation
  const sortedSizes = items
    .map((i) => i.file_size_bytes)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);

  const ctx = { totalUsers, sortedSizes, weights, now };

  // Compute and batch update
  db.run(sql`BEGIN`);
  for (const item of items) {
    const score = computeItemScore(item, ctx);
    db.run(
      sql`UPDATE library_items SET pruning_score = ${score} WHERE id = ${item.id}`
    );
  }
  db.run(sql`COMMIT`);
}
