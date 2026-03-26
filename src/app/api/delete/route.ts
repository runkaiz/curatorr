import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { libraryItems, permanentItems, watchHistory } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getTmdbId } from "@/lib/plex";
import {
  isSeerrConfigured,
  getSeerrMediaId,
  deleteSeerrMediaFiles,
  deleteSeerrMediaRecord,
} from "@/lib/seerr";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface DeleteResult {
  id: string;
  title: string;
  success: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ids: string[] = body.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids must be a non-empty array" },
        { status: 400 }
      );
    }

    if (ids.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 items per delete request" },
        { status: 400 }
      );
    }

    if (!isSeerrConfigured()) {
      return NextResponse.json(
        { error: "Seerr is not configured. Set SEERR_URL and SEERR_API_KEY." },
        { status: 400 }
      );
    }

    // Fetch item details from DB for title and type
    const dbItems = db
      .select({
        id: libraryItems.id,
        title: libraryItems.title,
        type: libraryItems.type,
      })
      .from(libraryItems)
      .where(inArray(libraryItems.id, ids))
      .all();

    const itemMap = new Map(dbItems.map((item) => [item.id, item]));

    const results: DeleteResult[] = [];

    for (const id of ids) {
      const item = itemMap.get(id);
      if (!item) {
        results.push({
          id,
          title: "Unknown",
          success: false,
          error: "Item not found in database",
        });
        continue;
      }

      try {
        // Step 1: Resolve Plex ratingKey → TMDB ID
        const tmdbId = await getTmdbId(id);
        if (!tmdbId) {
          // No TMDB ID — still delete from local DB but warn about Seerr
          results.push({
            id,
            title: item.title,
            success: true,
            error:
              "No TMDB ID found in Plex — removed from Curatorr but could not delete from Seerr",
          });
          // Delete from local DB anyway
          db.delete(permanentItems).where(eq(permanentItems.itemId, id)).run();
          db.delete(watchHistory).where(eq(watchHistory.itemId, id)).run();
          db.delete(libraryItems).where(eq(libraryItems.id, id)).run();
          continue;
        }

        // Step 2: Look up Seerr media ID
        const mediaType = item.type as "movie" | "show";
        const seerrMediaId = await getSeerrMediaId(tmdbId, mediaType);

        if (seerrMediaId) {
          // Step 3: Delete files from Sonarr/Radarr
          await deleteSeerrMediaFiles(seerrMediaId);

          // Step 4: Delete the Seerr record (cascades requests)
          await deleteSeerrMediaRecord(seerrMediaId);
        }

        // Step 5: Delete from local DB
        db.delete(permanentItems).where(eq(permanentItems.itemId, id)).run();
        db.delete(watchHistory).where(eq(watchHistory.itemId, id)).run();
        db.delete(libraryItems).where(eq(libraryItems.id, id)).run();

        results.push({
          id,
          title: item.title,
          success: true,
          error: seerrMediaId
            ? undefined
            : "Not found in Seerr — removed from Curatorr only",
        });
      } catch (err) {
        console.error(`Failed to delete ${item.title} (${id}):`, err);
        results.push({
          id,
          title: item.title,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({ succeeded, failed, results });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
