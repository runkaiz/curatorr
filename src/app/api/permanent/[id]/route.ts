import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { permanentItems } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = db
      .delete(permanentItems)
      .where(eq(permanentItems.itemId, params.id))
      .run();

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Permanent item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Permanent item delete error:", error);
    return NextResponse.json(
      { error: "Failed to remove permanent item" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { note } = body;

    const result = db
      .update(permanentItems)
      .set({ note: note ?? null })
      .where(eq(permanentItems.itemId, params.id))
      .run();

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Permanent item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Permanent item update error:", error);
    return NextResponse.json(
      { error: "Failed to update permanent item" },
      { status: 500 }
    );
  }
}
