import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { reconcilePermanentCollection } from "@/lib/permanent-collection";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const configuredToken = process.env.MAINTENANCE_TOKEN;
  const authorization = request.headers.get("authorization") || "";
  const suppliedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!configuredToken || !suppliedToken) return false;

  const expected = Buffer.from(configuredToken);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function POST(request: NextRequest) {
  if (!process.env.MAINTENANCE_TOKEN) {
    return NextResponse.json(
      { error: "MAINTENANCE_TOKEN is not configured" },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const permanentCollection = await reconcilePermanentCollection();
    return NextResponse.json({ success: true, permanentCollection });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Permanent exhibition reconciliation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
