import { beforeAll, describe, it, expect, vi } from "vitest";

// ── SEC-F7: hardening tail batch ─────────────────────────────────
// One owner-directed push closing the remaining code-side register items:
//   SEC-19 — superadmin backup code compared constant-time (safeEqual)
//   SEC-14 — durable per-IP throttle on unauthenticated onboarding + a
//            CONSENT_CAPTURED audit stamp (version + content hash + digest)
//   SEC-16 — terms version/hash module backing the consent stamp
//   SEC-21 — API payloads stop surfacing config (emailLive) and candidate email
//   SEC-23 — referee account auto-creation sends the standard verification email
//   SEC-25 — invite delivery status surfaced (SENT/SIMULATED/FAILED), never swallowed
// (SEC-20 console storage and SEC-22 middleware wiring are pinned in
// secF7SourceGates; the CSP policy builder is unit-tested here.)

// Session mock (house pattern) — routes call getAccount() via next/headers.
let CK_COOKIE: string | null = null;
let RK_COOKIE: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "vv_ck" && CK_COOKIE ? { value: CK_COOKIE }
      : name === "vv_rc" && RK_COOKIE ? { value: RK_COOKIE }
      : undefined,
    set: (name: string, value: string) => { if (name === "vv_ck") CK_COOKIE = value; },
    delete: (name: string) => { if (name === "vv_ck") CK_COOKIE = null; },
  }),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { safeEqual, sha256 } from "@/lib/bts/auth";
import { buildDocumentCsp } from "@/lib/bts/csp";
import { TERMS_VERSION, termsContentHash, CONSENT_STATEMENT } from "@/lib/bts/terms";
import { ONBOARDING_MAX_PER_WINDOW } from "@/lib/bts/hygiene";
import { hashPassword } from "@/lib/bts/checklistAuth";
import { creditBalance } from "@/lib/bts/credits";
import { QUESTIONS as REF_QUESTIONS } from "@/lib/bts/questions";
import { POST as candidatePost } from "@/app/api/candidate/route";
import { POST as authPost } from "@/app/api/auth/route";
import { POST as invitePost } from "@/app/api/checklist/invite/route";
import { POST as referenceTokenPost } from "@/app/api/reference/[token]/route";

function jsonReq(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function refParams(token: string) {
  return { params: Promise.resolve({ token }) } as never;
}

function onboardingBody(email: string) {
  return {
    fullName: "F7 Cand", email, phone: "", role: "RN", specialty: "ICU",
    yearsExperience: 1, city: "X", state: "Y", consentSignature: "F7-consent-sig", skills: [],
    references: [{ refName: "F7 Ref", refTitle: "RN", refEmail: `f7-ref-for-${email}`, refPhone: "", facilityName: "F", relationship: "Peer", workStartDate: "", workEndDate: "" }],
  };
}

beforeAll(async () => {
  // Onboarding, invites and credit spends need the vaultverify agency funded.
  await db.agency.create({ data: { name: "VaultVerify", slug: "vaultverify" } }).catch(() => null);
  const vv = await db.agency.findUnique({ where: { slug: "vaultverify" } });
  const bal = await creditBalance(vv!.id);
  await db.creditLedger.create({ data: { agencyId: vv!.id, delta: 200, balanceAfter: bal + 200, reason: "secF7-seed" } }).catch(() => null);
  // A verified recruiter with a live session for the invite flow.
  const rec = await db.recruiterAccount.create({
    data: { email: `f7-rec-${Date.now()}@phased.local`, name: "F7 Recruiter", passwordHash: hashPassword("password123"), emailVerified: true, onboardingComplete: true },
  });
  const sid = `rks_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.recruiterSession.create({ data: { id: sha256(sid), accountId: rec.id, expiresAt: new Date(Date.now() + 86400_000) } });
  RK_COOKIE = sid;
});

describe("SEC-19 — constant-time backup-code compare", () => {
  it("equal strings match; same-length mismatches and length mismatches do not", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
    expect(safeEqual("abc123", "abc124")).toBe(false);
    expect(safeEqual("short", "a-longer-expected")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("SEC-22 — document CSP builder", () => {
  it("prod policy: nonce + strict-dynamic scripts, NO unsafe-inline in script-src", () => {
    const csp = buildDocumentCsp("abc123base64==", false);
    expect(csp).toContain("'nonce-abc123base64=='");
    expect(csp).toContain("'strict-dynamic'");
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).not.toContain("unsafe-inline");
    const style = csp.split("; ").find((d) => d.startsWith("style-src"))!;
    expect(style).toContain("unsafe-inline"); // documented residual (Tailwind/shadcn inline styles)
  });

  it("dev policy adds unsafe-eval for HMR; frame-ancestors/object-src stay closed", () => {
    const csp = buildDocumentCsp("n1", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});

describe("SEC-16 — terms versioning module", () => {
  it("exposes a version constant and a stable 16-hex content hash", () => {
    expect(TERMS_VERSION).toMatch(/^20\d{2}-\d{2}-consent-v\d+$/);
    expect(termsContentHash()).toMatch(/^[0-9a-f]{16}$/);
    expect(termsContentHash()).toBe(termsContentHash()); // deterministic
    expect(CONSENT_STATEMENT.toLowerCase()).toContain("consent");
  });
});

describe("SEC-21 — payloads stop surfacing config and candidate email", () => {
  it("signup response no longer carries the emailLive infrastructure flag", async () => {
    CK_COOKIE = null;
    const res = await authPost(jsonReq("/api/auth", {
      action: "signup", role: "RECRUITER", name: "F7 User",
      email: `f7-auth-${Date.now()}@phased.local`, password: "password123",
    }));
    expect([200, 201]).toContain(res.status);
    const d = await res.json();
    expect(d.checkEmail).toBe(true);
    expect("emailLive" in d).toBe(false);
  });
});

describe("SEC-25 — invite delivery status is surfaced honestly", () => {
  it("send response carries emailDelivery; the audit detail carries no candidate email", async () => {
    const res = await invitePost(jsonReq("/api/checklist/invite", {
      action: "send", candidateName: "F7 Invited Cand",
      candidateEmail: `f7-inv-${Date.now()}@phased.local`, candidatePhone: "5550001111",
      profession: "Nursing", jobTitle: "RN", specialty: "ICU",
    }));
    expect([200, 201]).toContain(res.status);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(["SENT", "SIMULATED", "FAILED"]).toContain(d.emailDelivery);
    const ev = await db.auditEvent.findFirst({ where: { action: "CHECKLIST_INVITE_SENT", entityId: d.invite.id } });
    expect(ev).toBeTruthy();
    expect(JSON.stringify(ev!.detail)).not.toContain("@"); // F4 consistency: no candidate email in audit
    expect(JSON.stringify(ev!.detail)).toContain("emailDelivery");
  });
});

describe("SEC-14 — durable per-IP onboarding throttle + consent stamp", () => {
  it("allows ONBOARDING_MAX_PER_WINDOW completed onboardings per IP, then 429s with retryAfterSeconds", async () => {
    const IP = `203.0.113.77-${Date.now()}`; // unique per run — count PROFILE_CREATED rows for THIS ip only
    for (let i = 0; i < ONBOARDING_MAX_PER_WINDOW; i++) {
      const res = await candidatePost(jsonReq("/api/candidate", onboardingBody(`f7-ip-${i}-${Date.now()}-${i}@phased.local`), { "x-forwarded-for": IP }));
      expect([200, 201]).toContain(res.status);
    }
    const fourth = await candidatePost(jsonReq("/api/candidate", onboardingBody(`f7-ip-over-${Date.now()}@phased.local`), { "x-forwarded-for": IP }));
    expect(fourth.status).toBe(429);
    const d = await fourth.json();
    expect(d.retryAfterSeconds).toBeGreaterThan(0);
    expect(String(d.error)).toContain("Too many onboardings");
  });

  it("stamps CONSENT_CAPTURED with the terms version/hash and a signature digest — never the raw signature", async () => {
    const email = `f7-consent-${Date.now()}@phased.local`;
    const res = await candidatePost(jsonReq("/api/candidate", onboardingBody(email))); // no IP header → "sandbox" → never throttled
    expect([200, 201]).toContain(res.status);
    const candId = (await res.json()).candidate.id;
    const ev = await db.auditEvent.findFirst({ where: { action: "CONSENT_CAPTURED", entityId: candId } });
    expect(ev).toBeTruthy();
    const detail = JSON.parse(ev!.detail || "{}") as { termsVersion?: string; termsHash?: string; consentDigest?: string };
    expect(detail.termsVersion).toBe(TERMS_VERSION);
    expect(detail.termsHash).toBe(termsContentHash());
    expect(detail.consentDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(detail)).not.toContain("F7-consent-sig"); // raw signature stays on the Candidate row
  });
});

describe("SEC-23 — referee account creation sends the verification email", () => {
  it("completing a reference with an accountPassword creates the account AND issues an EmailVerification row", async () => {
    CK_COOKIE = null;
    const candEmail = `f7-refcand-${Date.now()}@phased.local`;
    const refEmail = `f7-referee-${Date.now()}@phased.local`;
    const created = await candidatePost(jsonReq("/api/candidate", {
      fullName: "F7 RefCand", email: candEmail, phone: "", role: "RN", specialty: "ICU",
      yearsExperience: 1, city: "X", state: "Y", consentSignature: "sig", skills: [],
      references: [{ refName: "F7 Referee", refTitle: "RN", refEmail, refPhone: "", facilityName: "F", relationship: "Peer", workStartDate: "", workEndDate: "" }],
    }));
    expect(created.status).toBe(201);
    const cd = await created.json();
    const request0 = cd.candidate.requests[0];
    const raw = String(request0.refLink).split("?r=")[1];
    expect(raw).toBeTruthy();

    // identity verification first (callback code comes from the creation response)
    const verify = await referenceTokenPost(jsonReq(`/api/reference/${raw}`, {
      action: "verify_identity", method: "CALLBACK_CODE", callbackCode: request0.callbackCode,
    }), refParams(raw));
    expect(verify.status).toBe(200);

    const submitted = await referenceTokenPost(jsonReq(`/api/reference/${raw}`, {
      action: "submit",
      // every question the form requires, answered by type (q8=NO keeps it simple)
      answers: REF_QUESTIONS.map((q) => ({
        key: q.key,
        type: q.type,
        value: q.type === "rating" ? 4 : q.type === "boolean" ? "NO" : q.key === "q1_relationship" ? "Supervisor" : "Yes",
        na: false,
      })),
      signatureName: "F7 Referee",
      accountPassword: "password123",
    }), refParams(raw));
    expect([200, 201]).toContain(submitted.status);
    const sd = await submitted.json();
    expect(sd.accountCreated).toBe(true);
    expect(sd.verificationEmailSent).toBe(true);
    const ver = await db.emailVerification.findFirst({ where: { email: refEmail, role: "CANDIDATE", consumedAt: null } });
    expect(ver).toBeTruthy(); // the standard verification email went out
  });
});
