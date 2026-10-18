import { NextRequest } from "next/server";

// ── Outbound link origin (verification / invite / reset / share emails) ──
// SEC: these URLs are built from request headers in several routes. A forged
// Host/x-forwarded-host header lets an attacker make a verification email
// point at THEIR origin (email link poisoning → token theft when the victim
// clicks). When APP_ORIGIN is configured it always wins; the header fallback
// keeps sandbox/dev ergonomics where no origin is pinned.
export function originFor(req: NextRequest): string {
  const pinned = process.env.APP_ORIGIN?.trim();
  if (pinned) return pinned.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
