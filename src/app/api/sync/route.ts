import { NextResponse } from "next/server";
import { syncLibrary } from "@/lib/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await syncLibrary();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      {
        error: "Sync failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
