// VaultVerify Product & Content Brief — content part 1 (sections 1-6)
const { h1, h2, h3, p, li, numItem, copyBlock, tbl } = require("./vv-brief-lib");

function part1() {
  const c = [];

  // ── 1. How to use this brief ──
  c.push(h1("1. How to Use This Brief"));
  c.push(p("This document is the complete working brief for producing all public-facing content for VaultVerify, a skills self-assessment platform for healthcare professionals. It is written so that a copywriter or an AI assistant (such as ChatGPT) can produce publish-ready text without asking basic questions about what the product is, who it serves, or what it may and may not claim. Part 2 to Part 6 describe the product exactly as it is built today; Part 7 lists every content deliverable that needs to be written, with section-by-section instructions; Part 8 and Part 9 define the voice rules and the facts that are still missing."));
  c.push(p([
    { t: "Three product facts were recently corrected and override anything you may have seen in earlier drafts or on the current website: " },
    { t: "the catalog covers 190+ disciplines (not 10), each completed checklist is valid for 30 days (not 365), and the checklist is a pure self-assessment completed in 5 to 10 minutes with no reference or manager verification step", b: true },
    { t: ". Wherever this brief and any older material disagree, this brief wins. Text in 【full-width brackets】 marks a decision or detail that only the product owner can supply; the writer should keep the placeholder visible rather than inventing an answer." },
  ]));
  c.push(p("Recommended workflow: read Part 2 and Part 3 first for the mental model, then Part 7 for the exact writing assignments. When writing the Terms of Use and Privacy Policy, answer the open questions in Part 9 first (or ask the owner), because jurisdiction and entity details change the legal text materially.", { after: 200 }));

  // ── 2. Product snapshot ──
  c.push(h1("2. Product Snapshot"));
  c.push(h2("2.1 What VaultVerify Is"));
  c.push(p("VaultVerify is a web platform where healthcare professionals complete a fast, standardized self-assessment of their clinical skills and share the result with recruiters, staffing agencies, and employers. A user selects their profession, discipline, and specialty, rates themselves on the skills that matter for that role, signs the assessment, and receives a clean, branded skills report — viewable online and downloadable as a PDF. The report is valid for 30 days, which keeps skills snapshots current, and the user controls exactly who sees it and for how long."));
  c.push(p("The product solves a real friction point in healthcare hiring: recruiters repeatedly ask candidates to prove competence in specific skills (medication administration, IV therapy, wound care, EHR systems), and candidates rebuild that evidence from scratch for every application. VaultVerify turns that conversation into a five-to-ten minute structured checklist that produces one consistent, honest, clearly-labeled self-assessment report the candidate can reuse across applications — always presented as their own declaration, never as an independent verification."));
  c.push(h2("2.2 Single Source of Truth — Facts Every Piece of Content Must Use"));
  c.push(p("The table below is the canonical fact base. Every deliverable in Part 7 must agree with this table; any figure not listed here must come from the owner, not from the writer's imagination.", { keepNext: true }));
  c.push(...tbl("Table 1 — Canonical product facts", ["Item", "Canonical value"], [
    ["Product name", "VaultVerify"],
    ["One-line description", "Self-assessment skills checklists for healthcare professionals — complete in 5-10 minutes, share a clear report with the recruiters and employers you choose"],
    ["Who it serves", "Healthcare professionals (candidates) and the recruiters, staffing agencies, and employers who receive their reports"],
    ["Professions covered", "Nursing, Allied Health, Pharmacy, and Locums (four profession groups)"],
    ["Disciplines", "190+ disciplines across the four professions (e.g., RN, LPN, CNA, NP, PT, PTA, OT, COTA, SLP, RT, PharmD, Pharmacy Technician, MD/DO, PA, CRNA) — CORRECTED from an earlier draft that said 10"],
    ["Specialties", "Per-discipline specialty lists, e.g., Med-Surg, ICU / Critical Care, Emergency Room, Telemetry, Labor & Delivery, Operating Room, PACU, Pediatrics, Behavioral Health, Long-Term Care, General (Medication Administration)"],
    ["Time to complete", "5-10 minutes per checklist (self-assessment, single sitting)"],
    ["Rating scale per skill", "4 levels: 1 = No theory and/or experience; 2 = Limited experience; 3 = Experienced / minimal support needed; 4 = Proficient"],
    ["Recency per skill", "Required for every rated skill: Within 3 months / Within 6 months / 6+ months ago / N/A. In reports, \"recent\" means performed within the last 3 months"],
    ["Extra questions", "Yes/No and free-text questions managed by the platform, e.g., willingness to float to other units, night-shift comfort, EHR experience (which systems), travel-assignment openness, certifications and notes"],
    ["Signature", "Draw, type, or upload a signature"],
    ["Attestation at submit", "One self-declaration of accuracy plus one consent checkbox (exact wording in Part 7.5)"],
    ["Report validity", "30 days from submission — CORRECTED from 365 days; the candidate retakes the checklist to refresh"],
    ["Sharing model", "Candidate-controlled: shareable link with access presets (one-time view, 1 day, 1 week, 14 days, or custom) plus PDF download; shared only with recruiters/employers the candidate authorizes"],
    ["Honest labeling", "Every report is clearly labeled a self-assessment. VaultVerify confirms the checklist was completed and signed; it does not independently verify the answers"],
    ["Platform", "Mobile-first web application (works in any modern browser), branded PDF export, transactional email notifications"],
  ], [28, 72]));
  c.push(h2("2.3 The Honest-Positioning Statement"));
  c.push(p([
    { t: "The single most important content rule: VaultVerify is a " },
    { t: "self-assessment tool, not a verification service", b: true },
    { t: ". Earlier marketing drafts described referees answering anchored questions, manager-verified badges, 48-hour verification flows, and fraud radar — none of that exists in the product anymore, and none of it may appear in any new content. The value proposition is speed, structure, consistency, and candidate-controlled sharing, wrapped in honest language. A recruiter reading any VaultVerify page must never walk away believing VaultVerify has independently checked the candidate's skills; the report says \"self-reported\" plainly, and that honesty is itself a selling point." },
  ]));
  c.push(p("This positioning also has a legal dimension. Because the platform does not verify skills, the Terms of Use must make clear that the accuracy of a report depends on the candidate's own declarations, that VaultVerify's role is limited to providing the assessment tool and faithfully presenting what the candidate submitted, and that hiring decisions remain entirely with the recipient. Part 7.1 turns this into concrete clauses.", { after: 200 }));

  // ── 3. Guardrails ──
  c.push(h1("3. Positioning Guardrails — What VaultVerify Is Not"));
  c.push(p("The following list is a hard blacklist for all deliverables. These claims are factually wrong for the current product, and several would create real legal exposure if published. If a drafted sentence contains any of these concepts, rewrite it."));
  c.push(li([{ t: "No reference checks or referee interviews. ", b: true }, { t: "There is no flow in which a former manager or colleague answers questions. The words \"referee\", \"reference check\", and \"verified against my references\" must not appear." }]));
  c.push(li([{ t: "No manager-verified badges. ", b: true }, { t: "There is no two-party flow and no badge distinguishing manager-verified from self-reported skills. There is only the candidate's self-assessment." }]));
  c.push(li([{ t: "No time-based verification promises. ", b: true }, { t: "Never write \"verified in 48 hours\", \"references that finish in days\", or similar. Nothing is verified; the checklist simply takes 5-10 minutes to complete." }]));
  c.push(li([{ t: "No fraud-detection claims. ", b: true }, { t: "Do not describe fraud radar, IP analysis, or anomaly detection. Internal tooling is not a public marketing claim." }]));
  c.push(li([{ t: "No credentialing or licensing authority. ", b: true }, { t: "VaultVerify is not a licensing board, credentialing body, background-check provider, or staffing agency, and does not replace any of them." }]));
  c.push(li([{ t: "No employment-outcome promises. ", b: true }, { t: "Never imply that a report guarantees an interview, placement, licensure, or visa outcome, in any jurisdiction." }]));
  c.push(li([{ t: "No statistics without a source. ", b: true }, { t: "Old drafts cited figures like an 86% completion rate or a 4-minute referee experience. Unless the owner supplies new, real numbers, avoid statistics entirely." }]));
  c.push(li([{ t: "No admin internals. ", b: true }, { t: "The superadmin console, its capabilities, internal codes, template library management, and credit mechanics are confidential and must not be described in public content." }]));

  // ── 4. Candidate journey ──
  c.push(h1("4. Core Functionality — The Candidate Journey"));
  c.push(p("This part walks through the product exactly as a candidate experiences it, from arrival to a shared report. Writers should internalize this flow because the landing page copy (Part 7.3) and FAQ (Part 7.4) must mirror it step for step. The journey has eight stages."));
  c.push(h2("Step 1 — Arrive and start"));
  c.push(p("The candidate lands on the homepage, reads a short explanation of what VaultVerify does, and starts a checklist. No payment and no app install are involved. The page works on a phone as comfortably as on a laptop, and the tone of the entry experience is calm and professional rather than salesy."));
  c.push(h2("Step 2 — Create the account"));
  c.push(p("The candidate creates an account with their email address as the username, plus their full name and phone number. Email verification confirms the address. The account lets the candidate return later, keep multiple checklists, manage sharing links, and download reports again without redoing the assessment."));
  c.push(h2("Step 3 — Choose profession, discipline, and specialty"));
  c.push(p("The candidate picks one of four professions — Nursing, Allied Health, Pharmacy, or Locums — then a discipline from the 190+ discipline library (for example Registered Nurse, Physical Therapist, Pharmacist, or Nurse Anesthetist), then a specialty within that discipline (for example ICU / Critical Care, Emergency Room, or Labor & Delivery for nursing). The checklist content adapts to this selection: a Med-Surg nurse and an ICU nurse see different skill groups."));
  c.push(h2("Step 4 — Enter experience"));
  c.push(p("The candidate states their overall years of experience and their years of experience in the current specialty, either as a number of years or as the date they started. These two data points appear on the report header alongside the discipline and specialty, giving recruiters immediate context before they read a single skill rating."));
  c.push(h2("Step 5 — Complete the skills checklist"));
  c.push(p("The heart of the product. Skills are grouped into categories relevant to the chosen specialty, and for every skill the candidate sets two things: a proficiency rating from 1 to 4 (No theory and/or experience, Limited experience, Experienced / minimal support needed, Proficient) and a recency answer (Within 3 months, Within 6 months, 6+ months ago, or N/A). A skill marked N/A still records a recency note. The interface tracks progress, allows the candidate to move back and forth, and is designed so an experienced clinician finishes in 5 to 10 minutes without feeling rushed."));
  c.push(h2("Step 6 — Answer additional questions"));
  c.push(p("After the skill ratings, the candidate answers a short set of yes/no and free-text questions — for example, whether they are willing to float to other units, comfortable with night shifts, experienced with EHR systems (and which ones), and open to travel assignments, plus a free-text field for extra certifications and notes. These questions are configured by the platform per checklist, so the exact set may vary; copy should describe them generically as \"a few practical questions recruiters commonly ask\"."));
  c.push(h2("Step 7 — Sign, consent, and submit"));
  c.push(p("The candidate signs the assessment by drawing, typing, or uploading their signature, confirms the accuracy attestation in their own words, and ticks exactly one consent checkbox (the wording is fixed — see Part 7.5). Submitting generates the report immediately; nothing is sent to anyone at this point. Sharing is a separate, deliberate act the candidate performs later."));
  c.push(h2("Step 8 — View, download, and share the report"));
  c.push(p("The finished report is available as a web view and a branded PDF. The candidate can create share links with controlled access — one-time view, 1 day, 1 week, 14 days, or a custom duration — and send them to whichever recruiters or employers they choose, or attach the PDF directly. Links expire automatically per the chosen preset. The report remains valid for 30 days from submission; after that the candidate is prompted to retake the checklist so their snapshot stays current.", { after: 200 }));

  // ── 5. The report ──
  c.push(h1("5. The Skills Report"));
  c.push(p("The report is the product's deliverable, and every page of public copy should describe it concretely. A report contains the candidate's name, profession, discipline, and specialty; their overall and specialty experience; the date completed and the validity date 30 days later; every skill grouped by category with its color-coded 1-4 rating and recency; the answers to the additional questions; the candidate's signature; and the attestation text the candidate confirmed. Ratings are visualized consistently — 1 red, 2 amber, 3 blue, 4 green — so a recruiter can scan strengths at a glance, and \"recent\" is always defined as performed within the last 3 months."));
  c.push(p("Every page and header of the report carries plain-language labeling that this is a self-assessment completed and signed by the candidate, and a short disclaimer paragraph (exact wording to be produced under Part 7.5) stating that VaultVerify provides the assessment tool but does not independently verify the answers, and that recipients should conduct their own due diligence. This labeling is not optional garnish; it is a core feature of the product and the foundation of its legal position."));
  c.push(p("The PDF is designed to be read in under two minutes: a clean summary header, compact skill tables with ratings and recency, and the signature and attestation block at the end. When describing the report in marketing copy, emphasize structure, consistency across candidates, scannability, and honest labeling — never verification.", { after: 200 }));

  // ── 6. Other sides of the platform ──
  c.push(h1("6. Recipients, Accounts, and Administration"));
  c.push(h2("6.1 Recruiters and Employers"));
  c.push(p("Recruiters, staffing agencies, and employers experience VaultVerify primarily as recipients: they receive a candidate's share link or PDF and read the report. A recruiter-facing portal also exists with accounts (email and password with email verification) where recruiters can view checklists shared with them and download the PDF. Some portal features operate on a credit basis, so access to certain views may be metered; public copy should not dive into credit mechanics, and the Terms of Use should describe paid or metered features generically unless the owner provides pricing details (see Part 9)."));
  c.push(h2("6.2 Administration (Confidential — Not for Public Content)"));
  c.push(p("A private administration console lets the platform team manage the discipline and specialty library (the source of the 190+ disciplines), the skill templates behind every checklist, the additional questions, user accounts, credits, email templates, and an audit trail of significant events. This console — and the fact that checklist content is centrally curated — is internal information. Public content may say that checklists are \"built from a professional skills library covering 190+ disciplines\" but must not describe admin screens, internal tooling, or any access codes."));
  c.push(h2("6.3 Emails and Notifications"));
  c.push(p("The platform sends transactional email — for example, email-address verification, a confirmation when a checklist is submitted, notification when someone opens a share link, and password resets. These messages use the same voice rules as the site (Part 8). Email copy is a light deliverable listed in Part 7.6; the writer should produce short, plain templates that the owner can load into the email system.", { after: 200 }));

  return c;
}

module.exports = { part1 };
