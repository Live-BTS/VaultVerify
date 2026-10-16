import { CHECKLIST_VALIDITY_DAYS } from "@/lib/bts/constants";

// ── Share-link access policy (single source of truth) ────────────
// Used by POST /api/checklist/share (resolve), GET /api/checklist/share/answers
// and the PDF route so every public read enforces the SAME rules in the SAME
// order: revoked → one-time-used → link-expired → report-expired.
// The 30-day report validity is server-enforced here, not just displayed.

export type ShareRejectReason = "invalid" | "used" | "expired" | "checklist_expired";

export interface ShareDecision {
  ok: boolean;
  status: number; // HTTP status for the rejection
  reason?: ShareRejectReason;
}

interface ShareLinkLike {
  revoked: boolean;
  accessType: string; // ONE_TIME | DURATION
  viewedAt: Date | null;
  expiresAt: Date | null;
}

interface CompletionLike {
  expiresAt: Date;
}

/** Exact validity boundary: a report is NOT valid at or after its expiresAt. */
export function isChecklistExpired(completion: CompletionLike, now: Date = new Date()): boolean {
  return completion.expiresAt <= now;
}

/** Full decision for a checklist share link against its completion. */
export function evaluateChecklistShare(
  link: ShareLinkLike | null,
  completion: CompletionLike | undefined,
  now: Date = new Date(),
): ShareDecision {
  if (!link || !completion || link.revoked) return { ok: false, status: 404, reason: "invalid" };
  if (link.accessType === "ONE_TIME" && link.viewedAt) return { ok: false, status: 403, reason: "used" };
  if (link.expiresAt && link.expiresAt < now) return { ok: false, status: 403, reason: "expired" };
  if (isChecklistExpired(completion, now)) return { ok: false, status: 403, reason: "checklist_expired" };
  return { ok: true, status: 200 };
}

export const REPORT_VALIDITY_DAYS = CHECKLIST_VALIDITY_DAYS;
