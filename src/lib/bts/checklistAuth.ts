import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

// ── Skills Checklist account auth (lightweight sandbox sessions) ──
// Production: swap for NextAuth/Supabase Auth — hash format is self-describing.

const COOKIE = "vv_ck";
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function createSession(accountId: string): Promise<string> {
  const id = `cks_${randomBytes(24).toString("hex")}`;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.checklistSession.create({ data: { id, accountId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
  return id;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) {
    await db.checklistSession.deleteMany({ where: { id } });
    jar.delete(COOKIE);
  }
}

/** Returns the signed-in checklist account, or null. */
export async function getAccount() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const session = await db.checklistSession.findUnique({ where: { id } });
  if (!session || session.expiresAt < new Date()) return null;
  return db.checklistAccount.findUnique({ where: { id: session.accountId } });
}
