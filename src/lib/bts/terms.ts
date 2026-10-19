import { createHash } from "crypto";

// ── SEC-16: consent/attestation versioning ────────────────────────
// Every captured consent and checklist attestation now records WHICH policy
// version the signer saw and a content hash of that version's canonical
// statement — so a signature can always be tied to the exact wording in force
// at signing time, without storing the wording itself on the row.
//
// The canonical v1 statement below mirrors the consent copy shown in the
// candidate wizard (CandidateWizard.tsx) at the time this version was cut.
// Bumping the wording = a NEW version constant + updated statement; never
// edit a released version in place. The legal wording itself remains the
// owner's review item (audit §14) — this module makes it auditable either way.
export const TERMS_VERSION = "2025-11-consent-v1";

export const CONSENT_STATEMENT = [
  "I confirm the profile and self-reported skills I submitted are accurate to the best of my knowledge.",
  "I consent to my references being contacted through VaultVerify for verification of my stated experience.",
  "I release all parties from liability for information provided in good faith. This consent is stored with my profile before any outreach is made.",
].join(" ");

// Short content hash of the canonical statement (first 16 hex of SHA-256) —
// enough to detect any wording drift for a given version, cheap to store in
// attestation JSON and audit details.
export function termsContentHash(): string {
  return createHash("sha256").update(CONSENT_STATEMENT.trim()).digest("hex").slice(0, 16);
}
