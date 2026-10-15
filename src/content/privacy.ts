// Privacy Policy content for VaultVerify — rendered on /privacy via LegalShell.

import type { LegalDoc } from "./terms";

export const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  updated: "October 4, 2026",
  intro: [
    "VaultVerify (\"we\", \"the Service\") handles personal data for three kinds of people: candidates (clinicians building verified references and skills reports), recruiters (agency or employer staff), and referees (professionals who respond to a reference request). This policy explains what we collect, why, who can see it, how long we keep it, and the rights you have.",
  ],
  sections: [
    {
      h: "1. Who we are",
      p: [
        "The Service is operated by the VaultVerify team (Zipvault). For any privacy question, request or complaint, contact myzipvault@gmail.com. This policy covers vaultverify.vercel.app and the emails the Service sends from its own address.",
      ],
    },
    {
      h: "2. The data we process",
      p: [
        "Account data: name, email address, role, a securely hashed password (we never store passwords in readable form), account status, and security metadata such as failed-login counters and active sessions.",
        "Candidate verification data: profile details (specialty, job title), self-rated skills and recency entries, checklist completions, and the signed consent you give before references are collected.",
        "Reference data: the referee's name and work contact, their ratings, anchored answers and remarks, their typed signature, and the verification status of every item. This content is attributed to the referee and shown to the candidate and, when the candidate shares it, to the recipient agency.",
        "Technical and integrity data: IP address and browser/device characteristics, timestamps of form opens and submissions, and the output of automatic fraud checks (for example duplicate-IP or rapid-completion flags). We also keep notification logs (what email was sent, to whom, when, and whether it was delivered) and an internal audit trail of significant actions.",
      ],
    },
    {
      h: "3. Why we process data",
      p: [
        "To deliver the Service: creating accounts, verifying email addresses, rendering checklists and reference forms, generating PDF reports, and serving the dashboards — this is performance of our contract with you or the agency you interact with.",
        "To keep the platform trustworthy: fraud detection, rate limiting, session security and audit logging are carried out in our legitimate interest in protecting candidates, referees and agencies from manipulation and abuse.",
        "To communicate: transactional email (invitations, verification codes, reminders, security notices) is sent because it is necessary to the flow you or your candidate started. We do not send marketing email or sell data to anyone.",
      ],
    },
    {
      h: "4. Who can see what",
      p: [
        "Candidates see their own profile, checklists, requests and reports. Referees see only the single request addressed to them. Recruiters see verification material for candidates in their pipeline — material a candidate either generated as part of their application or explicitly shared via a secure link.",
        "Candidates control sharing: a completed report leaves the platform only when the candidate shares it (directly with an agency, or via a share link the candidate creates). Share links can be one-time or time-limited, show view counts, and can be revoked instantly, which cuts off access immediately.",
      ],
    },
    {
      h: "5. Service providers",
      p: [
        "We run on a small set of established processors: Vercel (application hosting), Supabase (managed Postgres database), and Brevo (transactional email delivery). These providers process data only to deliver their service to us, under their own security terms. No advertising networks or data brokers receive data from VaultVerify.",
      ],
    },
    {
      h: "6. International transfers",
      p: [
        "Our providers may process data in countries other than your own. Where that happens we rely on the providers' certified safeguards (such as standard contractual clauses) and keep the footprint as small as the Service allows.",
      ],
    },
    {
      h: "7. Retention",
      p: [
        "Account data is kept while your account is active. Verification records — consents, references, signatures, reports and the audit trail behind them — are kept for as long as the resulting reports remain valid (currently 30 days) and afterwards only where law, dispute resolution or the integrity of already-shared reports requires it.",
        "You can request deletion of your account and personal data at any time; where a record cannot be deleted because of those integrity or legal requirements, we will tell you what is being kept and why.",
      ],
    },
    {
      h: "8. Security",
      p: [
        "We protect the Service with encrypted transport (TLS), hashed passwords, email-verified identities, session management with remote sign-out, single-use expiring tokens for every referee and share link, automated fraud checks, and a least-privilege internal access model. No system is perfectly secure; if a breach affects your data, we will notify you and the relevant authorities as required by law.",
      ],
    },
    {
      h: "9. Your rights",
      p: [
        "Subject to your local law, you can ask us for a copy of your data, correction of inaccurate data, deletion where retention rules allow, restriction or objection to specific processing, and a portable export. Candidates can also exercise direct control in-product: edit profile details, revoke share links, and withdraw consent for reference collection going forward.",
        "To exercise any right, email myzipvault@gmail.com from the address on your account. We respond within a reasonable period and never charge a fee for a first, reasonable request.",
      ],
    },
    {
      h: "10. Children",
      p: [
        "VaultVerify is for working professionals and is not directed at anyone under 18. We do not knowingly collect data from children; if we learn that we have, we will delete it.",
      ],
    },
    {
      h: "11. Changes to this policy",
      p: [
        "We publish the current policy on this page with its last-updated date and will flag significant changes in the Service. Continued use after a change means you accept the updated policy.",
      ],
    },
    {
      h: "12. Contact",
      p: ["Privacy questions and requests: myzipvault@gmail.com."],
    },
  ],
};
