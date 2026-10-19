// SESSION-RESTORE (owner-reported refresh logout, fixed 2026-10-19):
// a browser that has signed into BOTH portals carries vv_ck (candidate) AND
// vv_rc (recruiter). The /api/auth "me" probe answered candidate-first with a
// fixed order, so refreshing the recruiter dashboard bounced straight to the
// login gate even though the recruiter cookie was live. The fix has two
// halves — the server accepts a role HINT on "me" (probe order bias), and the
// client records which portal this browser last used so the homepage boot
// probe restores THAT portal. This module is the tiny client-side half:
// best-effort localStorage marker, safe in private mode.

export type LastRole = "RECRUITER" | "CANDIDATE";

const KEY = "vv_last_role";

export function markLastRole(role: LastRole): void {
  try {
    localStorage.setItem(KEY, role);
  } catch {
    /* private mode / storage blocked — the hint is best-effort only */
  }
}

export function readLastRole(): LastRole | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "RECRUITER" || v === "CANDIDATE" ? v : null;
  } catch {
    return null;
  }
}

// Signing out must end the "returning user" treatment: the homepage boot
// probe only runs when this marker exists, so a signed-out browser paints
// the landing instantly instead of probing for a session that is gone.
export function clearLastRole(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
