import crypto from "crypto";
import { serialize, parse } from "cookie";

const COOKIE_NAME = "curator_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

export function signToken(payload: string): string {
  const secret = getSessionSecret();
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): string | null {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const payload = token.substring(0, dotIndex);
  const sig = token.substring(dotIndex + 1);

  const secret = getSessionSecret();
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Constant-time comparison
  if (sig.length !== expected.length) return null;
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  return payload;
}

export function createSession(): string {
  const payload = JSON.stringify({
    authenticated: true,
    iat: Math.floor(Date.now() / 1000),
  });
  return signToken(payload);
}

export function createSessionCookie(token: string): string {
  return serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === "true",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(): string {
  return serialize(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function getSessionFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = parse(cookieHeader);
  return cookies[COOKIE_NAME] || null;
}

export function verifyPassword(input: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not set");

  const inputBuf = Buffer.from(input);
  const passwordBuf = Buffer.from(password);

  if (inputBuf.length !== passwordBuf.length) return false;
  return crypto.timingSafeEqual(inputBuf, passwordBuf);
}
