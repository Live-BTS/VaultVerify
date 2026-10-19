import { db } from "@/lib/db";
import { looksHighRisk, type ValidatedRow } from "./importValidate";

// ── Zipvault-compatible skill checklist helpers (db-backed) ─────────
// Template schema mirrors the MyZipVault import workbook:
// Profession | Job Title | Specialty | Category | Skill Name | Question Type | Has N/A Option
// Pure validation lives in ./importValidate (client-safe).

export * from "./importValidate";

// ── Batched transactional upsert ──────────────────────────────────
// The per-row findUnique+create/update version made 3 sequential queries per
// row (~34k DB round trips for the owner's 16,894-row workbook — minutes on
// serverless Postgres, and a partial import if anything failed mid-way).
// Batched algorithm, O(chunked) queries and all-or-nothing:
//   1. dedupe rows in memory by the unique key (first wins, dupes counted)
//   2. chunked findMany loads every existing row for those keys
//   3. diff → creates vs real updates vs unchanged (identical rows skipped,
//      so re-uploading the same workbook touches nothing)
//   4. ONE $transaction: createMany chunks + the minimal update set — either
//      everything commits or nothing does (no partial imports, ever).
// sortOrder semantics: a row's position WITHIN its checklist set
// (profession | jobTitle | specialty) is fixed at first import — new rows
// continue after the set's current max — and is preserved on every
// re-import. That is the only semantic under which an export → import round
// trip is a no-op (the export orders rows set-by-set, so any file-index
// scheme would rewrite every row on re-import) and under which two imports
// into the same set compose instead of colliding. Rows failing validation
// never reach this function — the caller reports them with their row number
// and the valid remainder commits atomically.
export async function upsertTemplates(rows: ValidatedRow[], source: "IMPORT" = "IMPORT") {
  const seen = new Map<string, { row: ValidatedRow }>();
  let duplicates = 0;
  rows.forEach((row) => {
    const key = `${row.profession}|${row.jobTitle}|${row.specialtyKey}|${row.skillName}`.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.set(key, { row });
  });
  const entries = [...seen.values()];

  const existing = new Map<string, {
    id: string; category: string; questionType: string; hasNA: boolean;
    highRisk: boolean; active: boolean; source: string; sortOrder: number;
  }>();
  // Per-set continuation baseline: new rows append AFTER the set's current
  // max sortOrder, so skills added by a later workbook keep a stable order
  // instead of restarting at 0 and colliding with earlier imports.
  const setMax = new Map<string, number>();
  const CHUNK = 400; // ~400 OR-clauses per findMany — safe for both dialects
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    const found = await db.skillTemplate.findMany({
      where: {
        OR: slice.map(({ row }) => ({
          profession: row.profession, jobTitle: row.jobTitle, specialty: row.specialtyKey, skillName: row.skillName,
        })),
      },
    });
    for (const f of found) {
      existing.set(`${f.profession}|${f.jobTitle}|${f.specialty}|${f.skillName}`.toLowerCase(), f);
      const sk = `${f.profession}|${f.jobTitle}|${f.specialty}`.toLowerCase();
      setMax.set(sk, Math.max(setMax.get(sk) ?? -1, f.sortOrder));
    }
  }

  const creates: {
    profession: string; jobTitle: string; specialty: string; skillName: string;
    category: string; questionType: string; hasNA: boolean; highRisk: boolean;
    active: boolean; source: string; sortOrder: number;
  }[] = [];
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  let unchanged = 0;
  const createPos = new Map<string, number>();
  for (const { row } of entries) {
    // sortOrder is deliberately ABSENT from update data: a row's position is
    // fixed at first import and preserved on every re-import — the only
    // semantic under which an export → import round trip is a no-op. New
    // rows continue after the set's current max, in file order.
    const data = {
      category: row.category,
      questionType: row.questionType,
      hasNA: row.hasNA,
      highRisk: looksHighRisk(row.skillName),
      active: true,
      source,
    };
    const ex = existing.get(`${row.profession}|${row.jobTitle}|${row.specialtyKey}|${row.skillName}`.toLowerCase());
    if (!ex) {
      const sk = `${row.profession}|${row.jobTitle}|${row.specialtyKey}`.toLowerCase();
      const pos = (setMax.get(sk) ?? -1) + 1 + (createPos.get(sk) ?? 0);
      createPos.set(sk, (createPos.get(sk) ?? 0) + 1);
      creates.push({ ...data, sortOrder: pos, profession: row.profession, jobTitle: row.jobTitle, specialty: row.specialtyKey, skillName: row.skillName });
    } else if (
      ex.category !== data.category || ex.questionType !== data.questionType || ex.hasNA !== data.hasNA ||
      ex.highRisk !== data.highRisk || ex.active !== data.active || ex.source !== data.source
    ) {
      updates.push({ id: ex.id, data });
    } else {
      unchanged += 1;
    }
  }

  // createMany is supported on SQLite (Prisma ≥5.12) and Postgres alike.
  await db.$transaction([
    ...chunk(creates, 500).map((c) => db.skillTemplate.createMany({ data: c })),
    ...updates.map((u) => db.skillTemplate.update({ where: { id: u.id }, data: u.data })),
  ]);

  return { created: creates.length, updated: updates.length, unchanged, duplicates };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// OWNER DIRECTIVE (2026-10-20): the built-in starter catalog (Med-Surg / ICU /
// ER / TELE / GENERAL) and its seeder are REMOVED. The skills library starts
// empty and is populated exclusively by the owner's SuperAdmin imports
// (upsertTemplates above). Existing BUILTIN rows were wiped from every
// environment; source stays "IMPORT" for all future writes.
