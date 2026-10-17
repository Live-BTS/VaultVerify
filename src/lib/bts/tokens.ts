import { createHash, randomBytes } from "crypto";

// ── Capability-token generation ──────────────────────────────────
// Share links, invitations, verification and reset tokens are the ONLY secret
// guarding protected reports, so they must be cryptographically random rather
// than derived from Prisma's cuid() default (collision-resistant, but not
// designed as a secret and embeds timing/fingerprint structure).
// 24 bytes → 32 URL-safe chars (~192 bits).
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

// ── D4: share/invite link tokens are hashed at rest ──────────────
// ChecklistShareLink, ReferenceShareLink and ChecklistInvite store the
// SHA-256 HEX DIGEST of the capability token in their `token` column — the
// raw value is shown exactly ONCE in the creation response (and delivered in
// the email where applicable), then it exists only in the holder's URL.
// A database leak therefore yields no usable share/invite links.
//
// Legacy rows (created before this cutover) still hold the raw token. They
// keep working: every lookup tries the digest FIRST, then the raw value.
// The first time a legacy link is resolved, its row is lazily upgraded
// (raw → digest) inside the same UPDATE that records the view — after which
// the row is hash-only and ledger surfaces can no longer re-display it.
//
// Digests are unsalted by design: tokens are 192-bit random (newToken()),
// so nothing can be brute-forced offline, and the digest doubles as the
// unique lookup key. Mirrors the SEC-D1 convention in lib/bts/auth.ts.
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Lookup set for a presented raw token: [digest, raw]. The digest matches
 * post-cutover rows; the raw value matches legacy rows. At most one row can
 * match (unique column, and the two shapes cannot collide: 64-hex vs 32-char
 * base64url), so `findFirst({ where: { token: { in: tokenLookups(raw) } } })`
 * is exact and provider-identical on SQLite and Postgres.
 */
export function tokenLookups(raw: string): string[] {
  const trimmed = raw.trim();
  return trimmed ? [sha256Hex(trimmed), trimmed] : [];
}

/** True when a stored `token` value is a SHA-256 digest (i.e. not re-displayable). */
export function isTokenHashed(stored: string): boolean {
  return /^[0-9a-f]{64}$/.test(stored);
}
