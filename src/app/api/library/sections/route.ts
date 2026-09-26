import { NextResponse } from "next/server";
import { db } from "@/db";
import { libraryItems, syncSections } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const sections = db.selectDistinct({
    key: syncSections.key,
    title: syncSections.title,
    type: syncSections.type,
  }).from(syncSections)
    .innerJoin(libraryItems, eq(libraryItems.plexSectionId, syncSections.key))
    .all()
    .sort((a, b) => {
      const order = ["TV", "Anime", "Movies"];
      const aRank = order.indexOf(a.title);
      const bRank = order.indexOf(b.title);
      return (aRank < 0 ? order.length : aRank) - (bRank < 0 ? order.length : bRank)
        || a.title.localeCompare(b.title);
    });
  return NextResponse.json({ sections });
}
