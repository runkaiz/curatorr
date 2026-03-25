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
sqlite.pragma("busy_timeout = 5000");
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
    updated_at INTEGER,
    pruning_score INTEGER,
    deleted_from_source INTEGER
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

  CREATE TABLE IF NOT EXISTS pruning_config (
    key TEXT PRIMARY KEY NOT NULL,
    value REAL NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Add pruning_score column if it doesn't exist (migration for existing DBs)
  INSERT OR IGNORE INTO pruning_config (key, value, updated_at) VALUES
    ('engagement_weight', 0.30, 0),
    ('recency_weight', 0.25, 0),
    ('size_weight', 0.15, 0),
    ('reach_weight', 0.15, 0),
    ('resolution_weight', 0.05, 0),
    ('staleness_weight', 0.10, 0),
    ('grace_period_days', 30, 0),
    ('grace_period_max_score', 50, 0);

  CREATE INDEX IF NOT EXISTS library_items_type_idx ON library_items(type);
  CREATE INDEX IF NOT EXISTS library_items_year_idx ON library_items(year);
  CREATE INDEX IF NOT EXISTS library_items_pruning_idx ON library_items(play_count, file_size_bytes);
  CREATE UNIQUE INDEX IF NOT EXISTS watch_history_unique_idx ON watch_history(item_id, user, watched_at);
  CREATE INDEX IF NOT EXISTS watch_history_item_idx ON watch_history(item_id);
  CREATE INDEX IF NOT EXISTS watch_history_user_idx ON watch_history(user);
`);

// Migration: add pruning_score column to existing databases
try {
  sqlite.exec(`ALTER TABLE library_items ADD COLUMN pruning_score INTEGER`);
} catch {
  // Column already exists, ignore
}

// Migration: add deleted_from_source column to existing databases
try {
  sqlite.exec(`ALTER TABLE library_items ADD COLUMN deleted_from_source INTEGER`);
} catch {
  // Column already exists, ignore
}

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS library_items_pruning_score_idx ON library_items(pruning_score DESC);
`);

export const db = drizzle(sqlite, { schema });
