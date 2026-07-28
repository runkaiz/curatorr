// Plex API types
export interface PlexSection {
  key: string;
  type: "movie" | "show";
  title: string;
}

export interface PlexMediaItem {
  ratingKey: string;
  librarySectionId: string | null;
  title: string;
  year: number | null;
  rating: number | null;
  addedAt: number | null;
  lastViewedAt: number | null;
  viewCount: number;
  genres: string[];
  collections: string[];
  fileSize: number;
  resolution: string | null;
  bitrate: number | null;
  episodeCount: number | null;
  filePath: string | null;
  thumbPath: string | null;
  type: "movie" | "show";
}

// Tautulli API types
export interface TautulliMediaItem {
  ratingKey: string;
  fileSize: number;
  playCount: number;
  lastPlayed: number | null;
  bitrate: number | null;
}

export interface TautulliHistoryEntry {
  ratingKey: string;
  user: string;
  date: number;
  percentComplete: number;
  wasCompleted: boolean;
}

export interface TautulliUser {
  userId: number;
  username: string;
  isAdmin: boolean;
}

export interface PlexCollectionSyncResult {
  enabled: boolean;
  collectionName: string;
  scanned: number;
  added: number;
  removed: number;
  unchanged: number;
  skipped: number;
  failed: number;
  errors: string[];
}

// Sync result
export interface SyncResult {
  itemsSynced: number;
  historyEntries: number;
  itemsRemoved: number;
  durationMs: number;
  permanentCollection?: PlexCollectionSyncResult;
}
