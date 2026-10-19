// ── Superadmin session resolution shared by POST actions and GET downloads ──
// The console bearer (sas_…) rides an httpOnly cookie (vv_sa) since the
// refresh-persistence fix (2026-10-19). POST /api/superadmin resolves it via
// resolveIdentity (body token first, cookie fallback); the GET workbook
// endpoints (/api/superadmin/skills/{template,export}) are cookie-only —
// tokens never appear in URLs, so they can't leak into logs or browser
// history. Backup-code callers are covered too: backup login mints a REAL
// session + cookie, accepted exactly once.
//
// Tokens are hashed at rest (Phase D): the presented raw value is digested
// for lookup. Account status is re-read on every call so suspensions and
// role changes apply to live sessions instantly.

import { createHash } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

export const SA_COOKIE = "vv_sa";
export const SESSION_HOURS = 8;

export type AdminRole = "OWNER" | "ADMIN" | "SUPPORT";

export interface SaIdentity {
  role: AdminRole;
  email: string;
  accountId: string | null; // null = env backup-code owner access → OWNER
  token: string | null; // null only for the env backup-code identity (no session row)
}

export function saCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_HOURS * 3600,
    path: "/",
  };
}

export function sha256Token(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Look up a live session by RAW token (body bearer or cookie value). Returns
// null for unknown/expired tokens or suspended accounts — fail-closed.
export async function sessionFromToken(raw: string): Promise<SaIdentity | null> {
  if (!raw.startsWith("sas_")) return null;
  const session = await db.superAdminSession.findUnique({ where: { token: sha256Token(raw) } });
  if (!session || session.expiresAt <= new Date()) return null;
  if (session.accountId) {
    const account = await db.superadminAccount.findUnique({ where: { id: session.accountId } });
    if (!account || account.status === "SUSPENDED") return null;
    const role: AdminRole = ["OWNER", "ADMIN", "SUPPORT"].includes(account.role) ? (account.role as AdminRole) : "SUPPORT";
    return { role, email: account.email, accountId: account.id, token: raw };
  }
  return { role: "OWNER", email: session.email || "", accountId: null, token: raw };
}

// GET-only endpoints (workbook downloads): identity comes from the cookie alone.
export async function identityFromCookie(req: NextRequest): Promise<SaIdentity | null> {
  const raw = req.cookies.get(SA_COOKIE)?.value ?? "";
  if (!raw) return null;
  return sessionFromToken(raw);
}

// Convenience for helpers that run inside a request scope without the req object.
export async function identityFromCookieJar(): Promise<SaIdentity | null> {
  const jar = await cookies();
  const raw = jar.get(SA_COOKIE)?.value ?? "";
  if (!raw) return null;
  return sessionFromToken(raw);
}
