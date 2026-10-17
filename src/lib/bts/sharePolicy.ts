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

// ── CH-06: per-recipient binding (PO decision: specific-recruiter sharing by
// default; "anyone with this link" only on the candidate's explicit choice) ──
// A share link is bound when EITHER recipient field is set. Bound links open
// only for that recruiter (matched by account id or, if they signed up later,
// by account email). Both fields null = OPEN link — legacy rows grandfathered
// exactly as issued, and the explicit candidate "anyone" choice. No record
// migration ever auto-binds an existing link.

export type ShareAudience = "SPECIFIC" | "ANYONE";

export interface RecipientBindingLike {
  recipientRecruiterId: string | null;
  recipientEmail: string | null;
}

export interface ShareViewer {
  recruiterId?: string | null;
  recruiterEmail?: string | null;
}

/** True when the viewer may open this link through its recipient binding. */
export function viewerAllowedByRecipient(link: RecipientBindingLike, viewer: ShareViewer | null): boolean {
  if (!link.recipientRecruiterId && !link.recipientEmail) return true; // OPEN link
  if (!viewer) return false;
  if (link.recipientRecruiterId && link.recipientRecruiterId === viewer.recruiterId) return true;
  const email = (viewer.recruiterEmail ?? "").toLowerCase();
  if (link.recipientEmail && email && link.recipientEmail.toLowerCase() === email) return true;
  return false;
}

/** Normalize client input into the stored binding for a NEW share link. */
export function resolveNewShareBinding(
  audience: unknown,
  recipientEmail: unknown,
): { ok: true; audience: ShareAudience; recipientEmail: string | null } | { ok: false; error: string } {
  if (audience === "ANYONE") return { ok: true, audience: "ANYONE", recipientEmail: null };
  // SPECIFIC is the default — the candidate must name the recipient.
  const email = String(recipientEmail ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter the recipient recruiter's email, or explicitly choose “anyone with the link”." };
  }
  return { ok: true, audience: "SPECIFIC", recipientEmail: email };
}

// ── CH-08: one-time links deliver protected content ONCE — atomically ──
// Consumption is a single conditional UPDATE (… WHERE viewedAt IS NULL), so
// two concurrent requests can never both win — on SQLite and Postgres alike.
// The consumption event is the FIRST protected-content delivery: the resolve
// view, or a direct PDF download when the link was never resolved. After
// consumption, the same viewing session keeps a bounded save window (print /
// save the just-delivered report — the view's own copy promises this), then
// every public surface rejects the link for good.

/** Minutes a consumed ONE_TIME link stays readable for saving/printing. */
export const SHARE_SAVE_WINDOW_MINUTES = 30;

/** True while a consumed one-time link is still inside its save window. */
export function isWithinSaveWindow(viewedAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!viewedAt) return false;
  return now.getTime() - new Date(viewedAt).getTime() <= SHARE_SAVE_WINDOW_MINUTES * 60 * 1000;
}

/**
 * Companion-read decision: same policy as evaluateChecklistShare, except a
 * consumed ONE_TIME link is still readable inside its save window. Used by the
 * answers fetch and PDF downloads that belong to the delivery the resolve view
 * just made ("save the PDF if you need it") — never a second full delivery.
 */
export function evaluateCompanionRead(
  link: (ShareLinkLike & { recipientRecruiterId: string | null; recipientEmail: string | null }) | null,
  completion: CompletionLike | undefined,
  now: Date = new Date(),
): ShareDecision {
  const decision = evaluateChecklistShare(link, completion, now);
  if (!decision.ok && decision.reason === "used" && isWithinSaveWindow(link?.viewedAt, now)) {
    return { ok: true, status: 200 };
  }
  return decision;
}
