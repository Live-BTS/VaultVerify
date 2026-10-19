// Analyze the owner's uploaded skills workbook: headers, distinct values, counts.
import * as XLSX from "xlsx";

const path = "/home/z/my-project/upload/MyZipVault_Skills_Import_Template (7).xlsx";
const buf = require("fs").readFileSync(path);
const wb = XLSX.read(buf, { type: "buffer" });

console.log("SHEETS:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  console.log(`\n=== Sheet "${name}": ${rows.length} rows ===`);
  const first = rows[0] ?? [];
  console.log("ROW1:", JSON.stringify(first));
  console.log("ROW2:", JSON.stringify(rows[1] ?? []));
  // Detect if row1 looks like a header (non-data words) or data
  const looksHeader = first.some((c) => /^(profession|job|title|specialty|category|skill|question|type|has|n.?a|option)$/i.test(String(c).trim()));
  console.log("ROW1 looks like header:", looksHeader);
  // Column count distribution
  const colCounts = new Map<number, number>();
  rows.forEach((r) => colCounts.set(r.length, (colCounts.get(r.length) ?? 0) + 1));
  console.log("COL COUNT DISTRIBUTION:", Object.fromEntries(colCounts));
  // Distinct values per column (assume 7 cols: Profession, JobTitle, Specialty, Category, SkillName, QuestionType, HasNA)
  const cols = ["C1_Profession", "C2_JobTitle", "C3_Specialty", "C4_Category", "C5_SkillName", "C6_QuestionType", "C7_HasNA"];
  for (let c = 0; c < Math.min(7, Math.max(...rows.map((r) => r.length))); c++) {
    const vals = new Map<string, number>();
    rows.forEach((r) => {
      const v = String(r[c] ?? "").trim();
      vals.set(v, (vals.get(v) ?? 0) + 1);
    });
    const distinct = [...vals.entries()].sort((a, b) => b[1] - a[1]);
    const label = cols[c] ?? `C${c + 1}`;
    if (distinct.length <= 15) {
      console.log(`${label} (${distinct.length} distinct):`, distinct.map(([v, n]) => `"${v}"x${n}`).join(", "));
    } else {
      console.log(`${label}: ${distinct.length} distinct values, top5:`, distinct.slice(0, 5).map(([v, n]) => `"${v.slice(0, 60)}"x${n}`).join(", "));
    }
  }
}
