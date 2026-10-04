import { db } from "@/lib/db";

// ── Credit ledger — the money layer ────────────────────────────────
// Every outbound verification (reference request, checklist invite)
// spends exactly 1 credit. Grants and superadmin adjustments are ledger
// rows too, so the balance is fully reconstructible and immutable.

export interface LedgerResult {
  ok: boolean;
  balance: number;
  error?: string;
  status?: number; // suggested HTTP status when ok === false
}

export async function creditBalance(agencyId: string): Promise<number> {
  const agg = await db.creditLedger.aggregate({
    where: { agencyId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}

// The gate: can this company send anything outbound right now?
// Order matters — company state first, then balance (unless post-paid overage).
export async function assertCanVerify(agencyId: string): Promise<LedgerResult> {
  const agency = await db.agency.findUnique({ where: { id: agencyId } });
  if (!agency) return { ok: false, balance: 0, error: "Company not found", status: 404 };
  if (agency.status === "SUSPENDED") {
    return { ok: false, balance: 0, error: "This company account is suspended — outbound verifications are blocked. Contact VaultVerify support.", status: 403 };
  }
  if (agency.status === "READ_ONLY") {
    return { ok: false, balance: 0, error: "This company is in read-only mode — outbound verifications are paused.", status: 403 };
  }
  if (!agency.allowOverage) {
    const balance = await creditBalance(agencyId);
    if (balance <= 0) {
      return { ok: false, balance, error: "No verification credits remaining. Request more credits to continue.", status: 402 };
    }
    return { ok: true, balance };
  }
  return { ok: true, balance: await creditBalance(agencyId) };
}

// Spend 1 credit (or any amount) — caller MUST have passed assertCanVerify
// first. Writes the ledger row with the running balance.
export async function creditSpend(
  agencyId: string,
  reason: string,
  amount = 1,
  actorType = "SYSTEM",
  actorId = "",
): Promise<LedgerResult> {
  const balance = await creditBalance(agencyId);
  const balanceAfter = balance - amount;
  await db.creditLedger.create({
    data: { agencyId, delta: -amount, reason, actorType, actorId, balanceAfter },
  });
  return { ok: true, balance: balanceAfter };
}

// Superadmin grant / deduction with a mandatory reason. Deltas may be
// positive or negative; the ledger keeps the full history either way.
export async function creditAdjust(
  agencyId: string,
  delta: number,
  reason: string,
  actorId = "superadmin",
): Promise<LedgerResult> {
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, balance: await creditBalance(agencyId), error: "Credit adjustment must be a non-zero number" };
  }
  const balance = await creditBalance(agencyId);
  const balanceAfter = balance + Math.trunc(delta);
  await db.creditLedger.create({
    data: { agencyId, delta: Math.trunc(delta), reason: reason || "Superadmin adjustment", actorType: "SUPERADMIN", actorId, balanceAfter },
  });
  return { ok: true, balance: balanceAfter };
}

// The one agency mapping used while the platform runs a single tenant.
// When tier-2 (linked) admins ship, this becomes per-recruiter-account.
export async function primaryAgencyId(): Promise<string | null> {
  const agency = await db.agency.findFirst({ orderBy: { createdAt: "asc" } });
  return agency?.id ?? null;
}
