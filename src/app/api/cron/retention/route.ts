import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { pruneOldLogs, configuredNotificationRetentionDays } from "@/lib/bts/hygiene";
import { logAudit } from "@/lib/bts/audit";

// ── GET /api/cron/retention — scheduled OD-11 enforcement (vercel.json) ──
// Runs the same retention pass as the superadmin console's opportunistic
// sweep and its owner-only retention_sweep action, so the 90-day body purge,
// the 24-hour OTP tier and the self-healing token scrub do not depend on
// console traffic. Schedule lives in vercel.json (daily 03:00 UTC).
//
// AUTH — fail closed, always: the endpoint answers only when the request
// carries `Authorization: Bearer <CRON_SECRET>` AND the CRON_SECRET env var
// is set (Vercel injects that header automatically for cron invocations when
// the variable exists). No secret configured → every call is rejected, so a
// forgotten variable can never silently open the endpoint. Comparison is via
// SHA-256 digests under timingSafeEqual — no timing oracle on the secret.
//
// RESPONSE — aggregate counts only, never row content. An audit row
// (RETENTION_SWEEP_CRON) records each successful pass.

export const dynamic = "force-dynamic";

function bearerOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const presented = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !presented) return false;
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(presented).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!bearerOk(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }
  const sweep = await pruneOldLogs(await configuredNotificationRetentionDays());
  await logAudit({
    actorType: "SYSTEM",
    actorId: "cron",
    action: "RETENTION_SWEEP_CRON",
    detail: {
      purged: sweep.purgedNotificationBodies,
      scrubbed: sweep.scrubbedRetainedBodies,
      auditBeyondRetention: sweep.auditBeyondRetention,
    },
  });
  return NextResponse.json({ ok: true, ...sweep });
}
