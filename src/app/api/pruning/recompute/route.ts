import { NextResponse } from "next/server";
import { computeAllPruningScores } from "@/lib/pruning";
import { db } from "@/db";
import { libraryItems } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    computeAllPruningScores();

    const result = db.get<{ count: number; avg: number }>(sql`
      SELECT COUNT(*) as count, ROUND(AVG(pruning_score), 1) as avg
      FROM ${libraryItems}
      WHERE pruning_score IS NOT NULL
    `);

    return NextResponse.json({
      success: true,
      itemsScored: result?.count ?? 0,
      averageScore: result?.avg ?? 0,
    });
  } catch (error) {
    console.error("Pruning recompute error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Recompute failed" },
      { status: 500 }
    );
  }
}
