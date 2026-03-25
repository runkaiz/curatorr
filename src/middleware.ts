import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "curator_session";

async function verifyTokenEdge(token: string): Promise<boolean> {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return false;

  const payload = token.substring(0, dotIndex);
  const sig = token.substring(dotIndex + 1);

  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;

  // Use Web Crypto API for Edge Runtime compatibility
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  const expected = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-length comparison (not truly constant-time in JS, but mitigates basic timing)
  if (sig.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < sig.length; i++) {
    mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
  const isAuthenticated = sessionCookie
    ? await verifyTokenEdge(sessionCookie)
    : false;

  // Protect admin pages
  if (pathname.startsWith("/admin")) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Protect admin API routes
  if (
    pathname.startsWith("/api/sync") ||
    pathname.startsWith("/api/permanent") ||
    pathname.startsWith("/api/stats") ||
    pathname.startsWith("/api/auth/logout")
  ) {
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Redirect authenticated users away from login
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/sync/:path*",
    "/api/permanent/:path*",
    "/api/stats/:path*",
    "/api/auth/logout/:path*",
    "/login",
  ],
};
