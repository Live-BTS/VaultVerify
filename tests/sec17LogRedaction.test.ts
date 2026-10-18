import { beforeAll, describe, it, expect, vi } from "vitest";

// ── SEC-17: log redaction (token-bearing bodies + referee-email detail) ──
// Two redaction surfaces, one finding:
// 1. NotificationLog bodies used to carry bearer-token URLs verbatim — fixed
//    at the sendNotification chokepoint (see logRedaction.ts header).
// 2. AuditEvent.detail used to duplicate referee emails (REQUEST_SENT ref,
//    REFERENCE_SWAPPED oldEmail) — fixed by dropping the PII; the event's
//    entityId still links to the access-controlled request row.
//
// Documented residuals: admin_otp bodies keep the 6-digit OTP (short-TTL,
// hashed in its own table, bounded by OD-11 retention later — and the
// phaseD hygiene test completes its flow by reading it from the log row);
// seed.ts demo rows bypass the chokepoint (dev only, no prod demo seeding);
// pre-fix rows keep their old bodies/detail until retention bounds them.

// Session mock (house pattern) — the routes call getAccount() via next/headers.
let CK_COOKIE: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "vv_ck" && CK_COOKIE ? { value: CK_COOKIE } : undefined),
    set: (name: string, value: string) => { if (name === "vv_ck") CK_COOKIE = value; },
    delete: (name: string) => { if (name === "vv_ck") CK_COOKIE = null; },
  }),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/bts/notifications";
import { scrubLogText, tokenDigestPrefix } from "@/lib/bts/logRedaction";
import { sha256Hex } from "@/lib/bts/tokens";
import { sha256 } from "@/lib/bts/auth";
import { hashPassword } from "@/lib/bts/checklistAuth";
import { POST as candidatePost } from "@/app/api/candidate/route";
import { POST as candidateActionsPost } from "@/app/api/candidate/actions/route";

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

describe("AuditEvent.detail referee-email redaction (integration)", () => {
  const jsonReq = (url: string, body: unknown) =>
    new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  beforeAll(async () => {
    // Onboarding + outbound require the vaultverify agency to exist and hold
    // credits (command layer). Idempotent — other files may have seeded it.
    await db.agency.create({ data: { name: "VaultVerify", slug: "vaultverify" } }).catch(() => null);
    const vv = await db.agency.findUnique({ where: { slug: "vaultverify" } });
    await db.creditLedger.create({ data: { agencyId: vv!.id, delta: 100, balanceAfter: 100, reason: "sec17" } });
  });

  async function signInAs(email: string): Promise<void> {
    const account = await db.checklistAccount.create({
      data: { email, name: "Sec17 User", passwordHash: hashPassword("password123"), emailVerified: true },
    });
    const sid = `cks_${crypto.randomUUID().replaceAll("-", "")}`;
    await db.checklistSession.create({ data: { id: sha256(sid), accountId: account.id, expiresAt: new Date(Date.now() + 86400_000) } });
    CK_COOKIE = sid;
  }

  it("REQUEST_SENT audit detail no longer stores the referee email", async () => {
    CK_COOKIE = null; // signed-out onboarding is a supported path
    const refEmail = `sec17-ref-${Date.now()}@phased.local`;
    const res = await candidatePost(jsonReq("/api/candidate", {
      fullName: "Sec17 Cand", email: `sec17-cand-${Date.now()}@phased.local`, phone: "", role: "RN", specialty: "ICU",
      yearsExperience: 1, city: "X", state: "Y", consentSignature: "sig", skills: [],
      references: [{ refName: "Sec17 Ref", refTitle: "RN", refEmail, refPhone: "", facilityName: "F", relationship: "Peer", workStartDate: "", workEndDate: "" }],
    }));
    expect([200, 201]).toContain(res.status);
    const requestId = (await res.json()).candidate.requests[0].id;
    const ev = await db.auditEvent.findFirst({ where: { action: "REQUEST_SENT", entityId: requestId } });
    expect(ev).toBeTruthy();
    expect(JSON.stringify(ev!.detail)).not.toContain(refEmail);
    expect(JSON.stringify(ev!.detail)).not.toContain("@");
  });

  it("REFERENCE_SWAPPED audit detail keeps oldId but drops the old referee email", async () => {
    const email = `sec17-swap-${Date.now()}@phased.local`;
    await signInAs(email);
    const oldRefEmail = `sec17-old-${Date.now()}@phased.local`;
    const created = await candidatePost(jsonReq("/api/candidate", {
      fullName: "Sec17 Swap", email, phone: "", role: "RN", specialty: "ICU",
      yearsExperience: 1, city: "X", state: "Y", consentSignature: "sig", skills: [],
      references: [{ refName: "Old Ref", refTitle: "RN", refEmail: oldRefEmail, refPhone: "", facilityName: "F", relationship: "Peer", workStartDate: "", workEndDate: "" }],
    }));
    const requestId = (await created.json()).candidate.requests[0].id;
    const swap = await candidateActionsPost(jsonReq("/api/candidate/actions", {
      action: "swap", requestId,
      replacement: { refName: "New Ref", refTitle: "RN", refEmail: `sec17-new-${Date.now()}@phased.local`, refPhone: "", facilityName: "F", relationship: "Peer" },
    }));
    expect(swap.status).toBe(200);
    const cand = await db.candidate.findFirst({ where: { email } });
    const rows = await db.referenceRequest.findMany({ where: { candidateId: cand!.id } });
    const fresh = rows.find((r) => r.status === "SENT")!;
    const ev = await db.auditEvent.findFirst({ where: { action: "REFERENCE_SWAPPED", entityId: fresh.id } });
    expect(ev).toBeTruthy();
    const detail = JSON.parse(ev!.detail || "{}") as { oldId?: string; oldEmail?: string };
    expect(detail.oldId).toBe(requestId); // trail stays correlatable
    expect(JSON.stringify(detail)).not.toContain(oldRefEmail);
    expect(JSON.stringify(detail)).not.toContain("@");
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
