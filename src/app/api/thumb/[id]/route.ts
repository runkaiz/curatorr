import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { libraryItems } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const item = db
      .select({ thumbUrl: libraryItems.thumbUrl })
      .from(libraryItems)
      .where(eq(libraryItems.id, params.id))
      .get();

    if (!item?.thumbUrl) {
      return new NextResponse(null, { status: 404 });
    }

    const plexUrl = process.env.PLEX_URL?.replace(/\/$/, "");
    const plexToken = process.env.PLEX_TOKEN;

    if (!plexUrl || !plexToken) {
      return new NextResponse(null, { status: 503 });
    }

    const thumbFetchUrl = `${plexUrl}${item.thumbUrl}?X-Plex-Token=${plexToken}`;
    const res = await fetch(thumbFetchUrl);

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    return new NextResponse(res.body, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("Thumbnail proxy error:", error);
    return new NextResponse(null, { status: 500 });
  }
}
