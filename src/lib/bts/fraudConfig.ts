import { getPlatformFlag, setPlatformFlag } from "./platform";

// ── Fraud detection tuning (Phase 3) ───────────────────────────────
// The fraud rules in ./fraud.ts used to be hardcoded. Their thresholds and
// per-rule switches now live in PlatformConfig under FRAUD_CONFIG as JSON,
// editable from the console (System & APIs → Fraud detection tuning) so
// triage tuning never needs a code change. Missing/garbled config always
// falls back to these defaults — fail-safe, never fail-open-by-accident.

export const FRAUD_CONFIG_KEY = "FRAUD_CONFIG";

export interface FraudConfig {
  enabled: boolean;          // master switch — false skips every rule
  freeEmailSurname: boolean; // rule 1: free provider + candidate surname in the local part
  duplicateIp: boolean;      // rule 2: same signer IP across a candidate's references
  rapidCompletion: boolean;  // rule 3: completed below the seconds floor
  identityUnverified: boolean; // rule 4: identity check skipped entirely
  rapidSeconds: number;      // the seconds floor for rule 3 (default 60)
  minSurnameLength: number;  // surname must be at least this long for rule 1
  freeEmailDomains: string[]; // free providers matched by rule 1
}

export const DEFAULT_FRAUD_CONFIG: FraudConfig = {
  enabled: true,
  freeEmailSurname: true,
  duplicateIp: true,
  rapidCompletion: true,
  identityUnverified: true,
  rapidSeconds: 60,
  minSurnameLength: 3,
  freeEmailDomains: ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "mail.com", "proton.me"],
};

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const cleanDomains = (raw: unknown): string[] => {
  const list = Array.isArray(raw) ? raw : [];
  const out = list
    .map((d) => String(d).trim().toLowerCase().replace(/^@+/, ""))
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
  return [...new Set(out)].slice(0, 50);
};

// Accepts anything (console JSON, hand-edited rows) and returns a valid config.
export function normalizeFraudConfig(raw: unknown): FraudConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_FRAUD_CONFIG;
  const domains = cleanDomains(r.freeEmailDomains);
  return {
    enabled: r.enabled === undefined ? d.enabled : !!r.enabled,
    freeEmailSurname: r.freeEmailSurname === undefined ? d.freeEmailSurname : !!r.freeEmailSurname,
    duplicateIp: r.duplicateIp === undefined ? d.duplicateIp : !!r.duplicateIp,
    rapidCompletion: r.rapidCompletion === undefined ? d.rapidCompletion : !!r.rapidCompletion,
    identityUnverified: r.identityUnverified === undefined ? d.identityUnverified : !!r.identityUnverified,
    rapidSeconds: clampInt(r.rapidSeconds, 10, 600, d.rapidSeconds),
    minSurnameLength: clampInt(r.minSurnameLength, 1, 10, d.minSurnameLength),
    freeEmailDomains: domains.length ? domains : d.freeEmailDomains,
  };
}

export async function getFraudConfig(): Promise<FraudConfig> {
  const raw = await getPlatformFlag(FRAUD_CONFIG_KEY);
  if (!raw) return DEFAULT_FRAUD_CONFIG;
  try {
    return normalizeFraudConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_FRAUD_CONFIG;
  }
}

export async function setFraudConfig(config: FraudConfig, updatedBy = "superadmin"): Promise<void> {
  await setPlatformFlag(FRAUD_CONFIG_KEY, JSON.stringify(config), updatedBy);
}
