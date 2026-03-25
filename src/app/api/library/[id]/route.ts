import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { libraryItems, permanentItems } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const items = db
      .select({
        id: libraryItems.id,
        type: libraryItems.type,
        title: libraryItems.title,
        year: libraryItems.year,
        genre: libraryItems.genre,
        plexRating: libraryItems.plexRating,
        addedAt: libraryItems.addedAt,
        lastViewedAt: libraryItems.lastViewedAt,
        playCount: libraryItems.playCount,
        fileSizeBytes: libraryItems.fileSizeBytes,
        resolution: libraryItems.resolution,
        bitrate: libraryItems.bitrate,
        episodeCount: libraryItems.episodeCount,
        filePath: libraryItems.filePath,
        deletedFromSource: libraryItems.deletedFromSource,
        isPermanent: sql<boolean>`${permanentItems.itemId} IS NOT NULL`.as(
          "is_permanent"
        ),
        permanentNote: permanentItems.note,
      })
      .from(libraryItems)
      .leftJoin(permanentItems, eq(libraryItems.id, permanentItems.itemId))
      .where(eq(libraryItems.id, params.id))
      .all();

    if (items.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(items[0]);
  } catch (error) {
    console.error("Library item fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch item" },
      { status: 500 }
    );
  }
}
