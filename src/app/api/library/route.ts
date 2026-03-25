import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { libraryItems, permanentItems, watchHistory } from "@/db/schema";
import { eq, sql, and, like, gte, lt, desc, asc, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");
    const genre = searchParams.get("genre");
    const decade = searchParams.get("decade");
    const filter = searchParams.get("filter");
    const hidePermanent = searchParams.get("hide_permanent") === "true";
    const sort = searchParams.get("sort") || "added_at";
    const order = searchParams.get("order") || "desc";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "50", 10),
      100
    );
    const offset = (page - 1) * limit;

    // If using a pre-built filter, use a specialized query
    if (filter) {
      return handleFilteredQuery(filter, hidePermanent, sort, order, page, limit, offset);
    }

    // Build where conditions
    const conditions = [];

    if (type && (type === "movie" || type === "show")) {
      conditions.push(eq(libraryItems.type, type));
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

    if (hidePermanent) {
      conditions.push(sql`${permanentItems.itemId} IS NULL`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Build sort
    const sortColumn = getSortColumn(sort);
    const orderDir = order === "asc" ? asc(sortColumn) : desc(sortColumn);

    // Fetch items with permanent status
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
        pruningScore: libraryItems.pruningScore,
        isPermanent: sql<boolean>`${permanentItems.itemId} IS NOT NULL`.as(
          "is_permanent"
        ),
      })
      .from(libraryItems)
      .leftJoin(permanentItems, eq(libraryItems.id, permanentItems.itemId))
      .where(where)
      .orderBy(orderDir)
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
      items,
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

function handleFilteredQuery(
  filter: string,
  hidePermanent: boolean,
  sort: string,
  order: string,
  page: number,
  limit: number,
  offset: number,
) {
  const permanentCondition = hidePermanent
    ? sql`AND p.item_id IS NULL`
    : sql``;

  let filterSql: string;
  const sortClause = getFilterSortClause(sort, order, filter);

  switch (filter) {
    case "high_score":
      filterSql = `
        SELECT li.*, (p.item_id IS NOT NULL) as is_permanent
        FROM library_items li
        LEFT JOIN permanent_items p ON li.id = p.item_id
        WHERE li.pruning_score >= 70 ${hidePermanent ? "AND p.item_id IS NULL" : ""}
        ORDER BY li.pruning_score DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      break;

    case "never_watched":
      filterSql = `
        SELECT li.*, (p.item_id IS NOT NULL) as is_permanent
        FROM library_items li
        LEFT JOIN permanent_items p ON li.id = p.item_id
        WHERE li.play_count = 0 ${hidePermanent ? "AND p.item_id IS NULL" : ""}
        ${sortClause}
        LIMIT ${limit} OFFSET ${offset}
      `;
      break;

    case "watched_once_year_ago": {
      const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 86400;
      filterSql = `
        SELECT li.*, (p.item_id IS NOT NULL) as is_permanent
        FROM library_items li
        LEFT JOIN permanent_items p ON li.id = p.item_id
        WHERE li.play_count = 1 AND li.last_viewed_at < ${oneYearAgo}
        ${hidePermanent ? "AND p.item_id IS NULL" : ""}
        ${sortClause}
        LIMIT ${limit} OFFSET ${offset}
      `;
      break;
    }

    case "largest":
      filterSql = `
        SELECT li.*, (p.item_id IS NOT NULL) as is_permanent
        FROM library_items li
        LEFT JOIN permanent_items p ON li.id = p.item_id
        WHERE 1=1 ${hidePermanent ? "AND p.item_id IS NULL" : ""}
        ORDER BY li.file_size_bytes DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      break;

    case "low_resolution":
      filterSql = `
        SELECT li.*, (p.item_id IS NOT NULL) as is_permanent
        FROM library_items li
        LEFT JOIN permanent_items p ON li.id = p.item_id
        WHERE li.resolution IN ('SD', '480p', '720p', 'sd', '480', '720')
        ${hidePermanent ? "AND p.item_id IS NULL" : ""}
        ${sortClause}
        LIMIT ${limit} OFFSET ${offset}
      `;
      break;

    case "abandoned":
      filterSql = `
        SELECT li.*, (p.item_id IS NOT NULL) as is_permanent
        FROM library_items li
        LEFT JOIN permanent_items p ON li.id = p.item_id
        INNER JOIN (
          SELECT item_id, MAX(percent_complete) as max_pct,
                 MAX(was_completed) as any_completed
          FROM watch_history
          GROUP BY item_id
        ) wh ON li.id = wh.item_id
        WHERE wh.max_pct < 50 AND wh.any_completed = 0
        ${hidePermanent ? "AND p.item_id IS NULL" : ""}
        ${sortClause}
        LIMIT ${limit} OFFSET ${offset}
      `;
      break;

    case "single_user":
      filterSql = `
        SELECT li.*, (p.item_id IS NOT NULL) as is_permanent
        FROM library_items li
        LEFT JOIN permanent_items p ON li.id = p.item_id
        INNER JOIN (
          SELECT item_id FROM watch_history
          WHERE was_completed = 1
          GROUP BY item_id
          HAVING COUNT(DISTINCT user) = 1
        ) wh ON li.id = wh.item_id
        ${hidePermanent ? "WHERE p.item_id IS NULL" : ""}
        ${sortClause}
        LIMIT ${limit} OFFSET ${offset}
      `;
      break;

    case "not_owner":
      // Items where the first/admin user hasn't watched but others have
      filterSql = `
        SELECT li.*, (p.item_id IS NOT NULL) as is_permanent
        FROM library_items li
        LEFT JOIN permanent_items p ON li.id = p.item_id
        WHERE li.id IN (
          SELECT DISTINCT item_id FROM watch_history
        )
        AND li.id NOT IN (
          SELECT item_id FROM watch_history
          WHERE user = (SELECT user FROM watch_history GROUP BY user ORDER BY COUNT(*) DESC LIMIT 1)
        )
        ${hidePermanent ? "AND p.item_id IS NULL" : ""}
        ${sortClause}
        LIMIT ${limit} OFFSET ${offset}
      `;
      break;

    case "fully_watched":
      filterSql = `
        SELECT li.*, (p.item_id IS NOT NULL) as is_permanent
        FROM library_items li
        LEFT JOIN permanent_items p ON li.id = p.item_id
        INNER JOIN (
          SELECT item_id
          FROM watch_history
          GROUP BY item_id
          HAVING MIN(was_completed) = 1 AND COUNT(DISTINCT user) > 0
        ) wh ON li.id = wh.item_id
        ${hidePermanent ? "WHERE p.item_id IS NULL" : ""}
        ${sortClause}
        LIMIT ${limit} OFFSET ${offset}
      `;
      break;

    default:
      return NextResponse.json(
        { error: `Unknown filter: ${filter}` },
        { status: 400 }
      );
  }

  const items = db.all(sql.raw(filterSql));

  // Get count for the same filter (replace LIMIT/OFFSET with count)
  const countSql = filterSql
    .replace(/SELECT li\.\*, \(p\.item_id IS NOT NULL\) as is_permanent/, "SELECT COUNT(*) as count")
    .replace(/\s*ORDER BY[\s\S]*?(?=LIMIT|$)/, " ")
    .replace(/LIMIT \d+ OFFSET \d+/, "");

  const [{ count }] = db.all(sql.raw(countSql)) as [{ count: number }];

  // Normalize the raw SQL results to match the Drizzle output shape
  const normalized = (items as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    year: row.year,
    genre: row.genre,
    plexRating: row.plex_rating,
    addedAt: row.added_at,
    lastViewedAt: row.last_viewed_at,
    playCount: row.play_count,
    fileSizeBytes: row.file_size_bytes,
    resolution: row.resolution,
    bitrate: row.bitrate,
    episodeCount: row.episode_count,
    filePath: row.file_path,
    pruningScore: row.pruning_score ?? null,
    isPermanent: !!row.is_permanent,
  }));

  return NextResponse.json({
    items: normalized,
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
    genres: [],
  });
}

function getFilterSortClause(sort: string, order: string, filter: string): string {
  // For "largest" filter, sorting is already baked in
  if (filter === "largest") return "";

  const dir = order === "asc" ? "ASC" : "DESC";
  const col = {
    title: "li.title",
    year: "li.year",
    rating: "li.plex_rating",
    size: "li.file_size_bytes",
    play_count: "li.play_count",
    last_viewed: "li.last_viewed_at",
    added_at: "li.added_at",
    score: "li.pruning_score",
  }[sort] || "li.file_size_bytes";

  return `ORDER BY ${col} ${dir}`;
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
