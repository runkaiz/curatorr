import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbPath =
  process.env.DATABASE_URL || path.join(process.cwd(), "data", "curator.db");

// Ensure the data directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Auto-create tables if they don't exist (for Docker first-run)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS library_items (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    year INTEGER,
    genre TEXT,
    plex_rating REAL,
    added_at INTEGER,
    last_viewed_at INTEGER,
    play_count INTEGER DEFAULT 0 NOT NULL,
    file_size_bytes INTEGER DEFAULT 0 NOT NULL,
    resolution TEXT,
    bitrate INTEGER,
    episode_count INTEGER,
    file_path TEXT,
    thumb_url TEXT,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS watch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    user TEXT NOT NULL,
    watched_at INTEGER NOT NULL,
    percent_complete INTEGER DEFAULT 0 NOT NULL,
    was_completed INTEGER DEFAULT 0 NOT NULL
  );

  CREATE TABLE IF NOT EXISTS permanent_items (
    item_id TEXT PRIMARY KEY NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    note TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS library_items_type_idx ON library_items(type);
  CREATE INDEX IF NOT EXISTS library_items_year_idx ON library_items(year);
  CREATE INDEX IF NOT EXISTS library_items_pruning_idx ON library_items(play_count, file_size_bytes);
  CREATE UNIQUE INDEX IF NOT EXISTS watch_history_unique_idx ON watch_history(item_id, user, watched_at);
  CREATE INDEX IF NOT EXISTS watch_history_item_idx ON watch_history(item_id);
  CREATE INDEX IF NOT EXISTS watch_history_user_idx ON watch_history(user);
`);

export const db = drizzle(sqlite, { schema });
