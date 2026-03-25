import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const libraryItems = sqliteTable(
  "library_items",
  {
    id: text("id").primaryKey(), // Plex ratingKey
    type: text("type").notNull(), // "movie" | "show"
    title: text("title").notNull(),
    year: integer("year"),
    genre: text("genre"), // JSON array string
    plexRating: real("plex_rating"),
    addedAt: integer("added_at"),
    lastViewedAt: integer("last_viewed_at"),
    playCount: integer("play_count").notNull().default(0),
    fileSizeBytes: integer("file_size_bytes").notNull().default(0),
    resolution: text("resolution"),
    bitrate: integer("bitrate"),
    episodeCount: integer("episode_count"),
    filePath: text("file_path"),
    thumbUrl: text("thumb_url"),
    updatedAt: integer("updated_at"),
    pruningScore: integer("pruning_score"),
    deletedFromSource: integer("deleted_from_source"), // timestamp when item was removed from Plex
  },
  (table) => ({
    typeIdx: index("library_items_type_idx").on(table.type),
    yearIdx: index("library_items_year_idx").on(table.year),
    pruningIdx: index("library_items_pruning_idx").on(
      table.playCount,
      table.fileSizeBytes
    ),
    pruningScoreIdx: index("library_items_pruning_score_idx").on(
      table.pruningScore
    ),
  })
);

export const watchHistory = sqliteTable(
  "watch_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: text("item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    user: text("user").notNull(),
    watchedAt: integer("watched_at").notNull(),
    percentComplete: integer("percent_complete").notNull().default(0),
    wasCompleted: integer("was_completed", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => ({
    uniqueEntry: uniqueIndex("watch_history_unique_idx").on(
      table.itemId,
      table.user,
      table.watchedAt
    ),
    itemIdx: index("watch_history_item_idx").on(table.itemId),
    userIdx: index("watch_history_user_idx").on(table.user),
  })
);

export const pruningConfig = sqliteTable("pruning_config", {
  key: text("key").primaryKey(),
  value: real("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const permanentItems = sqliteTable("permanent_items", {
  itemId: text("item_id")
    .primaryKey()
    .references(() => libraryItems.id, { onDelete: "cascade" }),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
});

export const syncSections = sqliteTable("sync_sections", {
  key: text("key").primaryKey(), // Plex section ID
  title: text("title").notNull(),
  type: text("type").notNull(), // "movie" | "show"
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

// Type exports
export type LibraryItem = typeof libraryItems.$inferSelect;
export type NewLibraryItem = typeof libraryItems.$inferInsert;
export type WatchHistoryEntry = typeof watchHistory.$inferSelect;
export type NewWatchHistoryEntry = typeof watchHistory.$inferInsert;
export type PermanentItem = typeof permanentItems.$inferSelect;
export type SyncSection = typeof syncSections.$inferSelect;
