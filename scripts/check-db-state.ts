// Read-only DB state check — verify Phase B schema columns + record counts.
// Never prints record VALUES (candidate PII protection) — only counts and column names.
import { Database } from "bun:sqlite";

const db = new Database("db/custom.db", { readonly: true });

const tables = db
  .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as { name: string }[];
console.log("TABLES:", tables.map((t) => t.name).join(", "));

for (const t of ["ReferenceShareLink", "ChecklistInvite", "ChecklistShareLink"]) {
  const cols = db.query(`PRAGMA table_info(${t})`).all() as { name: string }[];
  console.log(`\n${t} COLUMNS:`, cols.map((c) => c.name).join(", "));
}

const count = (t: string) =>
  (db.query(`SELECT COUNT(*) AS n FROM ${t}`).all() as { n: number }[])[0].n;

console.log("\nROW COUNTS (counts only, no values):");
for (const t of [
  "Agency",
  "Candidate",
  "ReferenceRequest",
  "ReferenceResponse",
  "ReferenceShareLink",
  "CandidateSkill",
  "ChecklistAccount",
  "ChecklistInvite",
  "ChecklistCompletion",
  "ChecklistShareLink",
  "RecruiterAccount",
  "AuditEvent",
]) {
  try {
    console.log(`  ${t}: ${count(t)}`);
  } catch {
    console.log(`  ${t}: (missing table)`);
  }
}

// Binding coverage — how many share links / invites carry the new Phase B fields (null = legacy)
const linkTotal = count("ReferenceShareLink");
const linkBound = count("ReferenceShareLink WHERE recipientRecruiterId IS NOT NULL");
const inviteTotal = count("ChecklistInvite");
const inviteBound = count("ChecklistInvite WHERE recruiterAccountId IS NOT NULL");
console.log("\nPHASE B BINDING COVERAGE:");
console.log(`  ReferenceShareLink bound: ${linkBound}/${linkTotal}`);
console.log(`  ChecklistInvite sender-bound: ${inviteBound}/${inviteTotal}`);

db.close();
