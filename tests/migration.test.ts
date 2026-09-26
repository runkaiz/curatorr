import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("upgrade preserves legacy permanent records and history, and supports distinct episode events", () => {
  const directory = mkdtempSync(join(tmpdir(), "curatorr-migration-"));
  const filename = join(directory, "legacy.db");
  const legacy = new Database(filename);
  legacy.exec(`
    CREATE TABLE library_items (id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL,
      year INTEGER, genre TEXT, plex_rating REAL, added_at INTEGER, last_viewed_at INTEGER,
      play_count INTEGER NOT NULL DEFAULT 0, file_size_bytes INTEGER NOT NULL DEFAULT 0,
      resolution TEXT, bitrate INTEGER, episode_count INTEGER, file_path TEXT, thumb_url TEXT,
      updated_at INTEGER, pruning_score INTEGER, deleted_from_source INTEGER, plex_section_id TEXT);
    CREATE TABLE watch_history (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL,
      user TEXT NOT NULL, watched_at INTEGER NOT NULL, percent_complete INTEGER NOT NULL DEFAULT 0,
      was_completed INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX watch_history_unique_idx ON watch_history(item_id, user, watched_at);
    CREATE TABLE permanent_items (item_id TEXT PRIMARY KEY, note TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE sync_sections (key TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, enabled INTEGER DEFAULT 1);
    INSERT INTO library_items (id, type, title) VALUES ('old-anime', 'show', 'Anime'), ('movie', 'movie', 'Movie');
    INSERT INTO permanent_items VALUES ('old-anime', 'Original handwritten note', 1234);
    INSERT INTO watch_history (item_id, user, watched_at) VALUES ('movie', 'viewer', 2345);
    INSERT INTO sync_sections (key, title, type) VALUES ('tv', 'TV', 'show');
  `);
  legacy.close();
  try {
    // Each import is a fresh app process: also verifies that migrations can run twice.
    const code = 'import { db } from "./src/db"; import { sql } from "drizzle-orm"; db.get(sql`SELECT COUNT(*) FROM library_items`);';
    for (let i = 0; i < 2; i++) execFileSync(join(process.cwd(), "node_modules/.bin/tsx"), ["-e", code], {
      env: { ...process.env, DATABASE_URL: filename }, stdio: "pipe",
    });
    const upgraded = new Database(filename);
    try {
      assert.deepEqual(upgraded.prepare("SELECT * FROM permanent_items").get(), { item_id: "old-anime", note: "Original handwritten note", created_at: 1234 });
      assert.equal((upgraded.prepare("SELECT media_key FROM watch_history").get() as { media_key: string }).media_key, "movie");
      assert.equal((upgraded.prepare("SELECT history_complete FROM sync_sections").get() as { history_complete: number }).history_complete, 0);
      upgraded.prepare("INSERT INTO watch_history (item_id,user,watched_at,media_key) VALUES (?,?,?,?)").run("old-anime", "viewer", 4567, "s1e1");
      upgraded.prepare("INSERT INTO watch_history (item_id,user,watched_at,media_key) VALUES (?,?,?,?)").run("old-anime", "viewer", 4567, "s1e2");
      assert.equal((upgraded.prepare("SELECT COUNT(*) count FROM watch_history").get() as { count: number }).count, 3);
    } finally { upgraded.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
