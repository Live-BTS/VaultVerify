/**
 * Read-only review artifact for pre-push review of commit a047d81.
 * Generates a PDF through the REAL renderer (renderSkillsChecklistPdf) with
 * fixture data mirroring src/app/api/checklist/pdf/route.ts mapChecklistData()
 * output. No DB access, no writes outside the output PDF file.
 */
import { renderSkillsChecklistPdf, type ChecklistData, type Rating } from "../src/lib/pdf/skills-checklist-pdf";
import { writeFileSync } from "node:fs";

const ratings: (Rating | null)[] = [4, 3, 4, 2, 4, null, 3, 4, 1, 3, 4, 2];
const lpPool = ["within_3_months", "within_6_months", "over_6_months", "na"] as const;

function cat(name: string, skills: string[]): ChecklistData["categories"][number] {
  return {
    name,
    skills: skills.map((s, i) => ({
      name: s,
      rating: ratings[(i + name.length) % ratings.length],
      lastPerformed: lpPool[(i + name.length) % lpPool.length],
    })),
  };
}

const data: ChecklistData = {
  candidate: {
    name: "Emma Chen",
    profession: "Nursing",
    jobTitle: "Registered Nurse",
    specialty: "Medical-Surgical",
    email: "emma.chen@example.com",
    experience: "6 yr(s)",
    completedOn: "Oct 15, 2026",
    validUntil: "Nov 14, 2026 (30 days)",
    source: "Self-initiated",
  },
  categories: [
    cat("Clinical Assessment", [
      "Head-to-toe assessment", "Pain assessment", "Neurological checks", "Wound care",
      "IV insertion & site care", "Phlebotomy", "Catheterization", "NG tube care",
    ]),
    cat("Medications & Safety", [
      "Medication administration (PO)", "IV push meds", "Blood transfusion", "Isolation precautions",
      "Fall precautions", "Restraint use", "Emergency codes", "Specimen handling",
    ]),
  ],
  questions: [
    {
      category: "Availability & preferences",
      items: [{ type: "yes_no" as const, question: "Available for weekend shifts?", answer: true }],
    },
    {
      category: "Experience notes",
      items: [{ type: "text" as const, question: "Describe your most recent unit.", answer: "36-bed med-surg unit, charge coverage twice weekly." }],
    },
  ],
  attestation: {
    statements: [
      { text: "I confirm that the ratings above are my own and reflect my real experience. I understand that inaccurate information may affect my eligibility for placement.", accepted: true },
    ],
    signatureName: "Emma Chen",
    printedName: "Emma Chen",
    signedOn: "Oct 15, 2026",
  },
  footerNote: "Self-reported assessment. Completed once by the candidate and valid for 30 days. Accessed by the candidate from their VaultVerify portal.",
  generatedOn: "Oct 16, 2026",
  sampleNotice: "",
};

const pdf = await renderSkillsChecklistPdf(data);
const out = "/home/z/my-project/download/batch1-pdf-stamp-review.pdf";
writeFileSync(out, pdf);
console.log(`OK pages-check via renderer: wrote ${out} (${pdf.length} bytes)`);
