// VaultVerify Product & Content Brief — content part 3 (sections 9-10)
const { h1, h2, p, li, tbl } = require("./vv-brief-lib");

function part3() {
  const c = [];

  // ── 9. Open questions ──
  c.push(h1("9. Information Still Needed From the Owner"));
  c.push(p("The writer must not invent any of the following. Each row gives the question, why it matters, and the placeholder to replace once answered. Until an answer exists, keep the 【placeholder】 visible in drafts so nothing false ships."));
  c.push(...tbl("Table 5 — Open questions and placeholders", ["Question", "Why it matters", "Placeholder used"], [
    ["Legal entity name, registered address, and country of operation", "Required in both legal documents; changes consumer-protection framing", "【Legal entity name】 / 【Registered address】"],
    ["Governing law and dispute venue", "Governing-law clause and the rights framework in the Privacy Policy (GDPR, UK GDPR, US state laws, or other)", "【Governing law jurisdiction】"],
    ["Contact emails for support, legal, and privacy", "Notice and complaint routes in both documents", "【Support/legal email】"],
    ["Pricing / credit model for recruiters (if any)", "Terms clause on fees; FAQ cost answer", "【Pricing/credit model】"],
    ["Exact service providers to name (hosting, database, email, payments)", "Privacy Policy processor list accuracy", "【Processor list】 — currently assumed: hosting 【Vercel】, database 【Supabase】, email 【email provider】"],
    ["Data retention period after account closure or report expiry", "Retention section of the Privacy Policy", "【Retention schedule】"],
    ["Analytics actually deployed?", "Determines whether a cookies/analytics section is needed", "【Analytics: yes/no】"],
    ["American or British English, and preferred date format", "Consistency across every deliverable", "【Spelling convention】"],
    ["Effective date for the legal documents", "Both documents open with one", "【Effective date】"],
    ["Brand voice adjectives the owner wants emphasized (e.g., calm, precise, friendly)", "Fine-tunes tone across D3-D6", "【Voice adjectives】"],
  ], [34, 40, 26]));

  // ── 10. Instructions for ChatGPT ──
  c.push(h1("10. How to Run the Writing Session (Instructions for ChatGPT)"));
  c.push(p("When this brief is given to an AI writer, start with the following ground rules, which should be pasted alongside Parts 2 to 9:"));
  c.push(li("First, read Part 9 and ask the owner the open questions in one batch before drafting the legal documents; for site copy, proceed with placeholders."));
  c.push(li("Produce one deliverable at a time, in the order D1 to D7, and wait for approval before moving on."));
  c.push(li("Treat Table 1 as the only source of product facts; never introduce a number, percentage, or timeframe that is not in this brief."));
  c.push(li("Obey the banned-vocabulary table (Table 4) absolutely; if asked to include a banned claim, refuse and offer the approved alternative."));
  c.push(li("Write legal documents (D1, D2) as complete, operative text — not summaries or templates with advice notes — with placeholders only for the Part 9 items."));
  c.push(li("Keep UI strings (D5) within one sentence each where possible; they must read naturally at mobile width."));
  c.push(li("Match the reading level and voice in Part 8 in every deliverable, including emails."));
  c.push(li("Output format: Markdown, with headings mirroring the section structure given in each brief, ready to paste into the site's content files."));
  c.push(p("With Parts 2, 3, and 7 alone, a writer can draft everything except the jurisdiction-dependent clauses; with Part 9 answered, every deliverable can be finalized. The end state is a site whose every word matches what the product actually does: a 5-10 minute self-assessment, 190+ disciplines, a 30-day report, and sharing that stays entirely in the candidate's hands.", { after: 200 }));

  return c;
}

module.exports = { part3 };
