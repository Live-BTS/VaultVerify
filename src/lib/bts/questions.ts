import type { ChecklistTemplate } from "./constants";

// ── The 10 reference questions (mobile-first, one per screen) ─
// Rating questions use the 5-point anchored scale + "Unable to observe".
// Q8 carries conditional logic: Yes => mandatory explanation.

export interface QuestionDef {
  key: string;
  type: "rating" | "text" | "select" | "boolean";
  title: string;
  help?: string;
  required: boolean;
  options?: string[];
  conditionalOn?: { key: string; equals: boolean };
}

export const QUESTIONS: QuestionDef[] = [
  {
    key: "q1_relationship",
    type: "select",
    title: "What was your working relationship with this nurse?",
    help: "Pick the option that best describes how you worked together.",
    required: true,
    options: ["Direct supervisor", "Charge nurse / team lead", "Peer colleague on same unit", "Educator / preceptor", "Other working relationship"],
  },
  {
    key: "q2_overall",
    type: "rating",
    title: "Overall, how would you rate this nurse's clinical performance?",
    help: "Consider safety, judgment, and consistency across their shifts with you.",
    required: true,
  },
  {
    key: "q3_skills",
    type: "rating",
    title: "How would you rate their clinical skills and knowledge for their specialty?",
    help: "Think about the unit they worked on with you, not their whole career.",
    required: true,
  },
  {
    key: "q4_dependability",
    type: "rating",
    title: "How would you rate their dependability and attendance?",
    help: "Punctuality, completed shifts, notice given for time off.",
    required: true,
  },
  {
    key: "q5_teamwork",
    type: "rating",
    title: "How would you rate their communication and teamwork?",
    help: "Handoffs, collaboration with providers, interaction with families.",
    required: true,
  },
  {
    key: "q6_professionalism",
    type: "rating",
    title: "How would you rate their professionalism and work ethic?",
    help: "Accountability, respect for policy, conduct under pressure.",
    required: true,
  },
  {
    key: "q7_critical_thinking",
    type: "rating",
    title: "How would you rate their critical thinking and patient assessment?",
    help: "Recognizing deterioration, escalating appropriately, prioritizing.",
    required: true,
  },
  {
    key: "q8_discipline",
    type: "boolean",
    title: "To your knowledge, has this nurse ever been subject to formal disciplinary action or a substantiated complaint?",
    help: "Answer to the best of your knowledge. If you prefer not to answer, choose “Prefer not to say”.",
    required: true,
  },
  {
    key: "q9_recommend",
    type: "select",
    title: "Would you recommend this nurse for the specialty role they are applying to?",
    required: true,
    options: ["Yes, without hesitation", "Yes, with minor reservations", "With significant reservations", "No"],
  },
  {
    key: "q10_rehire",
    type: "boolean",
    title: "Would you work with this nurse again?",
    required: true,
  },
];

export const Q8_EXPLANATION_PROMPT =
  "You answered Yes — please briefly describe the nature of the disciplinary action or complaint, the outcome, and approximately when it occurred. This field is required.";

// ── Specialty skill checklists (Phase 1: Med-Surg + ICU) ──────

export const CHECKLISTS: ChecklistTemplate[] = [
  {
    specialty: "MEDSURG",
    label: "Med-Surg",
    skills: [
      { name: "IV insertion & site care" },
      { name: "IV push / infusion medications" },
      { name: "Wound care & dressing changes" },
      { name: "Medication administration (oral / IM / SubQ)" },
      { name: "Pain management & reassessment" },
      { name: "Foley catheter insertion & care" },
      { name: "Tracheostomy care & suctioning" },
      { name: "Oxygen therapy & respiratory treatments" },
      { name: "Care plans & discharge education" },
      { name: "Fall risk & safety protocols" },
      { name: "Telemetry — basic rhythm interpretation" },
      { name: "Blood transfusion administration" },
      { name: "Diabetic care & insulin management" },
      { name: "NG / G-tube feeding & care" },
    ],
  },
  {
    specialty: "ICU",
    label: "ICU / Critical Care",
    skills: [
      { name: "Ventilator management", highRisk: true },
      { name: "Titrating vasoactive drips (norepi, vasopressin…)", highRisk: true },
      { name: "Arterial lines & hemodynamic monitoring", highRisk: true },
      { name: "Central line care & CLABSI prevention", highRisk: true },
      { name: "CRRT / dialysis circuits", highRisk: true },
      { name: "Chest tube management" },
      { name: "ICP monitoring & neuro assessments" },
      { name: "Sedation & analgesia (RASS scoring)" },
      { name: "Code Blue / ACLS response" },
      { name: "Blood transfusion in critical care" },
      { name: "Tracheostomy care & suctioning" },
      { name: "Pressure injury prevention" },
      { name: "Family communication & end-of-life care" },
    ],
  },
];

export const RECENCY_OPTIONS = [
  { value: 1, label: "Within the last 3 months" },
  { value: 4, label: "4–6 months ago" },
  { value: 7, label: "7–12 months ago" },
  { value: 13, label: "More than 12 months ago" },
];

export function templateFor(specialty: string): ChecklistTemplate {
  return (
    CHECKLISTS.find((c) => c.specialty === specialty) ?? {
      specialty: "MEDSURG",
      label: "Med-Surg",
      skills: CHECKLISTS[0].skills,
    }
  );
}
