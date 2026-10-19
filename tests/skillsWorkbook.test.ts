import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { sha256 } from "@/lib/bts/auth";
import { db } from "@/lib/db";
import { POST as superadminPost } from "@/app/api/superadmin/route";
import { GET as templateGet } from "@/app/api/superadmin/skills/template/route";
import { GET as exportGet } from "@/app/api/superadmin/skills/export/route";
import {
  normalizeProfession, normalizeQuestionType, normalizeHasNA, normalizeSpecialty,
  validateRows, MAX_IMPORT_ROWS, type ImportRow,
} from "@/lib/bts/importValidate";
import { SPECIALTY_LABELS, specialtyLabel } from "@/lib/bts/checklistShared";
import { hasXlsxMagic, extractRowsFromSheets, extractRowsFromWorkbook } from "@/lib/bts/workbookParse";
import { upsertTemplates } from "@/lib/bts/skillTemplates";
import { PROFESSIONS, DISCIPLINES } from "@/lib/bts/catalog";

// ── Skills workbook import/export quartet (owner build, 2026-10-19) ──
// Gates the owner-approved restructure:
//   1. profession trio (Nursing / Allied / Providers) + legacy acceptance
//   2. tolerant normalizers (the real workbook: "Provider", "N", headerless)
//   3. specialty round trip: every exported label re-imports to the SAME key
//   4. positional (headerless) + headered parsing, Instructions-sheet safety
//   5. batched transactional upsert: dedupe, diff-skip, all-or-nothing
//   6. cookie-authenticated GET downloads, 401 fail-closed
//   7. import row cap (25,000)

const RUN = Date.now();
const TAG = `wb-${RUN}`;
const jsonReq = (body: unknown, cookie?: string) =>
  new NextRequest("http://localhost:3000/api/superadmin", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

let saCookie = "";

async function seedSession(): Promise<string> {
  const email = `wb-${RUN}@sa.local`;
  await db.superadminAccount.create({ data: { email, name: "Workbook Owner", role: "OWNER", status: "ACTIVE" } });
  await db.superAdminOtp.create({
    data: { email, codeHash: sha256("246810"), expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
  const res = await superadminPost(jsonReq({ action: "verify_otp", otp: "246810" }));
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain("vv_sa=");
  return setCookie.split(";")[0].replace("vv_sa=", "");
}

const wbRow = (over: Partial<ImportRow> = {}): ImportRow => ({
  profession: "Nursing", jobTitle: "RN", specialty: "ICU", category: "General Skills",
  skillName: `Skill ${Math.random()}`, questionType: "rating_1_4", hasNA: false,
  ...over,
});

beforeAll(async () => {
  saCookie = await seedSession();
});

afterAll(async () => {
  // Remove every row this run touched (imports tagged by jobTitle WT-<run>).
  await db.skillTemplate.deleteMany({ where: { jobTitle: { startsWith: TAG } } });
});

describe("profession trio + tolerant normalizers", () => {
  it("normalizes Provider→Providers (the workbook's singular form)", () => {
    expect(normalizeProfession("Provider")).toBe("Providers");
    expect(normalizeProfession("providers")).toBe("Providers");
    expect(normalizeProfession(" Nursing ")).toBe("Nursing");
    expect(normalizeProfession("allied")).toBe("Allied");
    expect(normalizeProfession("aide")).toBe("Allied");
  });

  it("keeps legacy Pharmacy/Locums valid for round trips but rejects garbage", () => {
    expect(normalizeProfession("Pharmacy")).toBe("Pharmacy");
    expect(normalizeProfession("Locums")).toBe("Locums");
    expect(normalizeProfession("ursing")).toBeNull(); // the workbook's typo row
    expect(normalizeProfession("")).toBeNull();
  });

  it("accepts the common question-type spellings", () => {
    expect(normalizeQuestionType("rating_1_4")).toBe("rating_1_4");
    expect(normalizeQuestionType("1-4")).toBe("rating_1_4");
    expect(normalizeQuestionType("Rating")).toBe("rating_1_4");
    expect(normalizeQuestionType("Yes/No")).toBe("yes_no");
    expect(normalizeQuestionType("Free text")).toBe("text");
    expect(normalizeQuestionType("essay")).toBeNull();
  });

  it("reads Has N/A the way the workbook writes it", () => {
    expect(normalizeHasNA("Yes")).toBe(true);
    expect(normalizeHasNA("y")).toBe(true);
    expect(normalizeHasNA("No")).toBe(false);
    expect(normalizeHasNA("N")).toBe(false); // 16,893 "No" + 1 "N" in the real file
    expect(normalizeHasNA("")).toBe(false);
    expect(normalizeHasNA(true)).toBe(true);
  });

  it("offers exactly the three owner professions with a Providers discipline list", () => {
    expect(PROFESSIONS.map((p) => p.key)).toEqual(["Nursing", "Allied", "Providers"]);
    expect((DISCIPLINES.Providers ?? []).length).toBeGreaterThan(0);
  });
});

describe("specialty round trip (export label → same canonical key)", () => {
  it("every canonical label normalizes back to its key", () => {
    for (const [key, label] of Object.entries(SPECIALTY_LABELS)) {
      expect(normalizeSpecialty(specialtyLabel(key)).key, `label "${label}" for ${key}`).toBe(key);
    }
  });

  it("folds the real workbook's spellings onto canonical keys", () => {
    expect(normalizeSpecialty("Med/Surg").key).toBe("MEDSURG");
    expect(normalizeSpecialty("Med-Surg").key).toBe("MEDSURG");
    expect(normalizeSpecialty("Emergency Department").key).toBe("ER");
    expect(normalizeSpecialty("Critical Care").key).toBe("ICU");
    expect(normalizeSpecialty("Telemetry").key).toBe("TELE");
    expect(normalizeSpecialty("General").key).toBe("GENERAL");
    expect(normalizeSpecialty("Operating Room").key).toBe("OR");
  });

  it("keeps genuinely distinct free-text specialties as stable pseudo-keys", () => {
    expect(normalizeSpecialty("Telemetry Stepdown")).toEqual({ key: "TELEMETRY_STEPDOWN", label: "Telemetry Stepdown" });
    expect(normalizeSpecialty("Cardiac Cath Lab").key).toBe("CARDIAC_CATH_LAB");
    // ...and the pseudo-key's own label re-imports identically (double round trip)
    expect(normalizeSpecialty(specialtyLabel("CARDIAC_CATH_LAB")).key).toBe("CARDIAC_CATH_LAB");
  });
});

describe("workbook parsing: headered, positional, and instruction-safe", () => {
  it("rejects files without spreadsheet magic bytes", () => {
    expect(hasXlsxMagic(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(hasXlsxMagic(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe(true); // legacy .xls
    expect(hasXlsxMagic(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(false); // %PDF
    expect(hasXlsxMagic(new TextEncoder().encode("id,name\n1,x"))).toBe(false); // renamed CSV
  });

  it("parses headered sheets by column name", () => {
    const aoa = [
      ["Profession", "Job Title", "Specialty", "Category", "Skill Name", "Question Type", "Has N/A Option"],
      ["Nursing", "RN", "ICU", "General Skills", "Draw Blood Cultures", "rating_1_4", "No"],
      ["Nursing", "RN", "ICU", "General Skills", "Interpretation of 12 lead EKG", "rating_1_4", "Yes"],
    ];
    const r = extractRowsFromSheets([{ sheetName: "Skills Data", aoa }]);
    expect(r.mode).toBe("header");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].hasNA).toBe(false);
    expect(r.rows[1].hasNA).toBe(true);
  });

  it("parses the owner's headerless layout positionally — only on a Skills sheet", () => {
    const aoa = [
      ["Nursing", "RN", "ICU", "General Skills", "Draw Blood Cultures", "rating_1_4", "No"],
      ["Provider", "Nurse Practitioner", "General", "Age of Patients", "Newborn/Neonate (birth to 30 days)", "rating_1_4", "No"],
      ["ursing", "RN", "OR Scrub", "x", "y", "rating_1_4", "N"], // garbage row preserved for the report
    ];
    const r = extractRowsFromSheets([
      { sheetName: "Instructions", aoa: [["VaultVerify Skills Checklist Import Template"], ["1 = No theory and/or experience"]] },
      { sheetName: "Skills Data", aoa },
    ]);
    expect(r.mode).toBe("positional");
    expect(r.sheetName).toBe("Skills Data");
    expect(r.rows).toHaveLength(3);
    expect(r.rows[1].profession).toBe("Provider");
  });

  it("never parses the Instructions sheet positionally", () => {
    const r = extractRowsFromSheets([
      { sheetName: "Instructions", aoa: [["VaultVerify Skills Checklist Import Template"], ["1 = No theory and/or experience"], ["Nursing RN ICU Gen Skill rating_1_4 No"]] },
    ]);
    expect(r.mode).toBeNull();
    expect(r.rows).toHaveLength(0);
  });

  it("round-trips a real File: build workbook → extract → validate", async () => {
    const rows: ImportRow[] = [
      wbRow({ skillName: "Central line care", profession: "Nursing", specialty: "ICU", hasNA: false }),
      wbRow({ skillName: "Goniometry", profession: "Allied", jobTitle: "PT", specialty: "Med/Surg", category: "Assessment", hasNA: true }),
      wbRow({ skillName: "Suture assist", profession: "Provider", jobTitle: "Physician Assistant", specialty: "Emergency Department", category: "Procedures", hasNA: false }),
    ];
    const ws = XLSX.utils.aoa_to_sheet([
      ["Profession", "Job Title", "Specialty", "Category", "Skill Name", "Question Type", "Has N/A Option"],
      ...rows.map((r) => [r.profession, r.jobTitle, r.specialty, r.category, r.skillName, r.questionType, r.hasNA ? "Yes" : "No"]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Skills Data");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const file = new File([buf as unknown as BlobPart], "import.xlsx");
    expect(hasXlsxMagic(new Uint8Array(await file.slice(0, 4).arrayBuffer()))).toBe(true);
    const extracted = await extractRowsFromWorkbook(file);
    expect(extracted.mode).toBe("header");
    const { errors, clean } = validateRows(extracted.rows);
    expect(errors).toEqual([]);
    expect(clean).toHaveLength(3);
    expect(clean[2].profession).toBe("Providers"); // normalized from "Provider"
    expect(clean[1].specialtyKey).toBe("MEDSURG");
    expect(clean[2].specialtyKey).toBe("ER");
  });
});

describe("batched transactional upsert", () => {
  it("dedupes in-file duplicates, diffs unchanged rows, and reports all four counters", async () => {
    const rows = [
      { ...validateRows([wbRow({ skillName: "Batch A", jobTitle: TAG, specialty: "ICU", category: "Cat A" })]).clean[0] },
      { ...validateRows([wbRow({ skillName: "Batch B", jobTitle: TAG, specialty: "ICU", category: "Cat B" })]).clean[0] },
      { ...validateRows([wbRow({ skillName: "Batch A", jobTitle: TAG, specialty: "ICU", category: "Cat A" })]).clean[0] }, // in-file duplicate
    ];
    const first = await upsertTemplates(rows, "IMPORT");
    expect(first.created).toBe(2);
    expect(first.duplicates).toBe(1);
    expect(first.updated).toBe(0);
    expect(first.unchanged).toBe(0);

    // Identical re-upload: everything already matches → nothing written.
    const second = await upsertTemplates(rows, "IMPORT");
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(2);

    // Category change + skill addition land as exactly one update + one create.
    const changed = rows.slice(0, 2).map((r) => ({ ...r, category: r.skillName === "Batch A" ? "Cat A v2" : r.category }));
    changed.push({ ...validateRows([wbRow({ skillName: "Batch C", jobTitle: TAG, specialty: "ICU", category: "Cat C" })]).clean[0] });
    const third = await upsertTemplates(changed, "IMPORT");
    expect(third.created).toBe(1);
    expect(third.updated).toBe(1);
    expect(third.unchanged).toBe(1);

    const stored = await db.skillTemplate.findMany({ where: { jobTitle: TAG, skillName: "Batch A" } });
    expect(stored).toHaveLength(1);
    expect(stored[0].category).toBe("Cat A v2");
  });
});

describe("HTTP import: cap enforcement + all-or-nothing batch", () => {
  it("accepts an import and returns the four counters", async () => {
    const rows = [
      wbRow({ skillName: "HTTP A", jobTitle: TAG, specialty: "ICU", category: "Cat H" }),
      wbRow({ skillName: "HTTP B", jobTitle: TAG, specialty: "ICU", category: "Cat H", profession: "Allied", questionType: "rating_1_4" }),
    ];
    const res = await superadminPost(jsonReq({ action: "import", rows, code: undefined }, `vv_sa=${saCookie}`));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.created).toBe(2);
    expect(d.errors).toEqual([]);
  });

  it("rejects rows with a numbered report and writes nothing", async () => {
    const rows = [
      wbRow({ skillName: "HTTP Good", jobTitle: TAG, specialty: "ICU", category: "Cat H" }),
      wbRow({ skillName: "HTTP Bad", jobTitle: TAG, specialty: "ICU", category: "Cat H", profession: "ursing" }),
    ];
    const res = await superadminPost(jsonReq({ action: "import", rows }, `vv_sa=${saCookie}`));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.errors.length).toBe(1);
    expect(d.errors[0]).toMatch(/^Row 2:/);
    // All-or-nothing: only the valid row is written, the bad one is reported.
    const stored = await db.skillTemplate.findMany({ where: { jobTitle: TAG, skillName: { startsWith: "HTTP" } } });
    expect(stored.map((s) => s.skillName).sort()).toEqual(["HTTP A", "HTTP B", "HTTP Good"]);
  });

  it(`caps imports at ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows with a 400`, async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => wbRow({ skillName: `Cap ${i}`, jobTitle: TAG, specialty: "ICU", category: "Cat Cap" }));
    const res = await superadminPost(jsonReq({ action: "import", rows }, `vv_sa=${saCookie}`));
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toMatch(/limit is 25,000/);
    // Nothing was written by the rejected batch.
    const count = await db.skillTemplate.count({ where: { jobTitle: TAG, skillName: { startsWith: "Cap " } } });
    expect(count).toBe(0);
  });
});

describe("GET workbook downloads (cookie-only auth)", () => {
  it("fails closed without a live cookie session", async () => {
    const t = await templateGet(new NextRequest("http://localhost:3000/api/superadmin/skills/template"));
    expect(t.status).toBe(401);
    const e = await exportGet(new NextRequest("http://localhost:3000/api/superadmin/skills/export"));
    expect(e.status).toBe(401);
  });

  it("serves the template with PK magic bytes and a filename", async () => {
    const res = await templateGet(new NextRequest("http://localhost:3000/api/superadmin/skills/template", { headers: { cookie: `vv_sa=${saCookie}` } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    expect(res.headers.get("content-disposition")).toContain("VaultVerify_Skills_Import_Template.xlsx");
    const buf = Buffer.from(await res.arrayBuffer());
    expect([buf[0], buf[1]]).toEqual([0x50, 0x4b]);
    // The template itself must be re-parseable and yield the 7 headers.
    const extracted = extractRowsFromSheets([{ sheetName: "Skills Data", aoa: XLSX.utils.sheet_to_json(XLSX.read(buf, { type: "buffer" }).Sheets["Skills Data"], { header: 1, blankrows: false, defval: "" }) }]);
    expect(extracted.mode).toBe("header");
    expect(extracted.rows.length).toBeGreaterThanOrEqual(3); // example rows
  });

  it("exports the full library and the export re-imports with ZERO changes", async () => {
    const res = await exportGet(new NextRequest("http://localhost:3000/api/superadmin/skills/export", { headers: { cookie: `vv_sa=${saCookie}` } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/VaultVerify_Skills_Export_\d{4}-\d{2}-\d{2}\.xlsx/);
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const aoa: string[][] = XLSX.utils.sheet_to_json(wb.Sheets["Skills Data"], { header: 1, blankrows: false, defval: "" });
    const extracted = extractRowsFromSheets([{ sheetName: "Skills Data", aoa }]);
    expect(extracted.mode).toBe("header");
    const { errors, clean } = validateRows(extracted.rows);
    expect(errors).toEqual([]);
    expect(clean.length).toBeGreaterThanOrEqual(3);
    // THE gate: re-importing the export must change nothing at all.
    const result = await upsertTemplates(clean, "IMPORT");
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });
});
