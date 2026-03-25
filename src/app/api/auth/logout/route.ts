import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  const cookie = clearSessionCookie();

  return NextResponse.json(
    { success: true },
    {
      status: 200,
      headers: { "Set-Cookie": cookie },
    }
  );
}
