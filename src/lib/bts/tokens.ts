import { randomBytes } from "crypto";

// ── Capability-token generation ──────────────────────────────────
// Share links, invitations, verification and reset tokens are the ONLY secret
// guarding protected reports, so they must be cryptographically random rather
// than derived from Prisma's cuid() default (collision-resistant, but not
// designed as a secret and embeds timing/fingerprint structure).
// 24 bytes → 32 URL-safe chars (~192 bits).
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}
