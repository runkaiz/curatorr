import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { PlexMediaItem } from "../src/lib/types";

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

test("scoring, library moves, and API behavior with an isolated database", async (t) => {
  process.env.DATABASE_URL = ":memory:";
  process.env.PLEX_PERMANENT_COLLECTION_SYNC = "false";
  const { db } = await import("../src/db");
  const { libraryItems, permanentItems, watchHistory, syncSections, plexItemAliases, pruningConfig } = await import("../src/db/schema");
  const { computeAllPruningScores, summarizeHistory, invalidatePruningScores } = await import("../src/lib/pruning");
  const { relinkPermanentItems, matchMovedItems } = await import("../src/lib/library-identity");
  const { GET: getLibrary } = await import("../src/app/api/library/route");
  const { GET: getStats } = await import("../src/app/api/stats/route");
  const { eq } = await import("drizzle-orm");

  const section = (key: string, title: string, type = "show", enabled = true) => db.insert(syncSections).values({
    key, title, type, enabled, historyComplete: true, historySyncedAt: now, historyStartedAt: now - 600 * DAY,
  }).run();
  const add = (id: string, patch: Partial<typeof libraryItems.$inferInsert> = {}) => db.insert(libraryItems).values({
    id, title: id, type: "movie", year: 2000, plexSectionId: "movies", addedAt: now - 500 * DAY,
    latestMediaAddedAt: now - 500 * DAY, updatedAt: now, fileSizeBytes: 30, ...patch,
  }).run();
  const plex = (id: string, patch: Partial<PlexMediaItem> = {}): PlexMediaItem => ({
    ratingKey: id, librarySectionId: "anime", guids: [], title: "Moved Anime", year: 2000,
    rating: null, addedAt: now - 500 * DAY, latestMediaAddedAt: now - 500 * DAY,
    lastViewedAt: null, viewCount: 0, genres: [], collections: [], fileSize: 30,
    resolution: null, bitrate: null, episodeCount: 12, filePath: null, thumbPath: null, type: "show", ...patch,
  });
  t.beforeEach(() => {
    db.delete(plexItemAliases).run(); db.delete(watchHistory).run(); db.delete(permanentItems).run();
    db.delete(libraryItems).run(); db.delete(syncSections).run(); db.delete(pruningConfig).run();
    section("movies", "Movies", "movie"); section("tv", "TV"); section("anime", "Anime");
  });

  await t.test("per-viewer progress survives completed episodes and resumed movies", () => {
    const unit = { item_id: "one", user: "viewer", media_key: "ep1", plays: 2, completed_plays: 1,
      last_watched: now - DAY, last_incomplete: now - 2 * DAY, last_completed: now - DAY };
    assert.equal(summarizeHistory([unit], "movie", null).unfinishedViewers, 0);
    assert.equal(summarizeHistory([unit], "show", 12).unfinishedViewers, 1);
    assert.equal(summarizeHistory([unit, { ...unit, user: "other", completed_plays: 0, last_completed: null }], "movie", null).unfinishedViewers, 1);
    assert.equal(summarizeHistory([{ ...unit, last_incomplete: now }], "movie", null).unfinishedViewers, 1);
  });

  await t.test("candidate API, pagination and space totals honor library and protection filters", async () => {
    add("movie-candidate"); add("movie-two");
    add("anime-candidate", { type: "show", episodeCount: 12, plexSectionId: "anime" });
    add("new", { latestMediaAddedAt: now - DAY });
    add("protected"); db.insert(permanentItems).values({ itemId: "protected", createdAt: now }).run();
    const response = await getLibrary(new NextRequest("http://localhost/api/library?filter=high_score&section=movies&limit=1&sort=score"));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.total, 2); assert.equal(data.totalPages, 2); assert.equal(data.items.length, 1);
    assert.equal(data.items[0].sectionTitle, "Movies");
    assert.equal(data.items[0].recommendation.decision, "candidate");
    assert.ok(data.items[0].recommendation.reasons.length);
    const stats = await (await getStats()).json();
    assert.equal(stats.purgeableCount, 3); assert.equal(stats.purgeableSize, 90);
    const invalid = await getLibrary(new NextRequest("http://localhost/api/library?page=NaN&limit=-9&filter=high_score"));
    assert.equal(invalid.status, 200);
  });

  await t.test("unrelated giant shows do not change a movie's size ranking", () => {
    add("movie-one", { fileSizeBytes: 20 }); add("movie-two", { fileSizeBytes: 40 });
    computeAllPruningScores(now);
    const original = db.select().from(libraryItems).where(eq(libraryItems.id, "movie-one")).get()!.pruningScore;
    for (let i = 0; i < 10; i++) add(`show-${i}`, { plexSectionId: "tv", type: "show", episodeCount: 100, fileSizeBytes: 1000 + i });
    computeAllPruningScores(now);
    assert.equal(db.select().from(libraryItems).where(eq(libraryItems.id, "movie-one")).get()!.pruningScore, original);
  });

  await t.test("completion filters never label a series fully watched after one episode", async () => {
    add("show", { type: "show", episodeCount: 12, plexSectionId: "anime" });
    add("movie");
    for (const id of ["movie", "show"]) db.insert(watchHistory).values({
      itemId: id, user: "viewer", mediaKey: id === "show" ? "ep1" : id, watchedAt: now - 300 * DAY,
      percentComplete: 100, wasCompleted: true,
    }).run();
    const data = await (await getLibrary(new NextRequest("http://localhost/api/library?filter=fully_watched"))).json();
    assert.deepEqual(data.items.map((item: { id: string }) => item.id), ["movie"]);
    const show = db.select().from(libraryItems).where(eq(libraryItems.id, "show")).get()!;
    assert.equal(JSON.parse(show.pruningDetails!).decision, "protected");
    const noPlays = await (await getLibrary(new NextRequest("http://localhost/api/library?filter=never_watched"))).json();
    assert.equal(noPlays.total, 0);
  });

  await t.test("stable IDs relink moved permanent items and preserve notes, dates, history and aliases", () => {
    add("old", { type: "show", title: "Old title", plexSectionId: "tv", identityGuids: '["tvdb://42"]', deletedFromSource: now });
    add("new", { type: "show", title: "New title", plexSectionId: "anime", identityGuids: '["tvdb://42"]' });
    db.insert(permanentItems).values({ itemId: "old", note: "Family favorite", createdAt: now - 1000 }).run();
    db.insert(watchHistory).values({ itemId: "old", user: "viewer", mediaKey: "ep1", watchedAt: now - DAY, percentComplete: 100, wasCompleted: true }).run();
    const result = relinkPermanentItems([plex("new", { title: "New title", guids: ["tvdb://42"] })], new Set(["tv", "anime"]), new Set(["tv", "anime"]));
    assert.equal(result.relinked, 1);
    assert.equal(db.select().from(libraryItems).where(eq(libraryItems.id, "old")).get(), undefined);
    assert.equal(db.select().from(permanentItems).get()!.itemId, "new");
    assert.equal(db.select().from(permanentItems).get()!.note, "Family favorite");
    assert.equal(db.select().from(permanentItems).get()!.createdAt, now - 1000);
    assert.equal(db.select().from(watchHistory).get()!.itemId, "new");
    assert.deepEqual(db.select().from(plexItemAliases).get(), { oldId: "old", itemId: "new" });
    assert.equal(relinkPermanentItems([plex("new")], new Set(["tv", "anime"]), new Set(["tv", "anime"])).relinked, 0);
  });

  await t.test("legacy title/year fallback is unique, and ambiguous destination copies stay protected", () => {
    const old = { id: "old", title: "Moved Anime", year: 2000, type: "show", guids: [] };
    assert.equal(matchMovedItems([old], [{ ...old, id: "new" }]).matches[0].method, "title/year");
    assert.equal(matchMovedItems([{ ...old, guids: ["tvdb://1"] }], [{ ...old, id: "new", guids: ["tvdb://2"] }]).matches.length, 0);
    assert.equal(matchMovedItems([{ ...old, guids: ["tvdb://1"] }, { ...old, id: "old2", guids: ["tvdb://1"] }],
      [{ ...old, id: "new", guids: ["tvdb://1"] }]).matches.length, 0);
    add("old", { title: old.title, type: "show", plexSectionId: "tv" });
    db.insert(permanentItems).values({ itemId: "old", note: "Keep this", createdAt: now }).run();
    for (const id of ["new1", "new2"]) add(id, { title: old.title, type: "show", episodeCount: 12, plexSectionId: "anime" });
    const result = relinkPermanentItems([plex("new1"), plex("new2")], new Set(["tv", "anime"]), new Set(["tv", "anime"]));
    assert.equal(result.relinked, 0); assert.ok(result.warnings.length);
    assert.equal(db.select().from(permanentItems).get()!.itemId, "old");
    computeAllPruningScores(now);
    for (const row of db.select().from(libraryItems).all()) assert.equal(row.pruningScore, 0);
  });

  await t.test("ambiguous permanent matches retain Plex collections and cannot be deleted", async () => {
    add("old", { title: "Moved Anime", type: "show", plexSectionId: "tv", deletedFromSource: now });
    add("new", { title: "Moved Anime", type: "show", plexSectionId: "anime" });
    db.insert(permanentItems).values({ itemId: "old", note: "Preserve", createdAt: now }).run();
    const originalFetch = globalThis.fetch;
    process.env.PLEX_PERMANENT_COLLECTION_SYNC = "true";
    process.env.SEERR_URL = "http://seerr.invalid"; process.env.SEERR_API_KEY = "test";
    try {
      globalThis.fetch = (async () => { throw new Error("Protected items must not cause external changes"); }) as typeof fetch;
      const { reconcilePermanentCollection } = await import("../src/lib/permanent-collection");
      const collection = await reconcilePermanentCollection([plex("new", { collections: ["Permanent Exhibition"] })]);
      assert.equal(collection.skipped, 1); assert.equal(collection.removed, 0);
      const { POST: deleteItems } = await import("../src/app/api/delete/route");
      const response = await deleteItems(new NextRequest("http://localhost/api/delete", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ["old", "new"] }),
      }));
      const result = await response.json();
      assert.equal(result.succeeded, 0); assert.equal(result.failed, 2);
      assert.equal(db.select().from(libraryItems).all().length, 2);
    } finally { globalThis.fetch = originalFetch; process.env.PLEX_PERMANENT_COLLECTION_SYNC = "false"; }
  });

  await t.test("full sync recovers Anime moves before importing old-key history and catches newly added episodes", async () => {
    add("old-anime", { title: "Moved Anime", type: "show", plexSectionId: "tv" });
    db.insert(permanentItems).values({ itemId: "old-anime", note: "Keep forever", createdAt: now - 1000 }).run();
    process.env.PLEX_URL = "http://plex.invalid"; process.env.PLEX_TOKEN = "test";
    process.env.TAUTULLI_URL = "http://tautulli.invalid"; process.env.TAUTULLI_API_KEY = "test";
    const originalFetch = globalThis.fetch;
    const movie = { ratingKey: "movie", title: "Movie", year: 2000, type: "movie", addedAt: now - 500 * DAY,
      viewCount: 4, lastViewedAt: now - DAY, Media: [{ Part: [{ size: 100 }] }] };
    const anime = { ratingKey: "new-anime", title: "Moved Anime", year: 2000, type: "show", leafCount: 12,
      addedAt: now - 500 * DAY, guid: "plex://show/abc", Guid: [{ id: "tvdb://123" }] };
    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        assert.ok(!init?.method || init.method === "GET", "sync fixture must not change external media");
        const url = new URL(String(input));
        if (url.hostname === "plex.invalid") {
          if (url.pathname === "/library/sections") return Response.json({ MediaContainer: { Directory: [
            { key: "tv", title: "TV", type: "show" }, { key: "anime", title: "Anime", type: "show" }, { key: "movies", title: "Movies", type: "movie" },
          ] } });
          const id = url.pathname.split("/")[3];
          const metadata = url.searchParams.get("type") === "4"
            ? (id === "anime" ? [{ ratingKey: "ep1", grandparentRatingKey: "new-anime", addedAt: now - DAY }] : [])
            : id === "anime" ? [anime] : id === "movies" ? [movie] : [];
          return Response.json({ MediaContainer: { totalSize: metadata.length, size: metadata.length, Metadata: metadata } });
        }
        const cmd = url.searchParams.get("cmd");
        const sectionId = url.searchParams.get("section_id");
        const data = cmd === "get_history" ? (sectionId === "tv" ? [{ media_type: "episode", rating_key: "old-ep1",
          grandparent_rating_key: "old-anime", user: "viewer", date: now - 300 * DAY, watched_status: 1, percent_complete: 100 }] : [])
          : sectionId === "movies" ? [{ rating_key: "movie", file_size: 100, play_count: 0, last_played: now - 400 * DAY }]
          : sectionId === "anime" ? [{ rating_key: "new-anime", file_size: 1200, play_count: 0 }] : [];
        return Response.json({ response: { result: "success", data: { recordsFiltered: data.length, data } } });
      }) as typeof fetch;
      const { syncLibrary } = await import("../src/lib/sync");
      const result = await syncLibrary();
      assert.equal(result.permanentRelinked, 1);
      assert.equal(result.historyEntries, 1);
      assert.ok(result.warnings?.some((warning) => warning.includes("title and year")));
      assert.equal(db.select().from(permanentItems).get()!.itemId, "new-anime");
      assert.equal(db.select().from(permanentItems).get()!.note, "Keep forever");
      assert.equal(db.select().from(watchHistory).get()!.itemId, "new-anime");
      const target = db.select().from(libraryItems).where(eq(libraryItems.id, "new-anime")).get()!;
      assert.equal(target.latestMediaAddedAt, now - DAY); assert.equal(target.pruningScore, 0);
      const mergedMovie = db.select().from(libraryItems).where(eq(libraryItems.id, "movie")).get()!;
      assert.equal(mergedMovie.playCount, 4); assert.equal(mergedMovie.lastViewedAt, now - DAY);
      assert.equal((await syncLibrary()).permanentRelinked, 0);
      assert.equal(db.select().from(watchHistory).all().length, 1);
    } finally { globalThis.fetch = originalFetch; }
  });

  await t.test("changing permanence invalidates cached rankings immediately", async () => {
    add("candidate"); computeAllPruningScores(now);
    db.insert(permanentItems).values({ itemId: "candidate", createdAt: now }).run();
    invalidatePruningScores();
    const result = await (await getLibrary(new NextRequest("http://localhost/api/library?filter=high_score&hide_permanent=false"))).json();
    assert.equal(result.total, 0);
    assert.equal(db.select().from(libraryItems).get()!.pruningScore, 0);
  });
});
