// VaultVerify Product & Content Brief — content part 2 (sections 7-8)
const { h1, h2, h3, p, li, numItem, copyBlock, tbl } = require("./vv-brief-lib");

function part2() {
  const c = [];

  // ── 7. Content deliverables ──
  c.push(h1("7. Content Deliverables — What Needs to Be Written"));
  c.push(p("Seven deliverables are required, listed in priority order. The first two are legal documents that the platform needs before launch; the rest are site content. Each sub-section below is itself the writing brief for that deliverable: it states the audience, the required sections, the must-include substance, and the length target. A writer (or ChatGPT) given this part plus Part 2 and Part 3 has everything needed to draft the exact text."));
  c.push(...tbl("Table 2 — Deliverables overview", ["ID", "Deliverable", "Where it lives", "Target length"], [
    ["D1", "Terms of Use (Terms & Conditions)", "Page at /terms, linked from the consent checkbox and footer", "1,500-2,500 words"],
    ["D2", "Privacy Policy", "Page at /privacy, linked from the consent checkbox and footer", "1,200-2,000 words"],
    ["D3", "Landing page copy (full rewrite)", "Homepage sections", "500-800 words total"],
    ["D4", "FAQ", "FAQ section or page", "12-16 Q&As, 40-80 words each"],
    ["D5", "Micro-copy pack (exact UI strings)", "Checkbox, report footer, share dialogs, empty states", "Exact strings, as listed"],
    ["D6", "Transactional email snippets", "Verification, submission, share-viewed, reset", "2-4 sentences each"],
    ["D7", "Recruiter one-pager (optional)", "PDF or landing section for recipients", "250-400 words"],
  ], [8, 34, 38, 20]));

  // ── 7.1 Terms of Use ──
  c.push(h2("7.1 D1 — Terms of Use (Writing Brief)"));
  c.push(p([
    { t: "Audience and tone: ", b: true },
    { t: "healthcare professionals and recruiters reading plain-English terms; professional, firm, and readable — no Victorian legalese, but no casual tone either. Length 1,500-2,500 words. Governing law, entity identity, and dispute venue are placeholders until the owner answers Part 9. The document must be written so it would survive scrutiny as the actual operative agreement, not as marketing text about terms." },
  ]));
  c.push(p("Required clauses, in order, each with the substance it must capture:"));
  c.push(numItem("toc-list", [{ t: "Who we are. ", b: true }, { t: "Identify the operator: [Legal entity name], registered address [address], contact email [support/legal email], operating the website [domain] and the VaultVerify service." }]));
  c.push(numItem("toc-list", [{ t: "Definitions. ", b: true }, { t: "Define the Service, the Platform, a Candidate, a Recipient (recruiter, staffing agency, employer), a Checklist, a Report, and the Validity Period (30 days)."}]));
  c.push(numItem("toc-list", [{ t: "Eligibility and accounts. ", b: true }, { t: "Candidates must be at least 18 and legally able to work in the roles they assess themselves for; accounts require accurate registration details; the user is responsible for credentials and activity under the account." }]));
  c.push(numItem("toc-list", [{ t: "Nature of the Service — the critical clause. ", b: true }, { t: "State plainly that VaultVerify provides a self-assessment tool; Reports reflect the Candidate's own declarations; VaultVerify does not independently verify, endorse, or certify any skill, qualification, or statement in a Report; completion of a Checklist is confirmed, accuracy is not. This clause is the anchor for the disclaimers later." }]));
  c.push(numItem("toc-list", [{ t: "Candidate obligations and accuracy. ", b: true }, { t: "The Candidate warrants that the information and ratings they submit are truthful and their own; misrepresentation may lead to report takedown and account suspension; VaultVerify may act on credible reports of false information." }]));
  c.push(numItem("toc-list", [{ t: "Sharing and release — absorbs the old consent sentence. ", b: true }, { t: "State that by submitting a Checklist, the Candidate authorizes VaultVerify to make the Report available to the recruiters and employers the Candidate designates (via share link or PDF), in the access window the Candidate selects; that Recipients may rely on the Report for their own evaluation and may conduct their own verification; and that VaultVerify is released from liability for information provided in good faith through the Service." }]));
  c.push(numItem("toc-list", [{ t: "Recipient obligations. ", b: true }, { t: "Recipients use Reports only for legitimate hiring or credentialing evaluation, do not redistribute Reports beyond their organization's need-to-know, and comply with applicable employment and privacy law when using them." }]));
  c.push(numItem("toc-list", [{ t: "Validity and re-assessment. ", b: true }, { t: "A Report is valid for 30 days from submission; expired Reports are clearly dated; Candidates are encouraged to retake the Checklist to refresh; Recipients should check the completion date." }]));
  c.push(numItem("toc-list", [{ t: "Acceptable use. ", b: true }, { t: "No impersonation, no submitting assessments for another person, no scraping, no attempts to compromise the platform, no unlawful use." }]));
  c.push(numItem("toc-list", [{ t: "Fees and credits (generic). ", b: true }, { t: "Describe any metered or paid features generically — [confirm pricing/credit model with owner]; state that prices, if any, are presented before purchase and may change with notice." }]));
  c.push(numItem("toc-list", [{ t: "Intellectual property. ", b: true }, { t: "The platform, checklists, templates, and branding belong to the operator; the Candidate owns the information they submit and grants VaultVerify the limited license needed to store, render, and share the Report as directed." }]));
  c.push(numItem("toc-list", [{ t: "Disclaimers and limitation of liability. ", b: true }, { t: "Service provided \"as is\"; no warranty of accuracy of self-reported content; not a licensing, credentialing, or background-check body; hiring decisions rest solely with Recipients; liability capped to the extent permitted by [jurisdiction] law." }]));
  c.push(numItem("toc-list", [{ t: "Indemnity, termination, and changes. ", b: true }, { t: "User indemnifies the operator against claims arising from their false statements or misuse; either party may end the account relationship; terms may change with notice and a stated effective date." }]));
  c.push(numItem("toc-list", [{ t: "Governing law and disputes. ", b: true }, { t: "[Governing law jurisdiction]; venue [courts/arbitration]; contact route for disputes before litigation." }]));
  c.push(numItem("toc-list", [{ t: "Contact. ", b: true }, { t: "Legal contact email and postal address for notices." }]));

  // ── 7.2 Privacy Policy ──
  c.push(h2("7.2 D2 — Privacy Policy (Writing Brief)"));
  c.push(p([
    { t: "Audience and tone: ", b: true },
    { t: "same readership as D1; clear and complete; 1,200-2,000 words. The policy must accurately describe the data the product actually collects (as inventoried in Part 4) and the actual sharing model: data flows to Recipients only when the Candidate shares. Jurisdiction-dependent frameworks (GDPR, UK GDPR, US state privacy laws) depend on the owner's answer in Part 9 — write the substantive sections now and mark the rights section with the jurisdiction placeholder." },
  ]));
  c.push(p("Required sections, in order:"));
  c.push(numItem("pp-list", [{ t: "Introduction and who we are ", b: true }, { t: "— operator identity (same as D1), scope of the policy, contact for privacy matters [privacy contact email]." }]));
  c.push(numItem("pp-list", [{ t: "Data we collect ", b: true }, { t: "— account data (name, email, phone); location data (city, state, ZIP); professional data (profession, discipline, specialty, years of experience overall and in specialty); assessment data (skill ratings 1-4, per-skill recency, N/A notes, additional question answers, free text); signature (drawn, typed, or uploaded image); attestation and consent records with timestamps; technical data (IP address, device/browser, usage events) kept for security and audit." }]));
  c.push(numItem("pp-list", [{ t: "How we use data ", b: true }, { t: "— provide the Service (accounts, checklists, reports, PDFs); enable candidate-directed sharing; send transactional email (verification, confirmations, share-viewed notices, resets); maintain security, prevent abuse, keep audit records; improve the Service with aggregated statistics. State the legal bases where a jurisdiction requires them [confirm jurisdiction]." }]));
  c.push(numItem("pp-list", [{ t: "Who we share data with ", b: true }, { t: "— Recipients the Candidate authorizes (the core sharing model, including link access windows); service providers acting on our behalf: hosting [Vercel], database [Supabase], email delivery [email provider], payment/credit processing [if applicable]; professional advisers or authorities where law requires; no sale of personal data; no advertising use of assessment content." }]));
  c.push(numItem("pp-list", [{ t: "International transfers ", b: true }, { t: "— hosting may process data outside the user's country; safeguards applied [confirm regions]." }]));
  c.push(numItem("pp-list", [{ t: "Retention ", b: true }, { t: "— account and report data retained while the account is active; expired reports (30-day validity) remain viewable to the Candidate unless deleted; deletion or account-close requests honored per [retention schedule / jurisdiction]; audit records kept for security periods." }]));
  c.push(numItem("pp-list", [{ t: "Your rights ", b: true }, { t: "— access, correction, deletion, portability, objection/withdrawal of consent, complaint route; how to exercise them (contact email); jurisdiction-specific annex [add per answer to Part 9]." }]));
  c.push(numItem("pp-list", [{ t: "Security ", b: true }, { t: "— encryption in transit, access controls, least-privilege administration, incident response; note that no system is perfectly secure." }]));
  c.push(numItem("pp-list", [{ t: "Children ", b: true }, { t: "— the Service is not for anyone under 18." }]));
  c.push(numItem("pp-list", [{ t: "Cookies ", b: true }, { t: "— describe only what the platform actually uses (essential session and authentication cookies; analytics only if deployed) [confirm analytics]." }]));
  c.push(numItem("pp-list", [{ t: "Changes and contact ", b: true }, { t: "— how changes are announced; privacy contact details." }]));

  // ── 7.3 Landing page copy ──
  c.push(h2("7.3 D3 — Landing Page Copy (Writing Brief)"));
  c.push(p("The current homepage still contains banned claims from the old verification narrative and will be fully rewritten from this brief. Write each section separately so the developer can place them; keep sentences short and concrete; write for a nurse scrolling on a phone between shifts. Total 500-800 words."));
  c.push(...tbl("Table 3 — Landing page sections", ["Section", "What it must say", "Length"], [
    ["Hero", "Headline + one sub-line stating what it is: a 5-10 minute self-assessment skills checklist for healthcare professionals, 190+ disciplines, a clear report you control. CTA: \"Start my skills checklist\". No verification claims.", "20-35 words headline + 25-40 words sub-line"],
    ["How it works", "Three steps matching Part 4: pick your discipline and specialty; rate your skills and recency; sign and get your report. One sentence each.", "3 x 20-30 words"],
    ["What's in the report", "Describe the actual report per Part 5: color-coded ratings, recency, extra answers, signature, 30-day validity, PDF + link. Say plainly it is labeled self-assessment.", "60-90 words"],
    ["Coverage", "190+ disciplines across Nursing, Allied Health, Pharmacy, and Locums; examples across professions.", "40-60 words"],
    ["You control sharing", "Share links with expiry presets or a PDF, only to recruiters/employers you choose; links expire automatically.", "40-60 words"],
    ["Honesty block", "A short, proud statement that reports are self-reported and clearly labeled — and why that makes hiring conversations faster and fairer.", "40-60 words"],
    ["Closing CTA", "Restate the 5-10 minute promise and the 30-day refresh cycle; CTA button text.", "20-30 words"],
  ], [18, 62, 20]));

  // ── 7.4 FAQ ──
  c.push(h2("7.4 D4 — FAQ (Writing Brief)"));
  c.push(p("Write 12-16 questions and answers in the site voice; each answer 40-80 words. The FAQ must preempt the questions candidates actually ask and quietly correct the old verification narrative. Suggested questions (the writer may adjust):"));
  c.push(li("What is VaultVerify? — define per Part 2, self-assessment framing."));
  c.push(li("How long does the checklist take? — 5-10 minutes, one sitting, save-and-resume via account."));
  c.push(li("What professions and disciplines are covered? — 190+ disciplines, four profession groups, specialty-specific checklists."));
  c.push(li("What do the ratings mean? — explain the 1-4 scale and recency, including N/A."));
  c.push(li("Is this verified by anyone? — the honest answer: it is a self-assessment, clearly labeled; VaultVerify confirms completion, not accuracy; recipients may do their own checks."));
  c.push(li("Who can see my report? — only people you share it with; link expiry presets; PDF stays yours."));
  c.push(li("How long is my report valid? — 30 days; retake to refresh; why refresh keeps snapshots honest."));
  c.push(li("What does it cost? — [confirm pricing with owner; write placeholder answer]."));
  c.push(li("Can I share it with more than one recruiter? — yes, as many as you choose, each with its own access window."));
  c.push(li("What if I make a mistake? — retake the checklist; the newest completed version is what you share."));
  c.push(li("Do recruiters need an account? — they can read a share link or PDF; a recruiter portal exists for managing received checklists."));
  c.push(li("Is my data safe? — summary of Part 7.2 security and privacy commitments, link to Privacy Policy."));
  c.push(li("Does VaultVerify find me a job? — no; it is a tool for proving skills snapshots; it does not place, employ, or license."));

  // ── 7.5 Micro-copy pack ──
  c.push(h2("7.5 D5 — Micro-Copy Pack (Exact UI Strings)"));
  c.push(p("These strings go into the interface verbatim. The first replaces an outdated consent sentence that currently reads \"I agree that VaultVerify may share this self-assessment with the recruiters and employers I authorize, and that it may be verified against my references.\" Per the owner's decision, that sentence is removed from the submit screen and its substance moves into the Terms of Use (clause 6 in Part 7.1). The submit screen shows exactly one checkbox:"));
  c.push(...copyBlock("I agree to the Privacy Policy and Terms of Use.", "CONSENT CHECKBOX (at checklist submission — \"Privacy Policy\" and \"Terms of Use\" are links to /privacy and /terms)"));
  c.push(p("The accuracy attestation remains as the candidate's own declaration, immediately above the signature:"));
  c.push(...copyBlock("I confirm that the ratings above are my own and reflect my real experience. I understand that inaccurate information may affect my eligibility for placement.", "ATTESTATION (kept as-is)"));
  c.push(p("Write the following short strings fresh, in the site voice (all facts per Table 1):"));
  c.push(li("Report disclaimer (footer of every report page and PDF): a 2-3 sentence paragraph stating the report is a self-assessment completed and signed by the named candidate; VaultVerify provides the assessment tool and does not independently verify the answers; recipients should verify credentials and conduct their own due diligence; report valid for 30 days from the completion date shown."));
  c.push(li("Validity badge: e.g., \"Valid for 30 days from {completion date}\" and an expired state \"Expired on {date} — retake to refresh\"."));
  c.push(li("Share dialog helper text: explaining link presets (one-time view, 1 day, 1 week, 14 days, or custom) in one sentence, plus a reminder that the report is labeled self-assessment."));
  c.push(li("Submission success message: what just happened, what the report contains, and that nothing has been shared yet."));
  c.push(li("Empty-state texts for the dashboard (no checklists yet; no shared links yet), each with a one-line next action."));

  // ── 7.6 Email snippets ──
  c.push(h2("7.6 D6 — Transactional Email Snippets"));
  c.push(p("Four short templates, each 2-4 sentences plus a subject line, in the site voice: (1) email verification — verify the address to activate the account; (2) checklist submitted — confirmation, what the report contains, validity for 30 days, and that nothing is shared until the candidate shares it; (3) report viewed — a recipient opened the candidate's share link, with the link name or recipient label if available; (4) password reset. No marketing language in transactional mail; include the operator name [Legal entity name] and a contact line."));

  // ── 7.7 Recruiter one-pager ──
  c.push(h2("7.7 D7 — Recruiter One-Pager (Optional but Recommended)"));
  c.push(p("A 250-400 word piece aimed at recruiters and staffing agencies explaining what a VaultVerify report gives them: a consistent, scannable, self-reported skills snapshot with recency and a completion date, signed by the candidate, valid for 30 days. It must state clearly that the report is candidate-declared and that recipients should run their own verification steps for anything critical — this honesty is positioned as a feature that saves screening time. Close with what a recruiter should look at first (specialty header, experience, 3s and 4s with recent recency, the additional answers)."));

  // ── 8. Voice rules ──
  c.push(h1("8. Voice, Tone, and Vocabulary Rules"));
  c.push(h2("8.1 Voice"));
  c.push(p("Write in plain, warm, professional English at roughly an eighth-grade reading level — the reader may be an experienced ICU nurse on a break or a staffing coordinator skimming between calls. Short sentences. Concrete nouns and verbs. Confident but never boastful; honest about what the product does not do, because that honesty is part of the brand. Numbers are written consistently: \"190+ disciplines\", \"5-10 minutes\", \"30 days\", \"4-level rating\". British or American spelling: [confirm — product currently uses American English]."));
  c.push(h2("8.2 Banned vs. approved vocabulary"));
  c.push(...tbl("Table 4 — Vocabulary control", ["Never write (banned)", "Write instead (approved)"], [
    ["reference check, referee, referee answers", "self-assessment, skills checklist"],
    ["manager-verified, two-party flow, employer sign-off", "self-reported (clearly labeled)"],
    ["verified in 48 hours, verification flow, we verify your skills", "complete in 5-10 minutes, instant report"],
    ["fraud radar, fraud detection, anomaly detection", "(no replacement — do not raise the topic)"],
    ["10 disciplines", "190+ disciplines"],
    ["valid for 365 days / valid for a year", "valid for 30 days"],
    ["verified against my references", "(removed from UI; substance lives in Terms of Use clause on sharing)"],
    ["guaranteed placement, boost your hiring chances", "share a clear skills snapshot with the recruiters you choose"],
  ], [46, 54]));
  c.push(p("If a drafted sentence needs any banned term to make sense, the sentence is describing the wrong product — rewrite the sentence around the candidate's self-assessment and controlled sharing instead.", { after: 200 }));

  return c;
}

module.exports = { part2 };
