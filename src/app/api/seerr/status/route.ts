import { NextResponse } from "next/server";
import { isSeerrConfigured } from "@/lib/seerr";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ configured: isSeerrConfigured() });
}
