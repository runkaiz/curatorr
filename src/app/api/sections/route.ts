import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncSections } from "@/db/schema";
import { getLibrarySections } from "@/lib/plex";

export const dynamic = "force-dynamic";

// GET: Fetch all Plex sections, merged with saved enabled/disabled state
export async function GET() {
  try {
    const [plexSections, savedSections] = await Promise.all([
      getLibrarySections(),
      db.select().from(syncSections).all(),
    ]);

    const savedMap = new Map(savedSections.map((s) => [s.key, s]));

    // If no saved sections exist yet, all are enabled by default
    const hasConfig = savedSections.length > 0;

    const merged = plexSections.map((section) => {
      const saved = savedMap.get(section.key);
      return {
        key: section.key,
        title: section.title,
        type: section.type,
        enabled: saved ? saved.enabled : !hasConfig,
      };
    });

    return NextResponse.json({ sections: merged, hasConfig });
  } catch (error) {
    console.error("Failed to fetch sections:", error);
    return NextResponse.json(
      { error: "Failed to fetch library sections", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// PUT: Save which sections are enabled
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const sections: { key: string; title: string; type: string; enabled: boolean }[] = body.sections;

    if (!Array.isArray(sections)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    db.transaction((tx) => {
      for (const section of sections) {
        tx.insert(syncSections)
          .values({
            key: section.key,
            title: section.title,
            type: section.type,
            enabled: section.enabled,
          })
          .onConflictDoUpdate({
            target: syncSections.key,
            set: {
              title: section.title,
              type: section.type,
              enabled: section.enabled,
            },
          })
          .run();
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save sections:", error);
    return NextResponse.json(
      { error: "Failed to save sections", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
