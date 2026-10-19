// Analyze profession → jobTitle → specialty structure of the owner's workbook
// so the recruiter cascade (Profession → Discipline → Specialty) can be aligned
// with what the import will actually store.
import * as XLSX from "xlsx";
import { readFileSync } from "fs";

const path = "upload/MyZipVault_Skills_Import_Template (7).xlsx";
const wb = XLSX.read(readFileSync(path), { type: "buffer" });
console.log("sheets:", wb.SheetNames.join(" | "));

const sheetName = wb.SheetNames.find((n) => /skill/i.test(n)) ?? wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
const aoa: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });

const profCount = new Map<string, number>();
const jobByProf = new Map<string, Map<string, number>>();
const specByJob = new Map<string, Map<string, number>>();
const qtypes = new Map<string, number>();
const hasNA = new Map<string, number>();
let rows = 0;

for (const cells of aoa) {
  const get = (i: number) => String(cells[i] ?? "").trim();
  const [prof, job, spec, , skill, qt, na] = [get(0), get(1), get(2), get(3), get(4), get(5), get(6)];
  if (!prof && !job && !spec && !skill) continue;
  rows++;
  profCount.set(prof, (profCount.get(prof) ?? 0) + 1);
  if (!jobByProf.has(prof)) jobByProf.set(prof, new Map());
  const jm = jobByProf.get(prof)!;
  jm.set(job, (jm.get(job) ?? 0) + 1);
  const jk = `${prof}|${job}`;
  if (!specByJob.has(jk)) specByJob.set(jk, new Map());
  const sm = specByJob.get(jk)!;
  sm.set(spec, (sm.get(spec) ?? 0) + 1);
  qtypes.set(qt, (qtypes.get(qt) ?? 0) + 1);
  hasNA.set(na, (hasNA.get(na) ?? 0) + 1);
}

console.log("data rows:", rows);
console.log("professions:", [...profCount.entries()].map(([k, v]) => `${k || "(blank)"}=${v}`).join(", "));
console.log("question types:", [...qtypes.entries()].map(([k, v]) => `${k || "(blank)"}=${v}`).join(", "));
console.log("hasNA:", [...hasNA.entries()].map(([k, v]) => `${k || "(blank)"}=${v}`).join(", "));

for (const [prof, jm] of jobByProf) {
  const entries = [...jm.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n[${prof}] job titles (${entries.length}):`);
  console.log(entries.map(([k, v]) => `${k || "(blank)"}=${v}`).join(", "));
}

// specialties under the top job titles per profession (to size the dropdowns)
for (const [prof, jm] of jobByProf) {
  for (const [job] of [...jm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    const sm = specByJob.get(`${prof}|${job}`);
    if (!sm) continue;
    console.log(`\n[${prof} / ${job}] specialties (${sm.size}):`);
    console.log([...sm.keys()].slice(0, 40).join(" | "));
  }
}
