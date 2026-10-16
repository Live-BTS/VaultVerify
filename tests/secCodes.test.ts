import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
