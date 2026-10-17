import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { deriveCallbackCode, isTokenHashed } from "./tokens";

// ── D4b (Option C — Encrypt at Rest): ReferenceRequest tokens ────
// The referee-form bearer token (/?r=<token>) is stored TWICE, in two
// complementary forms, so that NO plaintext token ever sits in the database:
//
//   token          → SHA-256 hex DIGEST of the raw token (unique lookup key,
//                    same convention as D4 for share/invite links).
//   tokenEncrypted → authenticated AES-256-GCM ENVELOPE of the raw token.
//
// The digest alone cannot rebuild the link (digests are one-way), and the
// referee reminder workflow must keep re-sending the EXISTING link — so the
// encrypted copy exists precisely to serve re-display and reminder email
// rebuilds without plaintext at rest. Validation never needs the envelope:
// inbound links are hashed and looked up by digest, so a lost or rotated
// key degrades re-display/reminders but NEVER breaks link validation.
//
// Envelope format (URL-safe, self-describing, rotation-ready):
//   v<n>.<iv base64url>.<authTag base64url>.<ciphertext base64url>
// The version prefix selects the key (v2 = current after a rotation, v1 =
// the previous key), and is bound into the GCM Additional Authenticated
// Data together with the record context — the whole header is authenticated,
// so any tampering with version, IV, tag or ciphertext fails verification.
//
// Key material (SERVER ONLY — never commit, never send to the client, never
// log): REFERENCE_TOKEN_ENCRYPTION_KEY, 32 random bytes as base64 or hex
// (`openssl rand -base64 32`). Optional REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS
// holds the prior key during a rotation window (see DEPLOY runbook):
//   • encryption always uses the CURRENT key and stamps v2 when a previous
//     key is configured (v1 otherwise);
//   • decryption accepts v2 (current) and v1 (previous, or current when no
//     rotation happened yet).
// One rotation generation is supported at a time — re-run the backfill/
// re-encrypt script and drop *_PREVIOUS before starting the next rotation.
//
// Honest limitation (by design of "encrypt at rest"): anyone holding the
// encryption key can recover raw tokens. That is exactly what distinguishes
// Option C from Option A hashing — it is the price of keeping the resend
// workflow. The key therefore lives only in the server environment.

const CURRENT_VERSION = 1; // version stamped when NO previous key is configured
const ROTATED_VERSION = 2; // version stamped once a previous key exists
const AAD_CONTEXT = "ReferenceRequest";

function decodeKeyMaterial(value: string, envName: string): Buffer {
  const v = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) {
    const hex = Buffer.from(v, "hex");
    if (hex.length === 32) return hex;
  }
  const b64 = Buffer.from(v, "base64"); // lenient decode — validated by length
  if (b64.length === 32) return b64;
  throw new Error(
    `[D4b] ${envName} is set but unusable: expected 32 random bytes as base64 or hex (openssl rand -base64 32).`,
  );
}

interface KeyRing {
  current: Buffer;
  previous: Buffer | null;
}

function keyRing(): KeyRing {
  const currentEnv = process.env.REFERENCE_TOKEN_ENCRYPTION_KEY;
  if (!currentEnv || !currentEnv.trim()) {
    throw new Error(
      "[D4b] REFERENCE_TOKEN_ENCRYPTION_KEY is not configured — cannot encrypt/decrypt ReferenceRequest tokens. Set it in the server environment (see DEPLOY.md runbook).",
    );
  }
  const prevEnv = process.env.REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS;
  return {
    current: decodeKeyMaterial(currentEnv, "REFERENCE_TOKEN_ENCRYPTION_KEY"),
    previous: prevEnv && prevEnv.trim() ? decodeKeyMaterial(prevEnv, "REFERENCE_TOKEN_ENCRYPTION_KEY_PREVIOUS") : null,
  };
}

function aadFor(version: number): Buffer {
  return Buffer.from(`${AAD_CONTEXT}:v${version}`);
}

/** Encrypt a raw referee token into its self-describing GCM envelope. */
export function encryptRefToken(raw: string): string {
  const { current, previous } = keyRing();
  const version = previous ? ROTATED_VERSION : CURRENT_VERSION;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current, iv);
  cipher.setAAD(aadFor(version));
  const ct = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${version}`,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

/** Decrypt an envelope back to the raw token. Throws on ANY tamper/config failure. */
export function decryptRefToken(envelope: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || !/^v[12]$/.test(parts[0])) {
    throw new Error("[D4b] Malformed token envelope — refusing to process.");
  }
  const version = Number(parts[0].slice(1));
  const { current, previous } = keyRing();
  const key = version === ROTATED_VERSION ? current : (previous ?? current);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64url"));
    decipher.setAAD(aadFor(version));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("[D4b] Token envelope failed authentication — wrong key, unsupported rotation state, or tampered data.");
  }
}

/** Shape of a ReferenceRequest row needed by the resolvers below. */
export interface RefTokenRow {
  id: string;
  token: string;
  tokenEncrypted: string | null;
}

/**
 * Resolve the RAW token of a stored row:
 *   1. encrypted envelope → decrypt (authoritative post-cutover form);
 *   2. legacy plaintext row (pre-backfill) → the stored value itself;
 *   3. digest without an envelope → unrecoverable → null.
 * Throws when the envelope is present but the key is misconfigured — display
 * and reminder callers wrap this and degrade gracefully.
 */
export function rawTokenFor(row: RefTokenRow): string | null {
  if (row.tokenEncrypted) return decryptRefToken(row.tokenEncrypted);
  if (!isTokenHashed(row.token)) return row.token; // legacy row, not yet migrated
  return null;
}

/** Like rawTokenFor but degrades to null (with a one-line error log) on key/config failure. Never logs token material. */
export function rawTokenForSafe(row: RefTokenRow): string | null {
  try {
    return rawTokenFor(row);
  } catch (e) {
    console.error(`[D4b] Cannot rebuild reference link for request ${row.id}: ${e instanceof Error ? e.message : "unknown error"}`);
    return null;
  }
}

/** Rebuild the referee form link for a stored row (null when unrecoverable). */
export function refLinkFor(row: RefTokenRow, baseUrl: string): string | null {
  const raw = rawTokenForSafe(row);
  return raw ? `${baseUrl}/?r=${raw}` : null;
}

/** Recompute the 6-digit callback code for a stored row (null when unrecoverable). */
export function callbackCodeFor(row: RefTokenRow): string | null {
  const raw = rawTokenForSafe(row);
  return raw ? deriveCallbackCode(raw) : null;
}
