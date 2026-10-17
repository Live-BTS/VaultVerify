import { describe, it, expect } from "vitest";

// ── SEC-17: NotificationLog redaction (token-bearing bodies) ──────
// Invite/reminder/verification bodies carry bearer-token URLs. Until this
// slice, sendNotification persisted them VERBATIM — every log row held a
// working capability (reference form, email confirmation, checklist invite),
// so any DB or log compromise yielded usable links (audit SEC-17/UX-A7/TA-M4).
//
// Fix shape: redaction at the sendNotification chokepoint, AFTER the provider
// receives the original payload (recipients keep working links) and BEFORE
// the persist. The raw token is replaced by a 10-hex SHA-256 digest prefix
// (same unsalted convention as the D4 token-at-rest cutover) so a row can
// still be correlated to a known token without carrying the capability.
//
// Documented residuals: admin_otp bodies keep the 6-digit OTP (short-TTL,
// hashed in its own table, bounded by OD-11 retention later — and the
// phaseD hygiene test completes its flow by reading it from the log row);
// seed.ts demo rows bypass the chokepoint (dev only, no prod demo seeding).

import { db } from "@/lib/db";
import { sendNotification } from "@/lib/bts/notifications";
import { scrubLogText, tokenDigestPrefix } from "@/lib/bts/logRedaction";
import { sha256Hex } from "@/lib/bts/tokens";

const REF_TOKEN = "AbC-123_xYz789qrsTuv0123456789ab"; // 32-char base64url shape
const INVITE_TOKEN = "Zx9-_87qrsTuv0123456789abcdefghijklmnop";
const VERIFY_TOKEN = "VfY-9876qrsTuv0123456789qrstuvwx";

describe("scrubLogText (unit)", () => {
  it("scrubs the reference token from a plain-text body, keeping surrounding text", () => {
    const body = `Acme reference request: 3-5 minutes. Secure link: https://vaultverify.vercel.app/?r=${REF_TOKEN}`;
    const out = scrubLogText(body);
    expect(out).not.toContain(REF_TOKEN);
    expect(out).toContain(`?r=<redacted:${tokenDigestPrefix(REF_TOKEN)}>`);
    expect(out).toContain("Acme reference request: 3-5 minutes. Secure link: https://vaultverify.vercel.app/");
  });

  it("scrubs HTML-escaped invite params (&amp;invite=) without touching other params", () => {
    const html = `<a href="https://vaultverify.vercel.app/?view=checklist&amp;invite=${INVITE_TOKEN}">Open my checklist</a>`;
    const out = scrubLogText(html);
    expect(out).not.toContain(INVITE_TOKEN);
    expect(out).toContain(`&amp;invite=<redacted:${tokenDigestPrefix(INVITE_TOKEN)}>`);
    expect(out).toContain("?view=checklist&amp;"); // non-secret param survives
    expect(out).toContain(`">Open my checklist</a>`); // markup intact
  });

  it("scrubs email-verification tokens", () => {
    const out = scrubLogText(`https://vaultverify.vercel.app/?verify=${VERIFY_TOKEN}`);
    expect(out).not.toContain(VERIFY_TOKEN);
    expect(out).toContain(`?verify=<redacted:${tokenDigestPrefix(VERIFY_TOKEN)}>`);
  });

  it("leaves short values and non-token params untouched (no over-redaction)", () => {
    const text = "Check https://vaultverify.vercel.app/?view=checklist and ?r=abc (too short to be a token)";
    expect(scrubLogText(text)).toBe(text);
  });

  it("scrubs every occurrence in one string", () => {
    const text = `/?r=${REF_TOKEN} and /?verify=${VERIFY_TOKEN} and /?r=${REF_TOKEN} again`;
    const out = scrubLogText(text);
    expect(out).not.toContain(REF_TOKEN);
    expect(out).not.toContain(VERIFY_TOKEN);
    expect(out.match(/<redacted:/g)).toHaveLength(3);
  });

  it("tokenDigestPrefix is the unsalted sha256Hex prefix (D4 convention)", () => {
    expect(tokenDigestPrefix(REF_TOKEN)).toBe(sha256Hex(REF_TOKEN).slice(0, 10));
  });
});

describe("sendNotification redaction (integration)", () => {
  it("persists a scrubbed body but intact delivery metadata", async () => {
    const row = await sendNotification({
      channel: "SMS",
      kind: "INVITE",
      to: "5551234567",
      body: `Reference request from Acme. Secure link: https://vaultverify.vercel.app/?r=${REF_TOKEN}`,
    });
    const stored = await db.notificationLog.findUnique({ where: { id: row.id } });
    expect(stored).toBeTruthy();
    expect(stored!.body).not.toContain(REF_TOKEN);
    expect(stored!.body).toContain(`?r=<redacted:${tokenDigestPrefix(REF_TOKEN)}>`);
    expect(stored!.channel).toBe("SMS");
    expect(stored!.kind).toBe("INVITE");
    expect(stored!.status).toBe("SIMULATED");
  });

  it("scrubs html copies as well as text bodies", async () => {
    const row = await sendNotification({
      channel: "EMAIL",
      kind: "INVITE",
      to: `sec17-${Date.now()}@example.com`,
      subject: "Start the reference",
      body: `Paste this link: https://vaultverify.vercel.app/?r=${REF_TOKEN}`,
      html: `<a href="https://vaultverify.vercel.app/?r=${REF_TOKEN}">Start</a>`,
    });
    const stored = await db.notificationLog.findUnique({ where: { id: row.id } });
    expect(stored!.body).not.toContain(REF_TOKEN);
    expect(stored!.html).not.toContain(REF_TOKEN);
    expect(stored!.html).toContain(`?r=<redacted:${tokenDigestPrefix(REF_TOKEN)}>`);
  });

  it("scrubs subjects too, and leaves token-free content byte-identical", async () => {
    const cleanBody = "Your skills checklist report is ready to download.";
    const row = await sendNotification({
      channel: "EMAIL",
      kind: "COMPLETION",
      to: `sec17-clean-${Date.now()}@example.com`,
      subject: `Verify https://vaultverify.vercel.app/?r=${REF_TOKEN}`,
      body: cleanBody,
    });
    const stored = await db.notificationLog.findUnique({ where: { id: row.id } });
    expect(stored!.subject).not.toContain(REF_TOKEN);
    expect(stored!.subject).toContain(`?r=<redacted:${tokenDigestPrefix(REF_TOKEN)}>`);
    expect(stored!.body).toBe(cleanBody); // no over-redaction at the chokepoint
  });
});
