import { createHash } from "crypto";

// ── SEC-17: NotificationLog bodies must not retain live capabilities ──
// Invite, reminder and verification emails all carry bearer-token URLs
// (/?r=<token>, /?verify=<token>, /?view=checklist&invite=<token>).
// sendNotification used to persist those bodies VERBATIM, so every log row
// held a working capability: a database leak (or any future log-reading
// surface) would have yielded usable reference forms, email confirmations
// and checklist invites. The audit (SEC-17 / UX-A7 / TA-M4) flags exactly
// this: "NotificationLog stores full message bodies containing bearer-token
// URLs".
//
// Redaction therefore happens at the LAST possible moment — after the
// provider has been handed the original payload (recipients still receive
// fully working links) and before the copy is written to NotificationLog.
//
// The raw token is replaced with a 10-hex-char SHA-256 digest prefix, the
// same unsalted sha256Hex convention as the D4 token-at-rest cutover
// (tokens are 192-bit random, so a prefix is neither brute-forceable nor
// re-enterable as a link). Support can still correlate a log row to a known
// token by computing tokenDigestPrefix(raw) — the redacted row proves WHICH
// link was sent without carrying the capability itself.
//
// Documented residuals (intentionally out of this slice):
//  · admin_otp bodies contain the 6-digit OTP. It is short-lived and hashed
//    at rest in its own table; phaseDHygiene's test flow reads it from the
//    log row, and its exposure window is better bounded by retention
//    (OD-11, owner-set windows) than by redaction.
//  · seed.ts writes demo NotificationLog rows directly (bypasses the
//    sendNotification chokepoint); dev/demo only — production does no demo
//    seeding (settled decision).

// Token-bearing query params. The optional "amp;" group covers HTML-escaped
// URLs (&amp;invite=...) produced by template substitution. The 12-char
// floor keeps short non-secret params (?view=checklist) untouched; real
// capability tokens are 32+ chars of base64url.
const TOKEN_PARAM = /([?&])(amp;)?(r|verify|invite|token)=([A-Za-z0-9_-]{12,})/g;

export function tokenDigestPrefix(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 10);
}

/** Scrub bearer-token URLs out of a log-bound string. Idempotent. */
export function scrubLogText(text: string): string {
  if (!text) return text;
  return text.replace(TOKEN_PARAM, (_match, lead: string, amp: string | undefined, param: string, raw: string) =>
    `${lead}${amp ?? ""}${param}=<redacted:${tokenDigestPrefix(raw)}>`,
  );
}
