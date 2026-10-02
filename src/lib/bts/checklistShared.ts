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

export const LABELS = SPECIALTY_LABELS;
