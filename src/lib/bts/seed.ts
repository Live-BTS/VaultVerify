import { db } from "@/lib/db";
import { CHECKLISTS } from "./questions";
import { LINK_EXPIRY_DAYS } from "./constants";

// ── Idempotent seed: MEDS Talent agency + demo candidates ─────
// Creates a demo dataset that exercises every recruiter state:
// completed, sent, in-progress, flagged, plus self-reported skills.

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

function callbackCode(token: string): string {
  let h = 0;
  for (const c of token) h = (h * 31 + c.charCodeAt(0)) % 1000000;
  return String(h).padStart(6, "0");
}

export function deriveCallbackCode(token: string): string {
  return callbackCode(token);
}

export async function ensureSeed(): Promise<{ seeded: boolean; agencyId: string }> {
  const existing = await db.agency.findUnique({ where: { slug: "meds-talent" } });
  if (existing) return { seeded: false, agencyId: existing.id };

  const agency = await db.agency.create({
    data: {
      name: "MEDS Talent",
      slug: "meds-talent",
      logoText: "MEDS",
      tagline: "Verified references. Faster placements.",
      primaryColor: "#0F766E",
      accentColor: "#B45309",
    },
  });

  // ── Candidate 1: Maya Rodriguez (ICU) — one completed, one pending ──
  const maya = await db.candidate.create({
    data: {
      agencyId: agency.id,
      fullName: "Maya Rodriguez",
      email: "maya.rodriguez@example.com",
      phone: "(312) 555-0148",
      role: "RN",
      specialty: "ICU",
      yearsExperience: 6,
      city: "Chicago",
      state: "IL",
      licenseNumber: "IL-RN-441320",
      consentSignature: "Maya Rodriguez",
      consentSignedAt: daysAgo(3),
      skills: {
        create: CHECKLISTS[1].skills.slice(0, 10).map((s, i) => ({
          skillName: s.name,
          specialty: "ICU",
          highRisk: !!s.highRisk,
          proficiency: i % 3 === 0 ? "CAN_TEACH" : i % 3 === 1 ? "INDEPENDENT" : "INDEPENDENT",
          recencyMonths: [1, 1, 4, 1, 7, 4, 1, 1, 13, 4][i] ?? 1,
        })),
      },
    },
  });

  const mayaRef1 = await db.referenceRequest.create({
    data: {
      candidateId: maya.id,
      refName: "Daniel Okafor",
      refTitle: "ICU Nurse Manager",
      refEmail: "d.okafor@stmaryschicago.org",
      refPhone: "(312) 555-0177",
      facilityName: "St. Mary's Medical Center",
      facilityCity: "Chicago",
      facilityState: "IL",
      relationship: "Direct supervisor",
      workStartDate: "2023-06",
      workEndDate: "",
      status: "COMPLETED",
      sentAt: daysAgo(3),
      openedAt: daysAgo(3),
      startedAt: daysAgo(3),
      completedAt: daysAgo(3),
      expiresAt: daysFromNow(LINK_EXPIRY_DAYS - 3),
    },
  });

  const mayaResp1 = await db.referenceResponse.create({
    data: {
      requestId: mayaRef1.id,
      identityMethod: "EMAIL_DOMAIN",
      verifiedDomain: "stmaryschicago.org",
      confirmedRelationship: "Direct supervisor",
      confirmedFacility: "St. Mary's Medical Center, Chicago, IL",
      confirmedDates: "June 2023 - present",
      mismatchNotes: "",
      answers: JSON.stringify([
        { key: "q1_relationship", type: "select", value: "Direct supervisor", question: "What was your working relationship with this nurse?" },
        { key: "q2_overall", type: "rating", value: 5, question: "Overall, how would you rate this nurse's clinical performance?" },
        { key: "q3_skills", type: "rating", value: 5, question: "How would you rate their clinical skills and knowledge for their specialty?" },
        { key: "q4_dependability", type: "rating", value: 4, question: "How would you rate their dependability and attendance?" },
        { key: "q5_teamwork", type: "rating", value: 5, question: "How would you rate their communication and teamwork?" },
        { key: "q6_professionalism", type: "rating", value: 5, question: "How would you rate their professionalism and work ethic?" },
        { key: "q7_critical_thinking", type: "rating", value: 4, question: "How would you rate their critical thinking and patient assessment?" },
        { key: "q8_discipline", type: "boolean", value: "NO", question: "Has this nurse ever been subject to formal disciplinary action or a substantiated complaint?" },
        { key: "q9_recommend", type: "select", value: "Yes, without hesitation", question: "Would you recommend this nurse for the specialty role they are applying to?" },
        { key: "q10_rehire", type: "boolean", value: "YES", question: "Would you work with this nurse again?" },
      ]),
      overallRating: 4.7,
      q8Discipline: false,
      remarks:
        "Maya is one of the strongest ICU nurses on my unit. She precepted two new grads last year and routinely takes the most complex drips. I would staff her on any shift without thinking twice.",
      signatureName: "Daniel Okafor",
      signedAt: daysAgo(3),
      signerIp: "198.51.100.24",
      signerUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1",
      durationSeconds: 262,
      skillsVerified: true,
    },
  });

  await db.skillVerification.createMany({
    data: [
      { responseId: mayaResp1.id, skillName: "Ventilator management", nurseProficiency: "CAN_TEACH", confirmed: true },
      { responseId: mayaResp1.id, skillName: "Titrating vasoactive drips (norepi, vasopressin…)", nurseProficiency: "CAN_TEACH", confirmed: true },
      { responseId: mayaResp1.id, skillName: "Arterial lines & hemodynamic monitoring", nurseProficiency: "INDEPENDENT", confirmed: true },
      { responseId: mayaResp1.id, skillName: "Central line care & CLABSI prevention", nurseProficiency: "INDEPENDENT", confirmed: false, refProficiency: "SUPERVISED", comment: "Confirmed under supervision level per our policy in first 90 days." },
    ],
  });

  await db.referenceRequest.create({
    data: {
      candidateId: maya.id,
      refName: "Priya Natarajan",
      refTitle: "Charge Nurse, MICU",
      refEmail: "priya.natarajan@cookcountyhealth.org",
      refPhone: "(312) 555-0192",
      facilityName: "Cook County Health",
      facilityCity: "Chicago",
      facilityState: "IL",
      relationship: "Charge nurse / team lead",
      workStartDate: "2021-02",
      workEndDate: "2023-05",
      status: "SENT",
      sentAt: daysAgo(1),
      expiresAt: daysFromNow(LINK_EXPIRY_DAYS - 1),
    },
  });

  // ── Candidate 2: James Chen (Med-Surg) — flagged + in progress ──
  const james = await db.candidate.create({
    data: {
      agencyId: agency.id,
      fullName: "James Chen",
      email: "james.chen@example.com",
      phone: "(206) 555-0119",
      role: "RN",
      specialty: "MEDSURG",
      yearsExperience: 3,
      city: "Seattle",
      state: "WA",
      licenseNumber: "WA-RN-88210",
      consentSignature: "James Chen",
      consentSignedAt: daysAgo(6),
      skills: {
        create: CHECKLISTS[0].skills.slice(0, 9).map((s, i) => ({
          skillName: s.name,
          specialty: "MEDSURG",
          highRisk: !!s.highRisk,
          proficiency: i % 2 === 0 ? "INDEPENDENT" : "SUPERVISED",
          recencyMonths: [1, 4, 1, 1, 7, 1, 4, 1, 13][i] ?? 1,
        })),
      },
    },
  });

  await db.referenceRequest.create({
    data: {
      candidateId: james.id,
      refName: "J. Chen",
      refTitle: "Unit Secretary",
      refEmail: "jchen82@gmail.com",
      refPhone: "(206) 555-0121",
      facilityName: "Swedish Medical Center",
      facilityCity: "Seattle",
      facilityState: "WA",
      relationship: "Peer colleague on same unit",
      workStartDate: "2022-01",
      workEndDate: "2024-08",
      status: "FLAGGED",
      sentAt: daysAgo(6),
      openedAt: daysAgo(6),
      startedAt: daysAgo(5),
      completedAt: daysAgo(5),
      expiresAt: daysFromNow(LINK_EXPIRY_DAYS - 6),
      flags: {
        create: [
          { type: "FREE_EMAIL_SURNAME_MATCH", detail: "Reference email uses free provider gmail.com and contains the candidate's surname \"chen\" (jchen82@gmail.com).", severity: "HIGH" },
          { type: "RAPID_COMPLETION", detail: "Form completed in 41s — below the 60s floor for a genuine reference.", severity: "MEDIUM" },
        ],
      },
      response: {
        create: {
          identityMethod: "SKIPPED",
          confirmedRelationship: "Peer colleague on same unit",
          confirmedFacility: "Swedish Medical Center",
          confirmedDates: "2022-01 - 2024-08",
          mismatchNotes: "",
          answers: JSON.stringify([
            { key: "q1_relationship", type: "select", value: "Peer colleague on same unit", question: "What was your working relationship with this nurse?" },
            { key: "q2_overall", type: "rating", value: 5, question: "Overall, how would you rate this nurse's clinical performance?" },
            { key: "q3_skills", type: "rating", value: 5, question: "How would you rate their clinical skills and knowledge for their specialty?" },
            { key: "q4_dependability", type: "rating", value: 5, question: "How would you rate their dependability and attendance?" },
            { key: "q5_teamwork", type: "rating", value: 5, question: "How would you rate their communication and teamwork?" },
            { key: "q6_professionalism", type: "rating", value: 5, question: "How would you rate their professionalism and work ethic?" },
            { key: "q7_critical_thinking", type: "rating", value: 5, question: "How would you rate their critical thinking and patient assessment?" },
            { key: "q8_discipline", type: "boolean", value: "NO", question: "Has this nurse ever been subject to formal disciplinary action or a substantiated complaint?" },
            { key: "q9_recommend", type: "select", value: "Yes, without hesitation", question: "Would you recommend this nurse for the specialty role they are applying to?" },
            { key: "q10_rehire", type: "boolean", value: "YES", question: "Would you work with this nurse again?" },
          ]),
          overallRating: 5.0,
          q8Discipline: false,
          remarks: "Best nurse I ever worked with.",
          signatureName: "J. Chen",
          signedAt: daysAgo(5),
          signerIp: "203.0.113.77",
          signerUserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0",
          durationSeconds: 41,
          skillsVerified: false,
        },
      },
    },
  });

  await db.referenceRequest.create({
    data: {
      candidateId: james.id,
      refName: "Alicia Gomez",
      refTitle: "Med-Surg Nurse Manager",
      refEmail: "agomez@uwmedicine.org",
      refPhone: "(206) 555-0188",
      facilityName: "UW Medical Center",
      facilityCity: "Seattle",
      facilityState: "WA",
      relationship: "Direct supervisor",
      workStartDate: "2024-09",
      workEndDate: "",
      status: "IN_PROGRESS",
      sentAt: daysAgo(11),
      openedAt: daysAgo(10),
      startedAt: daysAgo(10),
      expiresAt: daysFromNow(LINK_EXPIRY_DAYS - 11),
      reminderCount: 2,
      lastReminderAt: daysAgo(2),
    },
  });

  await db.notificationLog.createMany({
    data: [
      { channel: "SMS", kind: "INVITE", to: "(312) 555-0177", body: "MEDS Talent reference request: Maya Rodriguez has listed you as a professional reference...", status: "SIMULATED" },
      { channel: "EMAIL", kind: "INVITE", to: "d.okafor@stmaryschicago.org", body: "MEDS Talent reference request: Maya Rodriguez has listed you as a professional reference...", status: "SIMULATED" },
      { channel: "SMS", kind: "INVITE", to: "(206) 555-0188", body: "MEDS Talent reference request: James Chen has listed you as a professional reference...", status: "SIMULATED" },
      { channel: "SMS", kind: "REMINDER", to: "(206) 555-0188", body: "Friendly reminder (5 days open): James Chen's MEDS Talent reference form is still waiting for you...", status: "SIMULATED" },
      { channel: "SMS", kind: "REMINDER", to: "(206) 555-0188", body: "Friendly reminder (9 days open): James Chen's MEDS Talent reference form is still waiting for you...", status: "SIMULATED" },
    ],
  });

  return { seeded: true, agencyId: agency.id };
}
