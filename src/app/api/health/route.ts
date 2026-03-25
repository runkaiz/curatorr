import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface CheckResult {
  status: "ok" | "error";
  message: string;
}

export async function GET() {
  const checks: Record<string, CheckResult> = {};

  // Check env vars
  const envVars = [
    "PLEX_URL",
    "PLEX_TOKEN",
    "TAUTULLI_URL",
    "TAUTULLI_API_KEY",
    "ADMIN_PASSWORD",
    "SESSION_SECRET",
    "DATABASE_URL",
  ];

  const httpUrlVars = ["PLEX_URL", "TAUTULLI_URL"];

  for (const name of envVars) {
    const value = process.env[name];
    if (!value) {
      checks[name] = { status: "error", message: "Not set" };
    } else if (httpUrlVars.includes(name)) {
      try {
        new URL(value);
        checks[name] = { status: "ok", message: maskUrl(value) };
      } catch {
        checks[name] = {
          status: "error",
          message: `Invalid URL: "${value}" — must start with http:// or https://`,
        };
      }
    } else if (name === "DATABASE_URL") {
      checks[name] = { status: "ok", message: value };
    } else {
      checks[name] = { status: "ok", message: `Set (${value.length} chars)` };
    }
  }

  // Check Plex connectivity
  const plexUrl = process.env.PLEX_URL;
  const plexToken = process.env.PLEX_TOKEN;
  if (plexUrl && plexToken) {
    try {
      const url = new URL(`${plexUrl.replace(/\/$/, "")}/identity`);
      url.searchParams.set("X-Plex-Token", plexToken);
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        checks["plex_connection"] = { status: "ok", message: `Reachable (${res.status})` };
      } else {
        checks["plex_connection"] = {
          status: "error",
          message: `HTTP ${res.status} ${res.statusText}`,
        };
      }
    } catch (err) {
      checks["plex_connection"] = {
        status: "error",
        message: err instanceof Error ? err.message : "Connection failed",
      };
    }
  } else {
    checks["plex_connection"] = { status: "error", message: "Skipped — missing PLEX_URL or PLEX_TOKEN" };
  }

  // Check Tautulli connectivity
  const tautulliUrl = process.env.TAUTULLI_URL;
  const tautulliKey = process.env.TAUTULLI_API_KEY;
  if (tautulliUrl && tautulliKey) {
    try {
      const url = new URL(`${tautulliUrl.replace(/\/$/, "")}/api/v2`);
      url.searchParams.set("apikey", tautulliKey);
      url.searchParams.set("cmd", "arnold");
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        checks["tautulli_connection"] = { status: "ok", message: `Reachable (${res.status})` };
      } else {
        checks["tautulli_connection"] = {
          status: "error",
          message: `HTTP ${res.status} ${res.statusText}`,
        };
      }
    } catch (err) {
      checks["tautulli_connection"] = {
        status: "error",
        message: err instanceof Error ? err.message : "Connection failed",
      };
    }
  } else {
    checks["tautulli_connection"] = { status: "error", message: "Skipped — missing TAUTULLI_URL or TAUTULLI_API_KEY" };
  }

  // Check database
  try {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const result = db.get<{ v: number }>(sql`SELECT 1 as v`);
    checks["database"] = {
      status: result?.v === 1 ? "ok" : "error",
      message: result?.v === 1 ? "Connected" : "Query returned unexpected result",
    };
  } catch (err) {
    checks["database"] = {
      status: "error",
      message: err instanceof Error ? err.message : "Connection failed",
    };
  }

  const hasErrors = Object.values(checks).some((c) => c.status === "error");

  return NextResponse.json(
    { status: hasErrors ? "unhealthy" : "healthy", checks },
    { status: hasErrors ? 503 : 200 }
  );
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "(default)"}`;
  } catch {
    return url;
  }
}
