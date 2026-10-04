import { db } from "@/lib/db";
import { getFraudConfig } from "./fraudConfig";

// ── Fraud & pattern detection (runs on every submission) ──────
// Rules (each switchable from the console via ./fraudConfig):
//  1. Free email address matching the candidate's surname
//  2. Duplicate signer IP across a candidate's references
//  3. Completion below the configurable seconds floor (default 60)
//  4. Employer-domain identity check failed / skipped
//
// Thresholds and per-rule switches live in the FRAUD_CONFIG PlatformConfig
// row (see ./fraudConfig) and are edited from the console — no code change
// needed to tune triage.

export interface FraudContext {
  requestId: string;
  candidateName: string;
  refEmail: string;
  signerIp: string;
  durationSeconds: number;
  identityMethod: string;
  verifiedDomain: string | null;
}

export interface FlagResult {
  type: string;
  detail: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export function surnameOf(fullName: string): string {
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  return parts[parts.length - 1].replace(/[^a-z]/g, "");
}

export function emailLocalPart(email: string): string {
  return (email.split("@")[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

export async function runFraudChecks(ctx: FraudContext): Promise<FlagResult[]> {
  const flags: FlagResult[] = [];
  const cfg = await getFraudConfig();
  if (!cfg.enabled) return flags;

  // 1. Free email + surname match between reference address and candidate surname
  const domain = ctx.refEmail.split("@")[1]?.toLowerCase() ?? "";
  const surname = surnameOf(ctx.candidateName);
  if (cfg.freeEmailSurname && cfg.freeEmailDomains.includes(domain) && surname.length >= cfg.minSurnameLength) {
    const local = emailLocalPart(ctx.refEmail);
    if (local.includes(surname)) {
      flags.push({
        type: "FREE_EMAIL_SURNAME_MATCH",
        detail: `Reference email uses free provider ${domain} and contains the candidate's surname "${surname}" (${ctx.refEmail}).`,
        severity: "HIGH",
      });
    }
  }

  // 2. Duplicate signer IP across the same candidate's references
  if (cfg.duplicateIp) {
    const request = await db.referenceRequest.findUnique({
      where: { id: ctx.requestId },
      include: { candidate: { include: { requests: { include: { response: true } } } } },
    });
    if (request && ctx.signerIp) {
      const sibling = request.candidate.requests.find((r) => r.id !== ctx.requestId && r.response?.signerIp === ctx.signerIp && ctx.signerIp !== "");
      if (sibling) {
        flags.push({
          type: "DUPLICATE_IP",
          detail: `Same IP (${ctx.signerIp}) was also used by "${sibling.refName}'s" reference submission for this candidate.`,
          severity: "HIGH",
        });
      }
    }
  }

  // 3. Completion below the configured seconds floor
  if (cfg.rapidCompletion && ctx.durationSeconds > 0 && ctx.durationSeconds < cfg.rapidSeconds) {
    flags.push({
      type: "RAPID_COMPLETION",
      detail: `Form completed in ${ctx.durationSeconds}s — below the ${cfg.rapidSeconds}s floor for a genuine reference.`,
      severity: "MEDIUM",
    });
  }

  // 4. Identity verification skipped entirely
  //    "ACCOUNT" counts as verified: the referrer created their VaultVerify
  //    account with the exact email the candidate provided on a signed,
  //    single-use link — a stronger anchor than a domain string match.
  if (cfg.identityUnverified && ctx.identityMethod === "SKIPPED") {
    flags.push({
      type: "IDENTITY_UNVERIFIED",
      detail: "Reference completed the form without creating a VaultVerify account or verifying identity via employer email domain or callback code.",
      severity: "LOW",
    });
  }

  // persist
  for (const f of flags) {
    await db.fraudFlag.create({
      data: { requestId: ctx.requestId, type: f.type, detail: f.detail, severity: f.severity },
    });
  }
  return flags;
}
