// ── BTS Phase 1 shared constants & types ──────────────────────

export const SPECIALTIES = [
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
] as const;

export function specialtyLabel(key: string): string {
  return SPECIALTIES.find((s) => s.key === key)?.label ?? key;
}

export const NURSE_ROLES = ["RN", "LPN", "CNA", "NP"] as const;

export const STATUSES = ["SENT", "OPENED", "IN_PROGRESS", "COMPLETED", "FLAGGED", "EXPIRED"] as const;
export type RequestStatus = (typeof STATUSES)[number];

export const STATUS_META: Record<string, { label: string; color: string; desc: string }> = {
  SENT: { label: "Sent", color: "bg-slate-100 text-slate-700 border-slate-200", desc: "Invite delivered, not yet opened" },
  OPENED: { label: "Opened", color: "bg-sky-50 text-sky-700 border-sky-200", desc: "Reference opened the link" },
  IN_PROGRESS: { label: "In progress", color: "bg-amber-50 text-amber-700 border-amber-200", desc: "Form started, not submitted" },
  COMPLETED: { label: "Completed", color: "bg-teal-50 text-teal-700 border-teal-200", desc: "Signed and submitted" },
  FLAGGED: { label: "Flagged", color: "bg-rose-50 text-rose-700 border-rose-200", desc: "Fraud pattern detected — review" },
  EXPIRED: { label: "Expired", color: "bg-zinc-100 text-zinc-500 border-zinc-200", desc: "Link expired after 14 days" },
};

export const PROFICIENCY_META: Record<string, { label: string; short: string }> = {
  NEVER: { label: "Never performed", short: "Never" },
  SUPERVISED: { label: "With supervision", short: "Supervised" },
  INDEPENDENT: { label: "Independent", short: "Independent" },
  CAN_TEACH: { label: "Can teach others", short: "Can teach" },
};

// 5-point anchored scale used across all rating questions
export const RATING_SCALE = [
  { value: 1, label: "Needs significant improvement", anchor: "Consistently below safe practice standards; required repeated intervention" },
  { value: 2, label: "Below expectations", anchor: "Inconsistent; needed more support than expected for the role" },
  { value: 3, label: "Meets expectations", anchor: "Reliable, safe, solid performance for the role" },
  { value: 4, label: "Exceeds expectations", anchor: "Strong performance; often handled complex cases with ease" },
  { value: 5, label: "Exceptional", anchor: "Top-tier; a go-to resource for peers and charge nurses" },
] as const;

export const UNABLE_TO_OBSERVE = "UNABLE_TO_OBSERVE";

export const LINK_EXPIRY_DAYS = 14;
export const REMINDER_DAYS = [2, 5, 9];
export const SWAP_PROMPT_DAY = 10;
export const RAPID_COMPLETION_SECONDS = 60;

export interface AnswerRecord {
  key: string;
  type: "rating" | "text" | "select" | "boolean";
  value: number | string | boolean | null;
  unableToObserve?: boolean;
}

export interface ChecklistSkill {
  name: string;
  highRisk?: boolean;
}

export interface ChecklistTemplate {
  specialty: string;
  label: string;
  skills: ChecklistSkill[];
}
