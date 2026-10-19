import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ── SEC-F7 source gates (K9-style) ───────────────────────────────
// Structural guarantees that are cheaper and stricter to pin at the source
// level than through DOM/integration harnesses:
//   SEC-20 — the superadmin console keeps its bearer/backup code in memory
//            only: no web-storage reads or writes anywhere in the component.
//   SEC-21 — the emailLive config flag and the candidate account email are
//            gone from the API payloads that used to carry them.
//   SEC-22 — document requests get a nonce CSP from middleware; the builder
//            is the single source of the policy (unit-tested in secF7Hardening).

const SRC = join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(join(SRC, rel), "utf8");
}

describe("SEC-20 — superadmin console credentials are memory-only", () => {
  it("SuperAdmin.tsx never touches web storage", () => {
    const src = read("components/bts/SuperAdmin.tsx");
    expect(src).not.toContain("sessionStorage");
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("document.cookie");
  });
});

describe("SEC-21 — config and PII are stripped from payloads", () => {
  it("emailLive is no longer returned by the auth surfaces", () => {
    expect(read("app/api/auth/route.ts")).not.toContain("emailLive");
    expect(read("app/api/checklist/account/route.ts")).not.toContain("emailLive");
  });

  it("the share-resolve completion payload no longer carries the candidate email", () => {
    const src = read("app/api/checklist/share/route.ts");
    expect(src).not.toContain("email: account?.email");
  });

  it("the client auth panel no longer branches on emailLive", () => {
    expect(read("components/bts/AuthPanel.tsx")).not.toContain("emailLive");
  });
});

describe("SEC-22 — nonce CSP wiring", () => {
  it("middleware exists, generates a nonce, and runs on document paths", () => {
    const src = read("proxy.ts");
    expect(src).toContain("randomUUID");
    expect(src).toContain("buildDocumentCsp");
    expect(src).toContain("Content-Security-Policy");
    expect(src).toMatch(/matcher/);
  });

  it("rendering scheme: app routes force-dynamic locally, static trio exempt (PERF)", () => {
    // The root layout must NOT force-dynamic app-wide — that made every page
    // dynamic and un-CDN-able (the platform-wide slowness the owner reported).
    const rootLayout = readFileSync(join(process.cwd(), "src", "app", "layout.tsx"), "utf8");
    expect(rootLayout).not.toMatch(/export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
    // The two app-route layouts keep the nonce-valid per-request rendering.
    for (const p of [join(process.cwd(), "src", "app", "[section]", "layout.tsx"), join(process.cwd(), "src", "app", "SuperAdmin", "layout.tsx")]) {
      expect(readFileSync(p, "utf8")).toMatch(/export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
    }
    // The static trio declares force-static and is exempt from the nonce in
    // the proxy (prerendered HTML cannot carry a fresh nonce).
    for (const p of ["src/app/page.tsx", "src/app/privacy/page.tsx", "src/app/terms/page.tsx"]) {
      expect(readFileSync(join(process.cwd(), p), "utf8")).toMatch(/export\s+const\s+dynamic\s*=\s*"force-static"/);
    }
    expect(read("proxy.ts")).toContain('path === "/" || path === "/privacy" || path === "/terms"');
  });

  it("the static next.config header remains as the non-document fallback", () => {
    const src = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(src).toContain("Content-Security-Policy");
    expect(src).toContain("frame-ancestors 'none'");
  });
});

describe("SEC-23/25 — route-level source pins", () => {
  it("referee account creation issues a verification email", () => {
    const src = read("app/api/reference/[token]/route.ts");
    expect(src).toContain("createVerification");
    expect(src).toContain("sendVerificationEmail");
    expect(src).toContain("verificationEmailSent");
  });

  it("invite email failures are surfaced, not swallowed", () => {
    const src = read("app/api/checklist/invite/route.ts");
    expect(src).toContain("emailDelivery");
    expect(src).not.toContain(".catch(() => undefined)"); // the old silent swallow
  });
});
