// Terms & Conditions content for VaultVerify — rendered on /terms via LegalShell.
// Keep the wording plain, specific to the product, and free of marketing spin.

export interface LegalSection {
  h: string;
  p: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string[];
  sections: LegalSection[];
}

export const TERMS: LegalDoc = {
  title: "Terms & Conditions",
  updated: "October 4, 2026",
  intro: [
    "These Terms & Conditions (\"Terms\") govern your access to and use of VaultVerify — the reference and skills verification platform for healthcare recruiting — at vaultverify.vercel.app (the \"Service\"). By creating an account, completing a checklist or reference, or otherwise using the Service, you agree to these Terms. If you do not agree, do not use the Service.",
  ],
  sections: [
    {
      h: "1. What VaultVerify is",
      p: [
        "VaultVerify is a software platform that helps healthcare recruiters, staffing agencies, candidates and professional referees run structured verification: candidates build a profile and complete skills checklists, request references from people who have supervised their work, referees respond through secure single-use links, and completed results are packaged as branded PDF reports and shareable verified links.",
        "VaultVerify provides the workflow, the record-keeping and the integrity tooling. It is not a background-check consumer reporting agency, it does not verify professional licences, and it does not endorse any candidate, agency or referee. The meaning of \"verified\" on the platform is defined in section 7.",
      ],
    },
    {
      h: "2. Accounts and eligibility",
      p: [
        "You must be at least 18 years old to hold an account. Accounts exist for two roles: candidates (clinicians building verified references and skills reports) and recruiters (agency or employer staff collecting and reviewing them). Referees do not need an account — they respond through personal single-use links sent to them.",
        "You agree to provide accurate registration information, to keep your password confidential, to use a strong unique password, and to notify us immediately at the contact below if you believe your account has been compromised. We may suspend or remove accounts that violate these Terms.",
      ],
    },
    {
      h: "3. Candidate responsibilities",
      p: [
        "As a candidate you agree that the profile information, self-rated skills and recency details you provide are truthful and your own, and that the referees you nominate are people who have genuinely supervised or worked alongside you and are able to give an informed opinion.",
        "You must not nominate yourself as a referee, collude with referees on answers, use disposable or misleading contact details, or attempt to complete a reference on a referee's behalf. Attempted manipulation may be flagged by the platform's fraud engine, may void affected reports, and may result in account suspension.",
      ],
    },
    {
      h: "4. Agency and recruiter responsibilities",
      p: [
        "Recruiters and agencies use VaultVerify to collect and review verification material. You agree to use it only for lawful hiring and workforce purposes, to respect the employment and privacy rights of candidates, and to make hiring decisions in compliance with the laws that apply to you — including, where applicable, fair-hiring, background-check and consumer-reporting rules in your jurisdiction.",
        "Agencies are responsible for the actions of their team members' accounts, for the accuracy of the invitations they send, and for the credits consumed by the requests they trigger. VaultVerify may adjust or credit accounts for operational issues at its discretion.",
      ],
    },
    {
      h: "5. Referee responsibilities",
      p: [
        "Referees respond to a specific request from a candidate they have supervised. By submitting a response you confirm that the answers, ratings and remarks are your own honest professional opinion, that you are who the request says you are, and that you have the capacity to give the reference.",
        "Referee responses are given voluntarily. Where the platform shows you a candidate's signed consent before you respond, that consent is the candidate's attestation that they agree to your reference being collected and shared in the ways the platform describes.",
      ],
    },
    {
      h: "6. Consent and electronic signatures",
      p: [
        "Before a reference request reaches a referee, the candidate must complete the platform's consent step, including a typed signature. Typed signatures and click-to-accept actions on VaultVerify are the legal equivalent of handwritten signatures, and every consent event is timestamped and stored against the record.",
        "You may withdraw consent where the platform allows it; withdrawal stops future processing but does not retroactively undo reports already generated or already shared with an agency.",
      ],
    },
    {
      h: "7. Verification scope — what \"verified\" means",
      p: [
        "A skill or statement on VaultVerify is marked \"Manager-verified\" only when a referee — through a single-use link tied to that candidate — has confirmed it in their own response. Everything a candidate enters without such confirmation stays marked \"Self-reported\". This distinction is applied mechanically and is preserved in every report and export.",
        "VaultVerify verifies the integrity of the process, not the underlying truth. We do not independently investigate referees, we do not contact employers outside the platform, and we do not certify competence. Completed reports are valid for the period shown on them (currently 30 days from completion) and carry their verification status with them.",
      ],
    },
    {
      h: "8. Credits, plans and billing",
      p: [
        "Agency actions such as reference requests and checklist invitations consume credits as described in the recruiter dashboard. Credit balances, ledgers and adjustments are visible in your account. We may change credit pricing or introduce paid plans with reasonable notice; changes apply to new consumption, not retroactively.",
        "Pilot and promotional credits have no cash value and may expire as communicated in the dashboard.",
      ],
    },
    {
      h: "9. Acceptable use",
      p: [
        "You must not probe, scan or test the vulnerability of the Service, circumvent authentication or access controls, scrape or harvest data at scale, reverse-engineer non-public parts of the platform, interfere with other tenants, or use the Service to harass, defraud or unlawfully discriminate against any person.",
        "Share links issued by the platform are personal and single-use or time-limited as labelled. You must not publish private verification reports, referee identities or consent records in public forums.",
      ],
    },
    {
      h: "10. Availability, changes and maintenance",
      p: [
        "We work to keep the Service available and may perform maintenance, deploy updates, or temporarily suspend parts of the Service — for example during a maintenance window or to contain a security incident. Features may change as the product evolves; material reductions to paid functionality will be communicated in advance where practicable.",
      ],
    },
    {
      h: "11. Suspension and termination",
      p: [
        "You may close your account at any time from your settings or by contacting us. We may suspend or terminate accounts that breach these Terms, that create legal or security risk, or that remain inactive for a prolonged period, with notice where appropriate.",
        "On termination, live share links are revoked and dashboards stop being served. Records that law or the integrity of previously issued reports require us to keep (for example consent logs and audit events) are retained per our Privacy Policy.",
      ],
    },
    {
      h: "12. Intellectual property",
      p: [
        "The Service, its software, brand assets, templates and content are owned by VaultVerify's operator or its licensors and are protected by intellectual-property law. You keep ownership of the content you submit (profiles, responses, remarks) and grant us the limited licence needed to store, render, package and share it as you direct through the platform.",
      ],
    },
    {
      h: "13. Disclaimers",
      p: [
        "The Service is provided \"as is\" and \"as available\" without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose and non-infringement. We do not warrant that the Service will be uninterrupted or error-free, that fraud detection will catch every case, or that any referee's statements are accurate.",
      ],
    },
    {
      h: "14. Limitation of liability",
      p: [
        "To the maximum extent permitted by law, VaultVerify's operator and its team will not be liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, data or hiring outcomes, arising from your use of the Service. Our total aggregate liability for any claim relating to the Service is limited to the amount you paid us, if anything, in the twelve months before the claim arose.",
      ],
    },
    {
      h: "15. Indemnity",
      p: [
        "You agree to indemnify and hold harmless VaultVerify's operator from claims, damages and expenses arising from your breach of these Terms, your unlawful use of the Service, or content you submit that infringes the rights of others.",
      ],
    },
    {
      h: "16. Governing law and disputes",
      p: [
        "These Terms are governed by the laws of India, without regard to conflict-of-law rules, and the competent courts of India have exclusive jurisdiction over any dispute arising from them. Before filing, we ask you to contact us so we can try to resolve the issue directly — most problems are solved that way.",
      ],
    },
    {
      h: "17. Changes to these Terms",
      p: [
        "We may update these Terms as the product or the law changes. The current version is always published on this page with its last-updated date, and significant changes will be highlighted in the Service. Continuing to use the Service after a change means you accept the updated Terms.",
      ],
    },
    {
      h: "18. Contact",
      p: ["Questions about these Terms: myzipvault@gmail.com."],
    },
  ],
};
