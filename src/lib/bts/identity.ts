import { Prisma } from "@prisma/client";

// ── Phase E — unified identity: one shared identity, separate workflows ──
// A single ChecklistAccount (one login) drives BOTH product workflows: the
// skills checklist (native account data) and the references workflow (the
// legacy `Candidate` row = the account's "references profile").
//
// Resolution order:
//   1. accountId link (authoritative — stamped at onboarding, or linked by
//      scripts/e-unify-accounts.ts);
//   2. exact email match on UNLINKED rows only (pre-unification legacy rows,
//      retired once the owner runs the backfill).
// The email fallback is deliberately restricted to `accountId: null` rows so
// a linked profile can never be shadowed by an email coincidence.
//
// Call sites keep full Prisma type inference by passing this where-clause into
// their own findFirst with the include/select they need.

export function candidateProfileWhere(account: { id: string; email: string }): Prisma.CandidateWhereInput {
  return {
    OR: [
      { accountId: account.id },
      { accountId: null, email: account.email.toLowerCase().trim() },
    ],
  };
}

/** Stamps the accountId link on a freshly created references profile. */
export function withAccountLink(accountId: string | null | undefined): { accountId?: string } {
  return accountId ? { accountId } : {};
}
