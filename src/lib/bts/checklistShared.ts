// ── Shared labels for skills checklist (server + client safe, no db) ──

export const SPECIALTY_LABELS: Record<string, string> = {
  MEDSURG: "Med-Surg",
  ICU: "ICU / Critical Care",
  ER: "Emergency Room",
  TELE: "Telemetry",
  "L&D": "Labor & Delivery",
  OR: "Operating Room",
  PACU: "PACU",
  PEDS: "Pediatrics",
  BEH: "Behavioral Health",
  LTC: "Long-Term Care",
  GENERAL: "General",
};

export function specialtyLabel(key: string): string {
  return SPECIALTY_LABELS[key] ?? key.replace(/_/g, " ");
}

// MyZipVault 1-4 self-assessment scale (template wording)
export const RATING_4 = [
  { value: 1, label: "No theory and/or experience" },
  { value: 2, label: "Limited experience" },
  { value: 3, label: "Experienced / minimal support needed" },
  { value: 4, label: "Proficient" },
] as const;

// ── Report visual language (matches the VaultVerify skills-checklist PDF) ──
// Rating rings: 1 red · 2 amber · 3 blue · 4 green
export const RATING_META: Record<number, { short: string; ring: string; text: string; chip: string; dot: string }> = {
  1: { short: "No theory", ring: "border-[#e05252]", text: "text-[#d64545]", chip: "bg-[#fdecec] text-[#d64545]", dot: "#e05252" },
  2: { short: "Limited", ring: "border-[#e8a33d]", text: "text-[#c57f1a]", chip: "bg-[#fdf3e0] text-[#c57f1a]", dot: "#e8a33d" },
  3: { short: "Experienced", ring: "border-[#4285d6]", text: "text-[#2f6cbd]", chip: "bg-[#e8f0fb] text-[#2f6cbd]", dot: "#4285d6" },
  4: { short: "Proficient", ring: "border-[#33a569]", text: "text-[#1f7a4a]", chip: "bg-[#e2f4e8] text-[#1f7a4a]", dot: "#33a569" },
};

// Per-skill "Last performed" dimension — required for every rating answer
export const LAST_PERFORMED = [
  { key: "3", label: "Within 3 months" },
  { key: "6", label: "Within 6 months" },
  { key: "6+", label: "6+ months ago" },
  { key: "na", label: "N/A" },
] as const;

export type LastPerformedKey = (typeof LAST_PERFORMED)[number]["key"];

export const RECENCY_META: Record<string, { pill: string; dot: string }> = {
  "3": { pill: "bg-[#123c54] text-white", dot: "#123c54" },
  "6": { pill: "bg-[#5f87ae] text-white", dot: "#5f87ae" },
  "6+": { pill: "bg-[#c5d3dd] text-[#33475b]", dot: "#c5d3dd" },
  na: { pill: "bg-white text-[#8aa29c] border border-dashed border-[#b8c8c2]", dot: "#dbe4e0" },
};

export function recencyLabel(key?: string | null): string {
  return LAST_PERFORMED.find((r) => r.key === key)?.label ?? "—";
}

// "Recent" = last performed within 3 months (matches the report footnote)
export function isRecentKey(key?: string | null): boolean {
  return key === "3";
}

export function ratingShort(value: number | null | undefined): string {
  if (value == null) return "—";
  return RATING_META[Number(value)]?.short ?? String(value);
}

// ── Default "Additional questions" (PDF section) — seeded once, editable by superadmin ──
export const DEFAULT_EXTRA_QUESTIONS = [
  { kind: "YES_NO", prompt: "Are you willing to float to other units when needed?", placeholder: "", sortOrder: 10 },
  { kind: "YES_NO", prompt: "Are you comfortable working night shifts?", placeholder: "", sortOrder: 20 },
  { kind: "YES_NO", prompt: "Have you worked with an electronic health record (EHR) system?", placeholder: "", sortOrder: 30 },
  { kind: "YES_NO", prompt: "Are you open to travel assignments outside your home state?", placeholder: "", sortOrder: 40 },
  { kind: "TEXT", prompt: "Which EHR systems have you used?", placeholder: "e.g. Epic, Cerner, Meditech — and what you used them for", sortOrder: 50 },
  { kind: "TEXT", prompt: "Add any extra certifications, training or notes the recruiter should know about.", placeholder: "Certifications, workshops, preceptorship, anything worth highlighting", sortOrder: 60 },
] as const;

// Attestation statements (candidate signs before the checklist is shared)
export const ATTESTATION_STATEMENTS = [
  "I confirm that the ratings above are my own and reflect my real experience. I understand that inaccurate information may affect my eligibility for placement.",
  "I agree that VaultVerify may share this self-assessment with the recruiters and employers I authorize, and that it may be verified against my references.",
] as const;

export const SIGNATURE_MODES = [
  { key: "draw", label: "Draw" },
  { key: "type", label: "Type" },
  { key: "upload", label: "Upload" },
] as const;

export type SignatureMode = (typeof SIGNATURE_MODES)[number]["key"];

// ── Answer summarization (client + server safe) — powers "Summary at a glance" ──
export interface SkillAnswer {
  category: string; skill: string; questionType: string;
  value: number | string | null; na: boolean; highRisk?: boolean; lastPerformed?: string | null;
}

export interface CategorySummary { name: string; total: number; avg: number | null; proficient: number; recent: number }
export interface AnswerSummary {
  total: number; rated: number; avg: number | null;
  mix: { 1: number; 2: number; 3: number; 4: number };
  recency: { "3": number; "6": number; "6+": number; na: number; missing: number };
  recentPct: number | null; hasRecency: boolean;
  categories: CategorySummary[];
}

export function summarizeAnswers(answers: SkillAnswer[]): AnswerSummary {
  const mix = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const recency = { "3": 0, "6": 0, "6+": 0, na: 0, missing: 0 };
  let sum = 0, rated = 0, hasRecency = false;
  const catMap = new Map<string, { total: number; sum: number; rated: number; proficient: number; recent: number }>();
  for (const a of answers) {
    const cat = catMap.get(a.category) ?? { total: 0, sum: 0, rated: 0, proficient: 0, recent: 0 };
    cat.total += 1;
    const isRating = a.questionType === "rating_1_4";
    const v = Number(a.value);
    if (isRating && !a.na && v >= 1 && v <= 4) {
      mix[v as 1 | 2 | 3 | 4] += 1;
      sum += v; rated += 1;
      cat.sum += v; cat.rated += 1;
      if (v === 4) cat.proficient += 1;
    }
    if (a.na || isRating) {
      const lp = a.lastPerformed ?? null;
      if (lp && lp in recency) { recency[lp as "3" | "6" | "6+" | "na"] += 1; hasRecency = true; if (lp === "3") cat.recent += 1; }
      else recency.missing += 1;
    }
    catMap.set(a.category, cat);
  }
  const total = answers.length;
  const recent = recency["3"];
  return {
    total, rated,
    avg: rated ? Math.round((sum / rated) * 10) / 10 : null,
    mix, recency,
    recentPct: total ? Math.round((recent / total) * 100) : null,
    hasRecency,
    categories: [...catMap.entries()].map(([name, c]) => ({
      name, total: c.total,
      avg: c.rated ? Math.round((c.sum / c.rated) * 10) / 10 : null,
      proficient: c.proficient, recent: c.recent,
    })),
  };
}

export const LABELS = SPECIALTY_LABELS;
