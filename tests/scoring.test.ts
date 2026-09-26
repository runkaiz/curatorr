import test from "node:test";
import assert from "node:assert/strict";
import { recommend, sizePercentile, DAY, type ScoringItem } from "../src/lib/pruning-score";
import { parseHistoryEntry, getHistory, getLibraryMediaInfo } from "../src/lib/tautulli";
import { getLibraryItems } from "../src/lib/plex";

const now = 1_800_000_000;
const sizes = [10, 20, 30, 40];
const base: ScoringItem = {
  type: "movie", playCount: 0, lastViewedAt: null, addedAt: now - 500 * DAY,
  latestMediaAddedAt: now - 500 * DAY, updatedAt: now, fileSizeBytes: 30, episodeCount: null,
  isPermanent: false, possiblePermanentMatch: false, deletedFromSource: null, libraryEnabled: true,
  historyComplete: true, historySyncedAt: now, historyStartedAt: now - 600 * DAY,
  watch: { plays: 0, viewers: 0, lastWatchedAt: null, unfinishedViewers: 0, repeatPlays: 0 },
};
const score = (patch: Partial<ScoringItem> = {}) => recommend({ ...base, ...patch }, sizes, now);

test("old unused titles rank above recent, new, and unfinished titles", () => {
  const candidate = score();
  assert.equal(candidate.decision, "candidate");
  assert.ok(candidate.score >= 70);
  for (const patch of [
    { latestMediaAddedAt: now - 2 * DAY },
    { lastViewedAt: now - 2 * DAY },
    { watch: { ...base.watch, unfinishedViewers: 1 } },
  ]) {
    const result = score(patch);
    assert.equal(result.decision, "protected");
    assert.ok(result.score < candidate.score);
  }
});

test("permanent, possibly permanent, missing and disabled items cannot be candidates", () => {
  for (const patch of [{ isPermanent: true }, { possiblePermanentMatch: true }, { deletedFromSource: now }, { libraryEnabled: false }]) {
    assert.equal(score(patch).score, 0);
    assert.notEqual(score(patch).decision, "candidate");
  }
});

test("missing or stale data cannot become a high-confidence deletion candidate", () => {
  for (const patch of [
    { historyComplete: false }, { historySyncedAt: now - 8 * DAY }, { updatedAt: null },
    { addedAt: null }, { fileSizeBytes: 0 }, { historyStartedAt: null },
    { historyStartedAt: now - 20 * DAY }, { playCount: 1, lastViewedAt: null },
    { type: "show", episodeCount: null },
  ]) {
    const result = score(patch);
    assert.ok(result.score < 70, JSON.stringify(patch));
    assert.equal(result.dataQuality, "limited");
  }
});

test("new episode grace is based on latest content, not the old series date", () => {
  const result = score({ type: "show", episodeCount: 24, latestMediaAddedAt: now - DAY });
  assert.equal(result.decision, "protected");
  assert.ok(result.reasons.some((reason) => reason.includes("episode")));
});

test("a season's worth of plays is not counted as repeated movie viewing", () => {
  const watched = { plays: 1, viewers: 1, lastWatchedAt: now - 500 * DAY, unfinishedViewers: 0, repeatPlays: 0 };
  const movie = score({ playCount: 1, lastViewedAt: watched.lastWatchedAt, watch: watched });
  const show = score({ type: "show", episodeCount: 24, playCount: 24,
    lastViewedAt: watched.lastWatchedAt, watch: { ...watched, plays: 24 } });
  assert.equal(movie.score, show.score);
});

test("repeat use and more viewers reduce priority; recent history overrides stale totals", () => {
  const watched = { plays: 1, viewers: 1, lastWatchedAt: now - 500 * DAY, unfinishedViewers: 0, repeatPlays: 0 };
  const one = score({ playCount: 1, watch: watched });
  assert.ok(score({ playCount: 3, watch: { ...watched, plays: 3, repeatPlays: 2 } }).score < one.score);
  assert.ok(score({ playCount: 3, watch: { ...watched, plays: 3, viewers: 3 } }).score < one.score);
  assert.equal(score({ watch: { ...watched, lastWatchedAt: now - DAY } }).decision, "protected");
});

test("cohort sizes handle ties, small libraries and extremes fairly", () => {
  assert.equal(sizePercentile(20, [20, 20, 20]), 0.5);
  assert.equal(sizePercentile(20, [20]), 0.5);
  assert.equal(sizePercentile(10, sizes), 0);
  assert.equal(sizePercentile(40, sizes), 1);
  assert.ok(score({ addedAt: now - 179 * DAY, latestMediaAddedAt: now - 179 * DAY }).score < 70);
});

test("episode history attaches to the show and retains episode identity", () => {
  const entry = parseHistoryEntry({ media_type: "episode", rating_key: "ep-4", grandparent_rating_key: "show-2",
    user: "viewer", date: now, percent_complete: 99, watched_status: "1" });
  assert.equal(entry?.ratingKey, "show-2");
  assert.equal(entry?.mediaKey, "ep-4");
  assert.equal(entry?.wasCompleted, true);
  const moved = parseHistoryEntry({ media_type: "episode", rating_key: "new-ep-key", grandparent_rating_key: "new-show",
    parent_media_index: "1", media_index: "4", user: "viewer", date: now });
  assert.equal(moved?.mediaKey, "s1e4");
  assert.equal(parseHistoryEntry({ media_type: "episode", rating_key: "ep-4", user: "viewer", date: now }), null);
  assert.equal(parseHistoryEntry({ media_type: "track", rating_key: "track-1", user: "viewer", date: now }), null);
});

test("history fetch reads past the old 10,000 row limit and rejects partial pages", async () => {
  const original = globalThis.fetch;
  process.env.TAUTULLI_URL = "http://tautulli.invalid";
  process.env.TAUTULLI_API_KEY = "test";
  try {
    let calls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("grouping"), "1");
      assert.equal(url.searchParams.get("include_activity"), "0");
      assert.equal(url.searchParams.get("order_dir"), "asc");
      const start = Number(url.searchParams.get("start"));
      calls++;
      const data = Array.from({ length: Math.min(500, 10001 - start) }, (_, i) => ({
        media_type: "movie", rating_key: "movie", user: "viewer", date: now - start - i,
      }));
      return Response.json({ response: { result: "success", data: { recordsFiltered: 10001, data } } });
    }) as typeof fetch;
    assert.equal((await getHistory("movies")).length, 10001);
    assert.equal(calls, 21);
    globalThis.fetch = (async () => Response.json({ response: { result: "success", data: { recordsFiltered: 2, data: [] } } })) as typeof fetch;
    await assert.rejects(getHistory("movies"), /before all records/);
  } finally { globalThis.fetch = original; }
});

test("unknown Tautulli play counts stay unknown instead of overwriting Plex usage with zero", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ response: { result: "success", data: {
      recordsFiltered: 1, data: [{ rating_key: "one", play_count: null, file_size: 20 }],
    } } })) as typeof fetch;
    assert.equal((await getLibraryMediaInfo("movies"))[0].playCount, null);
  } finally { globalThis.fetch = original; }
});

test("an incomplete Plex catalog cannot certify that a title or new episode is absent", async () => {
  const original = globalThis.fetch;
  process.env.PLEX_URL = "http://plex.invalid"; process.env.PLEX_TOKEN = "test";
  try {
    globalThis.fetch = (async () => Response.json({ MediaContainer: { totalSize: 1, Metadata: [] } })) as typeof fetch;
    await assert.rejects(getLibraryItems("tv", "show"), /before all items/);
    globalThis.fetch = (async (input: string | URL | Request) => {
      const episodes = new URL(String(input)).searchParams.get("type") === "4";
      return Response.json({ MediaContainer: { totalSize: 1, Metadata: episodes ? [] : [{ ratingKey: "show", title: "Show" }] } });
    }) as typeof fetch;
    await assert.rejects(getLibraryItems("tv", "show", true), /episode catalog ended early/);
  } finally { globalThis.fetch = original; }
});
