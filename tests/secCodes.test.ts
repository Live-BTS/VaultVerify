import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as superadminPost } from "@/app/api/superadmin/route";

// ── SEC-03 / CH-01: burned access codes are removed from the source tree ──
// K9-style grep gate: no published code literal may reappear in src/ or scripts/.
// (Audit docs at the repo root intentionally describe the findings and are
// excluded; the demo seed definition in src/lib/bts/checklistDemo.ts is a
// documented residual that is gated out of production by CH-02.)

const ROOT = path.resolve(__dirname, "..");

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) listFiles(p, out);
    else out.push(p);
  }
  return out;
}

// Literals are assembled at runtime so this test file itself never contains one.
const burnedAccessCodes = ["zipvault" + "2026", "meds" + "2026"];
const burnedDemoPassword = "demo" + "1234";

describe("CH-01: burned access-code literals absent from source tree", () => {
  it("no superadmin/recruiter code literal in src/ or scripts/", () => {
    const files = [...listFiles(path.join(ROOT, "src")), ...listFiles(path.join(ROOT, "scripts"))];
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const code of burnedAccessCodes) {
        if (text.includes(code)) offenders.push(`${path.relative(ROOT, f)} contains a burned access-code literal`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no demo-account password literal in client components or scripts", () => {
    const files = [...listFiles(path.join(ROOT, "src", "components")), ...listFiles(path.join(ROOT, "scripts"))];
    const offenders = files
      .filter((f) => readFileSync(f, "utf8").includes(burnedDemoPassword))
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});

// ── OD-01, AMENDED by the owner (2026-10-18) ──
// 1. The superadmin console backup code lives ONLY in the SUPERADMIN_CODE env
//    var (Vercel). No hardcoded literal anywhere; fail-closed when unset.
//    Emailed OTP remains the primary entry.
// 2. The recruiter code is retired ENTIRELY — no code path reads
//    process.env.RECRUITER_CODE, and the owner deletes the env var.
describe("OD-01 amended — backup code is env-only; recruiter code fully retired", () => {
  it("source gate: no code path reads process.env.RECRUITER_CODE in src/", () => {
    const files = listFiles(path.join(ROOT, "src"));
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes("process.env.RECRUITER_CODE"));
    expect(offenders).toEqual([]);
  });

  it("source gate: the superadmin route reads SUPERADMIN_CODE from env, never a literal", () => {
    const src = readFileSync(path.join(ROOT, "src", "app", "api", "superadmin", "route.ts"), "utf8");
    expect(src).toContain("process.env.SUPERADMIN_CODE");
    for (const code of burnedAccessCodes) expect(src).not.toContain(code);
  });

  it("behavior gate: the correct env backup code unlocks the OWNER console", async () => {
    const gateCode = "env-backup-" + "gate-9137";
    process.env.SUPERADMIN_CODE = gateCode;
    try {
      const req = new NextRequest("http://localhost:3000/api/superadmin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "auth", code: gateCode }),
      });
      const res = await superadminPost(req);
      expect(res.status).toBe(200);
      const d = await res.json();
      expect(d.ok).toBe(true);
      expect(d.identity.role).toBe("OWNER");
    } finally {
      delete process.env.SUPERADMIN_CODE;
    }
  });

  it("behavior gate: a wrong code is rejected even when the env is set", async () => {
    process.env.SUPERADMIN_CODE = "env-backup-" + "gate-9137";
    try {
      const req = new NextRequest("http://localhost:3000/api/superadmin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "auth", code: "not-the-code" }),
      });
      const res = await superadminPost(req);
      expect(res.status).toBe(401);
      const d = await res.json();
      expect(d.ok).toBe(false);
    } finally {
      delete process.env.SUPERADMIN_CODE;
    }
  });

  it("behavior gate: unset env — honest fail-closed message (no silent fallback)", async () => {
    delete process.env.SUPERADMIN_CODE;
    const req = new NextRequest("http://localhost:3000/api/superadmin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "auth", code: "anything-at-all" }),
    });
    const res = await superadminPost(req);
    expect(res.status).toBe(401);
    const d = await res.json();
    expect(d.ok).toBe(false);
    expect(d.error).toContain("No backup code is configured");
  });
});
