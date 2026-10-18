import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

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

// Sum inside an interactive transaction (shared by the atomic spend below).
async function balanceInTx(tx: Prisma.TransactionClient, agencyId: string): Promise<number> {
  const agg = await tx.creditLedger.aggregate({ where: { agencyId }, _sum: { delta: true } });
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
// first. The balance read and the ledger insert run inside ONE interactive
// transaction: concurrent spends can no longer both observe the same balance
// and write colliding `balanceAfter` rows (ledger stays reconstructible).
export async function creditSpend(
  agencyId: string,
  reason: string,
  amount = 1,
  actorType = "SYSTEM",
  actorId = "",
): Promise<LedgerResult> {
  const balanceAfter = await db.$transaction(async (tx) => {
    const balance = await balanceInTx(tx, agencyId);
    const next = balance - amount;
    await tx.creditLedger.create({
      data: { agencyId, delta: -amount, reason, actorType, actorId, balanceAfter: next },
    });
    return next;
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
  // Reject fractional deltas: Math.trunc would silently write a 0-delta row
  // into the immutable ledger while reporting success.
  if (!Number.isFinite(delta) || Math.trunc(delta) !== delta) {
    return { ok: false, balance: await creditBalance(agencyId), error: "Credit adjustment must be a non-zero whole number" };
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
