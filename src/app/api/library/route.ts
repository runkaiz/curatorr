import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { libraryItems, permanentItems, syncSections } from "@/db/schema";
import { eq, sql, and, like, gte, lt, desc, asc, isNotNull, isNull } from "drizzle-orm";

import { ensurePruningScores } from "@/lib/pruning";
import { parseRecommendation } from "@/lib/pruning-score";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    ensurePruningScores();
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");
    const section = searchParams.get("section");
    const genre = searchParams.get("genre");
    const decade = searchParams.get("decade");
    const search = searchParams.get("q")?.trim() || "";
    const filter = searchParams.get("filter");
    const hidePermanent = searchParams.get("hide_permanent") === "true";
    const permanentOnly = searchParams.get("permanent_only") === "true";
    const sort = searchParams.get("sort") || "added_at";
    const order = searchParams.get("order") || "desc";
    const positiveInt = (value: string | null, fallback: number) => {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
    };
    const page = positiveInt(searchParams.get("page"), 1);
    const limit = Math.min(positiveInt(searchParams.get("limit"), 50), 100);
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];
    if (filter) {
      const condition = getFilterCondition(filter);
      if (!condition) return NextResponse.json({ error: `Unknown filter: ${filter}` }, { status: 400 });
      conditions.push(condition);
    }

    if (type && (type === "movie" || type === "show")) {
      conditions.push(eq(libraryItems.type, type));
    }
    if (section) {
      conditions.push(eq(libraryItems.plexSectionId, section));
    }

    if (genre) {
      conditions.push(like(libraryItems.genre, `%"${genre}"%`));
    }

    if (decade) {
      const decadeStart = parseInt(decade.replace("s", ""), 10);
      if (!isNaN(decadeStart)) {
        conditions.push(gte(libraryItems.year, decadeStart));
        conditions.push(lt(libraryItems.year, decadeStart + 10));
      }
    }

    if (search) {
      conditions.push(like(libraryItems.title, `%${search}%`));
    }

    if (permanentOnly) {
      conditions.push(sql`${permanentItems.itemId} IS NOT NULL`);
    } else if (hidePermanent) {
      conditions.push(sql`${permanentItems.itemId} IS NULL`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Build sort
    const sortColumn = getSortColumn(filter === "largest" ? "size" : sort);
    const orderDir = order === "asc" && filter !== "largest" ? asc(sortColumn) : desc(sortColumn);

    // Fetch items with permanent status
    const items = db
      .select({
        id: libraryItems.id,
        plexSectionId: libraryItems.plexSectionId,
        sectionTitle: syncSections.title,
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
        pruningScore: libraryItems.pruningScore,
        pruningDetails: libraryItems.pruningDetails,
        deletedFromSource: libraryItems.deletedFromSource,
        isPermanent: sql<boolean>`${permanentItems.itemId} IS NOT NULL`.as(
          "is_permanent"
        ),
      })
      .from(libraryItems)
      .leftJoin(permanentItems, eq(libraryItems.id, permanentItems.itemId))
      .leftJoin(syncSections, eq(libraryItems.plexSectionId, syncSections.key))
      .where(where)
      .orderBy(orderDir, desc(libraryItems.fileSizeBytes), asc(libraryItems.id))
      .limit(limit)
      .offset(offset)
      .all();

    // Get total count
    const [{ count }] = db
      .select({ count: sql<number>`count(*)` })
      .from(libraryItems)
      .leftJoin(permanentItems, eq(libraryItems.id, permanentItems.itemId))
      .where(where)
      .all();

    // Get distinct genres for filter options
    const allGenres = db
      .select({ genre: libraryItems.genre })
      .from(libraryItems)
      .where(isNotNull(libraryItems.genre))
      .all();

    const genreSet = new Set<string>();
    for (const row of allGenres) {
      if (row.genre) {
        try {
          const parsed = JSON.parse(row.genre) as string[];
          for (const g of parsed) genreSet.add(g);
        } catch {
          // skip malformed
        }
      }
    }

    return NextResponse.json({
      items: items.map(({ pruningDetails, ...item }) => ({ ...item, isPermanent: !!item.isPermanent, recommendation: parseRecommendation(pruningDetails) })),
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
      genres: Array.from(genreSet).sort(),
    });
  } catch (error) {
    console.error("Library fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch library" },
      { status: 500 }
    );
  }
}

function getFilterCondition(filter: string) {
  switch (filter) {
    case "high_score":
      return and(gte(libraryItems.pruningScore, 70), isNull(permanentItems.itemId), isNull(libraryItems.deletedFromSource),
        sql`json_extract(${libraryItems.pruningDetails}, '$.decision') = 'candidate'`);
    case "never_watched":
      return and(eq(libraryItems.playCount, 0), isNull(libraryItems.lastViewedAt),
        sql`NOT EXISTS (SELECT 1 FROM watch_history wh WHERE wh.item_id = ${libraryItems.id})`);
    case "watched_once_year_ago":
      return and(eq(libraryItems.type, "movie"), eq(libraryItems.playCount, 1),
        lt(libraryItems.lastViewedAt, Math.floor(Date.now() / 1000) - 365 * 86400));
    case "largest":
      return isNull(libraryItems.deletedFromSource);
    case "low_resolution":
      return sql`${libraryItems.resolution} IN ('SD', '480p', '720p', 'sd', '480', '720')`;
    case "abandoned":
      return sql`json_extract(${libraryItems.pruningDetails}, '$.unfinishedViewers') > 0
        AND json_extract(${libraryItems.pruningDetails}, '$.idleDays') >= 180`;
    case "single_user":
      return sql`(SELECT COUNT(DISTINCT user) FROM watch_history wh WHERE wh.item_id = ${libraryItems.id}) = 1`;
    case "fully_watched":
      // An episode completion is not evidence of a completed series.
      return and(eq(libraryItems.type, "movie"),
        sql`EXISTS (SELECT 1 FROM watch_history wh WHERE wh.item_id = ${libraryItems.id} AND wh.was_completed = 1)`,
        sql`json_extract(${libraryItems.pruningDetails}, '$.unfinishedViewers') = 0`);
    default:
      return null;
  }
}

function getSortColumn(sort: string) {
  switch (sort) {
    case "title":
      return libraryItems.title;
    case "year":
      return libraryItems.year;
    case "rating":
      return libraryItems.plexRating;
    case "size":
      return libraryItems.fileSizeBytes;
    case "play_count":
      return libraryItems.playCount;
    case "last_viewed":
      return libraryItems.lastViewedAt;
    case "score":
      return libraryItems.pruningScore;
    case "added_at":
    default:
      return libraryItems.addedAt;
  }
}
