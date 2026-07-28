import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { permanentItems, libraryItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { reconcilePermanentItem } from "@/lib/permanent-collection";

export async function GET() {
  try {
    const items = db
      .select({
        itemId: permanentItems.itemId,
        note: permanentItems.note,
        createdAt: permanentItems.createdAt,
        title: libraryItems.title,
        type: libraryItems.type,
        year: libraryItems.year,
        fileSizeBytes: libraryItems.fileSizeBytes,
        resolution: libraryItems.resolution,
        thumbUrl: libraryItems.thumbUrl,
      })
      .from(permanentItems)
      .innerJoin(libraryItems, eq(permanentItems.itemId, libraryItems.id))
      .orderBy(libraryItems.title)
      .all();

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Permanent items fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch permanent items" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, note } = body;

    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json(
        { error: "itemId is required" },
        { status: 400 }
      );
    }

    // Verify item exists
    const item = db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(eq(libraryItems.id, itemId))
      .get();

    if (!item) {
      return NextResponse.json(
        { error: "Library item not found" },
        { status: 404 }
      );
    }

    db.insert(permanentItems)
      .values({
        itemId,
        note: note || null,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .onConflictDoUpdate({
        target: permanentItems.itemId,
        set: { note: note || null },
      })
      .run();

    try {
      const permanentCollection = await reconcilePermanentItem(itemId);
      return NextResponse.json(
        {
          success: true,
          permanentCollection,
          warning:
            permanentCollection.failed > 0 || permanentCollection.skipped > 0
              ? permanentCollection.errors.join("; ")
              : undefined,
        },
        { status: 201 }
      );
    } catch (error) {
      const warning = `Saved in Curatorr, but Plex collection sync failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      console.error(warning);
      return NextResponse.json({ success: true, warning }, { status: 201 });
    }
  } catch (error) {
    console.error("Permanent item create error:", error);
    return NextResponse.json(
      { error: "Failed to add permanent item" },
      { status: 500 }
    );
  }
}
