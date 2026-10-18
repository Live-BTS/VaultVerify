import { db } from "@/lib/db";

// ── EMAIL-EXCLUSIVITY (owner rule, one email = one identity type) ──────────
// A recruiter-registered email can never register as a candidate, and a
// candidate-registered email can never register as a recruiter. The two
// identity surfaces are:
//   recruiter  — RecruiterAccount (recruiter unified login)
//   candidate  — ChecklistAccount (candidate unified login) or an unlinked
//                Candidate profile row in the references workflow
// Call sites: /api/auth signup (both roles) and the reference claim flow's
// account auto-creation. Emails are stored lowercase everywhere; callers
// normalize before invoking.

export type EmailIdentityConflict = "recruiter" | "candidate" | null;

export async function emailIdentityConflict(email: string): Promise<EmailIdentityConflict> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const recruiter = await db.recruiterAccount.findUnique({ where: { email: e } });
  if (recruiter) return "recruiter";
  const candidateAccount = await db.checklistAccount.findUnique({ where: { email: e } });
  if (candidateAccount) return "candidate";
  const candidateProfile = await db.candidate.findFirst({ where: { email: e } });
  if (candidateProfile) return "candidate";
  return null;
}
