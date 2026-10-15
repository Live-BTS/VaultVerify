import { db } from "@/lib/db";
import { assertCanVerify, primaryAgencyId } from "@/lib/bts/credits";
import { assertPlatformWritable } from "@/lib/bts/platform";

// ── Enforcement guard — the command layer ──────────────────────────
// Every mutating user-facing route calls into this before touching data.
// Fail-closed: unknown state means "deny".

export interface GuardResult {
  ok: boolean;
  error?: string;
  status?: number;
  agencyId?: string;
}

const fail = (error: string, status: number): GuardResult => ({ ok: false, error, status });

// Outbound verification actions (reference requests, checklist invites):
// maintenance mode, company state, and credit balance are all enforced here.
export async function guardOutbound(agencyId?: string | null): Promise<GuardResult> {
  const writable = await assertPlatformWritable();
  if (!writable.ok) return fail(writable.error ?? "Platform is in maintenance mode", 503);
  const id = agencyId ?? (await primaryAgencyId());
  if (!id) return fail("No company is registered on this platform yet", 503);
  const verdict = await assertCanVerify(id);
  if (!verdict.ok) return fail(verdict.error ?? "Verification blocked", verdict.status ?? 403);
  return { ok: true, agencyId: id };
}

// Candidate accounts: suspended users are rejected wherever they authenticate.
export async function guardCandidateAccount(accountId: string): Promise<GuardResult> {
  const account = await db.checklistAccount.findUnique({ where: { id: accountId } });
  if (!account) return fail("Account not found", 404);
  if (account.status === "SUSPENDED") return fail("This account is suspended. Contact VaultVerify support.", 403);
  return { ok: true };
}

// Recruiter accounts: same rule.
export async function guardRecruiterAccount(accountId: string): Promise<GuardResult> {
  const account = await db.recruiterAccount.findUnique({ where: { id: accountId } });
  if (!account) return fail("Account not found", 404);
  if (account.status === "SUSPENDED") return fail("This account is suspended. Contact VaultVerify support.", 403);
  return { ok: true };
}

// Kill every live session for a suspended (or compromised) account.
export async function killCandidateSessions(accountId: string): Promise<number> {
  const gone = await db.checklistSession.deleteMany({ where: { accountId } });
  return gone.count;
}

export async function killRecruiterSessions(accountId: string): Promise<number> {
  const gone = await db.recruiterSession.deleteMany({ where: { accountId } });
  return gone.count;
}
