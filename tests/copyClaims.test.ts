import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// ── K9 claim-family gate (regression for the copy-truth sweep) ──
// Marketing claim families that overstate verification must not reappear in
// shipped source. Files listed here are documented exceptions (dead code or
// PO-pending legal copy) — anything else that matches FAILS the suite.
const CLAIM_FAMILIES: [string, RegExp][] = [
  ["48-hour turnaround", /48 ?hours|<48h\b|48h\b/i],
  ["55+ template claim", /55\+/],
  ["one-year validity", /stay verified for a year|reusable for a year|valid for a year/i],
  ["manager-verified vocabulary", /Manager-verified/],
  ["verified-against phrasing", /verified against/i],
  ["verified-results phrasing", /verified results/i],
  ["retired taglines", /References, verified\.|Skills, proven\./i],
  // SEC-08 (OD-07 option a): reports must never imply platform verification.
  // The checklist badge overclaimed ("Verified & delivered") — the honest
  // wording is "Completed & delivered".
  ["verified-delivered badge", /verified & delivered/i],
  // The reference PDF title overclaimed ("Verified Reference Packet") — the
  // honest title is "Reference Report — referee-attested".
  ["verified-packet title", /verified reference packet/i],
  // CH-10: Collected References was retired — the route/components referenced a
  // Prisma model that never existed in any committed schema (dead code). The
  // vocabulary must not reappear, and the route directory must stay gone.
  ["collected-references vocabulary", /collectedReference|CollectedRef|checklist\/reference|\?cr=/],
];

const ALLOWLIST: Record<string, string[]> = {
  // Dead code kept pending the A1 cleanup and the Q4 decision:
  "src/app/components/HeroSection.tsx": ["48-hour turnaround"],
  // Legal copy describes the referee-confirmation mechanic with legacy wording —
  // changing it requires explicit PO approval (audit finding L9):
  "src/content/terms.ts": ["manager-verified vocabulary"],
};

const ROOT = path.resolve(__dirname, "..");

function searchSource(): { file: string; line: number; text: string; family: string }[] {
  const hits: { file: string; line: number; text: string; family: string }[] = [];
  let out = "";
  try {
    out = execSync(`rg -n --no-heading -i "${CLAIM_FAMILIES.map(([, r]) => r.source).join("|")}" src`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    return hits; // rg exits 1 when nothing matches
  }
  for (const line of out.split("\n").filter(Boolean)) {
    const [file, ln, ...rest] = line.split(":");
    const text = rest.join(":");
    for (const [family, re] of CLAIM_FAMILIES) {
      if (re.test(text)) {
        hits.push({ file: file.replace(/^\.\//, ""), line: Number(ln), text: text.trim(), family });
        break;
      }
    }
  }
  return hits;
}

describe("K9 copy claim gate", () => {
  it("no shipped source contains retired verification claims", () => {
    const hits = searchSource().filter(
      (h) => !(ALLOWLIST[h.file] ?? []).includes(h.family),
    );
    expect(
      hits.map((h) => `${h.file}:${h.line} [${h.family}] ${h.text}`),
      "Copy overclaims regressed — remove them or extend the documented allowlist",
    ).toEqual([]);
  });

  it("CH-10: the retired Collected References feature stays retired", () => {
    expect(existsSync(path.join(ROOT, "src/app/api/checklist/reference"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/components/bts/checklist/CollectedRefForm.tsx"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/components/bts/checklist/CollectedRefsPanel.tsx"))).toBe(false);
  });
});
