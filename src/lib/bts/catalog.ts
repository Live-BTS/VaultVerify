// ── Checklist catalog: Profession → Discipline → Specialty ──────
// Drives the recruiter's cascade dropdowns and the candidate onboarding
// form. Canonical keys match the MyZipVault import template columns
// (Profession | Job Title | Specialty). "Discipline" == the Job Title
// column (RN, LPN, PT, ...). Published combos come from the SkillTemplate
// library via /api/checklists — this file is the static universe.

export interface Option { key: string; label: string }

export const PROFESSIONS: Option[] = [
  { key: "Nursing", label: "Nursing" },
  { key: "Allied", label: "Allied" },
  { key: "Pharmacy", label: "Pharmacy" },
  { key: "Locums", label: "Locums" },
];

// Disciplines per profession (the MyZipVault "Job Title" column)
export const DISCIPLINES: Record<string, Option[]> = {
  Nursing: [
    { key: "RN", label: "Registered Nurse (RN)" },
    { key: "LPN", label: "Licensed Practical Nurse (LPN)" },
    { key: "CNA", label: "Certified Nursing Assistant (CNA)" },
    { key: "NP", label: "Nurse Practitioner (NP)" },
  ],
  Allied: [
    { key: "PT", label: "Physical Therapist (PT)" },
    { key: "PTA", label: "PT Assistant (PTA)" },
    { key: "OT", label: "Occupational Therapist (OT)" },
    { key: "COTA", label: "OT Assistant (COTA)" },
    { key: "SLP", label: "Speech-Language Pathologist (SLP)" },
    { key: "RT", label: "Respiratory Therapist (RT)" },
  ],
  Pharmacy: [
    { key: "PharmD", label: "Pharmacist (PharmD)" },
    { key: "PharmTech", label: "Pharmacy Technician" },
  ],
  Locums: [
    { key: "MD", label: "Physician (MD/DO)" },
    { key: "NP", label: "Nurse Practitioner (NP)" },
    { key: "PA", label: "Physician Assistant (PA)" },
    { key: "CRNA", label: "Nurse Anesthetist (CRNA)" },
  ],
};

// Specialties per discipline — suggested universe; the dropdown shows the
// intersection with the published library (plus any imported extras).
export const SPECIALTIES_BY_DISCIPLINE: Record<string, Option[]> = {
  RN: [
    { key: "MEDSURG", label: "Med-Surg" },
    { key: "ICU", label: "ICU / Critical Care" },
    { key: "ER", label: "Emergency Room" },
    { key: "TELE", label: "Telemetry" },
    { key: "L&D", label: "Labor & Delivery" },
    { key: "OR", label: "Operating Room" },
    { key: "PACU", label: "PACU" },
    { key: "PEDS", label: "Pediatrics" },
    { key: "BEH", label: "Behavioral Health" },
    { key: "LTC", label: "Long-Term Care" },
    { key: "GENERAL", label: "General (Medication Administration)" },
  ],
  LPN: [
    { key: "MEDSURG", label: "Med-Surg" },
    { key: "LTC", label: "Long-Term Care" },
    { key: "GENERAL", label: "General (Medication Administration)" },
  ],
  CNA: [{ key: "LTC", label: "Long-Term Care" }],
  NP: [
    { key: "MEDSURG", label: "Med-Surg" },
    { key: "ICU", label: "ICU / Critical Care" },
    { key: "ER", label: "Emergency Room" },
  ],
  PT: [
    { key: "MEDSURG", label: "Med-Surg / Rehab" },
    { key: "GENERAL", label: "General" },
  ],
  PTA: [{ key: "GENERAL", label: "General" }],
  OT: [{ key: "GENERAL", label: "General" }],
  COTA: [{ key: "GENERAL", label: "General" }],
  SLP: [{ key: "GENERAL", label: "General" }],
  RT: [
    { key: "ICU", label: "ICU / Critical Care" },
    { key: "ER", label: "Emergency Room" },
  ],
  PharmD: [{ key: "GENERAL", label: "General" }],
  PharmTech: [{ key: "GENERAL", label: "General" }],
  MD: [{ key: "GENERAL", label: "General" }],
  PA: [{ key: "GENERAL", label: "General" }],
  CRNA: [{ key: "ICU", label: "ICU / Critical Care" }],
};

export const SPECIALTY_LABEL_MAP: Record<string, string> = {
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
  GENERAL: "General (Medication Administration)",
};

export function professionLabel(key: string): string {
  return PROFESSIONS.find((p) => p.key === key)?.label ?? key;
}

export function disciplineLabel(key: string): string {
  for (const list of Object.values(DISCIPLINES)) {
    const hit = list.find((d) => d.key === key);
    if (hit) return hit.label;
  }
  return key;
}

export function specialtyLabel(key: string): string {
  return SPECIALTY_LABEL_MAP[key] ?? key.replace(/_/g, " ");
}

// US states for the onboarding address block
export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];
