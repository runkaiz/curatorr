import { NextResponse } from "next/server";
import { db } from "@/db";
import { libraryItems, permanentItems } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Total size and counts
    const [totals] = db
      .select({
        totalSize: sql<number>`coalesce(sum(${libraryItems.fileSizeBytes}), 0)`,
        totalItems: sql<number>`count(*)`,
        movieCount: sql<number>`coalesce(sum(case when ${libraryItems.type} = 'movie' then 1 else 0 end), 0)`,
        showCount: sql<number>`coalesce(sum(case when ${libraryItems.type} = 'show' then 1 else 0 end), 0)`,
      })
      .from(libraryItems)
      .all();

    // Purgeable estimate: never-watched, non-permanent items
    const [purgeable] = db
      .select({
        purgeableSize: sql<number>`coalesce(sum(${libraryItems.fileSizeBytes}), 0)`,
        purgeableCount: sql<number>`count(*)`,
      })
      .from(libraryItems)
      .leftJoin(permanentItems, eq(libraryItems.id, permanentItems.itemId))
      .where(
        sql`${libraryItems.playCount} = 0 AND ${permanentItems.itemId} IS NULL`
      )
      .all();

    // Largest single item
    const largestItem = db
      .select({
        id: libraryItems.id,
        title: libraryItems.title,
        size: libraryItems.fileSizeBytes,
        type: libraryItems.type,
      })
      .from(libraryItems)
      .orderBy(sql`${libraryItems.fileSizeBytes} desc`)
      .limit(1)
      .get();

    // Oldest unwatched item
    const oldestUnwatched = db
      .select({
        id: libraryItems.id,
        title: libraryItems.title,
        addedAt: libraryItems.addedAt,
        type: libraryItems.type,
      })
      .from(libraryItems)
      .where(sql`${libraryItems.playCount} = 0`)
      .orderBy(sql`${libraryItems.addedAt} asc`)
      .limit(1)
      .get();

    return NextResponse.json({
      totalSize: totals.totalSize,
      totalItems: totals.totalItems,
      movieCount: totals.movieCount,
      showCount: totals.showCount,
      purgeableSize: purgeable.purgeableSize,
      purgeableCount: purgeable.purgeableCount,
      largestItem: largestItem || null,
      oldestUnwatched: oldestUnwatched || null,
    });
  } catch (error) {
    console.error("Stats fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
