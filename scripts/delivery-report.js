/* VaultVerify — Final Delivery Report (Phase D/D4b/E/F)
 * English formal report · docx-js · R1 cover recipe · 3-section page numbering
 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, SectionType, TableOfContents,
  PageBreak, TableLayoutType,
} = require("docx");
const fs = require("fs");

// ── Palette (tech/security navy) ─────────────────────────────────────
const PAL = {
  bg: "0E2233", titleColor: "FFFFFF", subtitleColor: "C7D6E2",
  metaColor: "A9BFCF", accent: "3E9BC8", footerColor: "8AA3B5",
  primary: "0F2A43", body: "000000", secondary: "44566B",
  tableHead: "EAF2F8", tableLine: "C9D6E2",
};

const EN = { ascii: "Times New Roman", eastAsia: "SimSun" };
const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
};
const allNoBorders = { ...noBorders,
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
};

function safeText(v, ph) {
  if (v === undefined || v === null || v === "" || String(v) === "NaN" || String(v) === "undefined") return ph || "N/A";
  return String(v);
}

// ── Cover layout calculators (design-system.md, English width factor) ─
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."-_/ \t,&"]);
  const lines = []; let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop(); lines[lines.length - 1] += " " + last;
  }
  return lines;
}
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 20 * 0.55; // English glyphs ~0.55 CJK width
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}
function calcCoverSpacing(p) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = p;
  const SAFETY = 1200;
  const usable = pageHeight - marginTop - marginBottom - SAFETY;
  const titleH = titleLineCount * (titlePt * 23 + 200);
  const subH = hasSubtitle ? (12 * 23 + 600) : 0;
  const enH = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaH = metaLineCount * (10 * 23 + 100);
  const implicit = 3 * 300;
  const remaining = Math.max(usable - (titleH + subH + enH + metaH + fixedHeight + implicit), 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(remaining * 0.45), rawBottom = Math.floor(remaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(remaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ── Recipe R1: Pure Paragraph Cover (left-aligned) ───────────────────
function buildCoverR1(config) {
  const P = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: P.accent, font: { ascii: "Arial", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.subtitleColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200, right: padR }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: safeText(line), size: 24, color: P.metaColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: safeText(config.footerLeft, ""), size: 16, color: P.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: safeText(config.footerRight, ""), size: 16, color: P.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders, children })],
    })],
  })];
}

// ── Body builders (Profile A, English) ───────────────────────────────
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: PAL.primary, font: EN })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: PAL.primary, font: EN })],
  });
}
function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 140, line: 312 },
    children: [new TextRun({ text, size: 24, color: PAL.body, font: EN, italics: !!opts.italics })],
  });
}
function bodyRuns(runs) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 140, line: 312 },
    children: runs.map((r) => new TextRun({ size: 24, color: PAL.body, font: EN, ...r })),
  });
}
function cell(text, { head = false, width = 25, bold = false } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    shading: head ? { type: ShadingType.CLEAR, fill: PAL.tableHead } : undefined,
    children: [new Paragraph({
      spacing: { line: 276 },
      children: [new TextRun({ text: safeText(text), size: 21, bold: head || bold, color: PAL.body, font: EN })],
    })],
  });
}
function dataTable(caption, headers, widths, rows) {
  return [
    new Paragraph({
      keepNext: true, spacing: { before: 200, after: 80, line: 312 },
      children: [new TextRun({ text: caption, bold: true, size: 21, color: PAL.secondary, font: EN })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 2, color: PAL.tableLine },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: PAL.tableLine },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "DDE6EE" },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((t, i) => cell(t, { head: true, width: widths[i] })) }),
        ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, { width: widths[i] })) })),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}
function pageNumFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "666666", font: EN })],
    })],
  });
}
const docHeader = new Header({
  children: [new Paragraph({
    alignment: AlignmentType.RIGHT,
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: PAL.tableLine, space: 4 } },
    children: [new TextRun({ text: "VaultVerify — Security & Platform Hardening Delivery Report", size: 16, color: "888888", font: EN })],
  })],
});

// ══ BODY CONTENT ══════════════════════════════════════════════════════
const bodyChildren = [];

bodyChildren.push(h1("1. Overview"));
bodyChildren.push(body("This report closes out the current hardening cycle for VaultVerify, the healthcare skills-checklist self-assessment platform, and records exactly what changed, what was verified, and which steps remain gated on owner action. The cycle covered the owner-approved D4 token-security decision (Option A, hash and show once), the D4b follow-up decision (Option C, encrypt at rest for reference-request tokens), and the Phase E and F workstreams (unified identity and cross-role security assurance). Throughout the cycle, the standing delivery rules were honored: nothing was pushed beyond explicitly approved commits, no secret was exposed in chat, and no production data operation was run without a guard."));
bodyChildren.push(body("Delivery state at the time of writing: one commit was pushed to the public repository with owner approval; three further commits are complete, verified, and held locally awaiting the owner's go-ahead. The regression suite stands at 148 passing tests across 14 files, TypeScript compiles with zero errors, the production-parity build succeeds, and automated secret scans of every diff came back clean. The remaining work is operational rather than developmental: configure one encryption key in Vercel, approve the pending pushes, and run two guarded, additive migrations against the hosted database."));
bodyChildren.push(...dataTable("Table 1 — Commits produced in this cycle", ["Commit", "Title", "Status"], [16, 54, 30], [
  ["b05b895", "D4 Option A: share/invite link tokens hashed at rest, shown once", "Pushed (owner-approved)"],
  ["bb263e5", "D4b Option C: reference-request tokens encrypted at rest", "Local — push gated"],
  ["1f138ec", "Phase E1: unified identity (one login, workflow profiles)", "Local — push gated"],
  ["(local)", "Phase F1: cross-role security matrix tests", "Local — push gated"],
]));

bodyChildren.push(h1("2. Objectives and Scope"));
bodyChildren.push(body("The cycle pursued three objectives that the owner approved in sequence. First, complete D4 so that share and invitation capability tokens are never recoverable from the database: the approved design stores only a SHA-256 digest of each token and delivers the raw value exactly once at creation. Second, implement D4b under the owner-selected Option C so that referee-form bearer tokens are never stored in plaintext either, while explicitly preserving the referee reminder workflow that must keep re-sending existing links; this required authenticated server-side encryption, a securely configured key, and a safe migration path for existing plaintext rows. Third, advance the product roadmap through Phase E and F: one shared login with separate workflow profiles, completion of the cross-role security test matrix, and this delivery report."));
bodyChildren.push(body("Scope discipline was maintained deliberately. Items discovered mid-flight were either fixed when squarely inside the approved mandate (a revocation gap in the referee-link lifecycle, exposed by the new revocation tests) or recorded for the owner rather than implemented (larger user-interface packs from the UX plan that would expand the change surface beyond this cycle's mandate). No history rewrite, force-push, production data query, or secret disclosure occurred at any point."));

bodyChildren.push(h1("3. Workstream Results"));
bodyChildren.push(h2("3.1 D4 — Share and invitation tokens hashed at rest (pushed)"));
bodyChildren.push(body("Commit b05b895 stores the SHA-256 hex digest of every checklist share link, reference share link, and recruiter invitation token in the existing unique token column, so a database leak no longer yields usable links. The raw token is returned exactly once in the creation response and delivered by email where applicable; ledger surfaces no longer re-display bearer links for hashed rows, and legacy rows keep working through digest-first lookups with a raw-value fallback that lazily upgrades each row on first resolve inside the same atomic one-time consumption update. The commit required no schema change, so the deployment carried no production database risk. It was pushed with owner approval and Vercel redeployed automatically."));
bodyChildren.push(h2("3.2 D4b — Reference-request tokens encrypted at rest (implemented, gated)"));
bodyChildren.push(body("Commit bb263e5 implements the owner's Option C decision for the fourth and last bearer-token family: the referee-form links that reminders must keep re-sending. Each row now stores two complementary safe forms — the SHA-256 digest as the lookup key, and an authenticated AES-256-GCM envelope of the raw token as the resend source — so validation never needs the key, while reminders, nudges, and the candidate dashboard rebuild the existing link by decryption. The envelope format is version-stamped and self-describing (version, initialization vector, authentication tag, ciphertext), with the version and record context bound into the authentication data; a rotation window is supported through an optional previous-key environment variable, and the runbook in DEPLOY.md section 7 covers setup, key-loss recovery, and zero-downtime rotation."));
bodyChildren.push(body("Verification for D4b was end-to-end and surfaced one genuine product defect: the callback verification code was derived from the stored token, which would have silently broken referee identity verification after migration; the fix derives it from the decrypted raw token, and a test proves the code is identical before and after migration. The reminder sweep and the candidate nudge never send a link that could not be rebuilt — under a key outage they skip affected requests and report a skipped count instead. The local migration script is idempotent and resumable, refuses non-local databases unless an explicit production flag is passed, and prints counts only. Deployment is intentionally gated: the encryption key must be configured in Vercel first, per the owner's instruction."));
bodyChildren.push(h2("3.3 Phase E — Unified identity: one login, separate workflow profiles"));
bodyChildren.push(body("Commit 1f138ec delivers the unified-identity decision: a single account now drives both product workflows, with the references profile structurally owned by the account rather than matched by email coincidence. The change is additive and nullable in both schema twins — an account link column on the references profile plus the inverse relation — and every profile lookup resolves by the account link first, with an exact-email fallback restricted to unlinked legacy rows. Onboarding stamps the link automatically when the user is signed in, which is the normal portal path, and a guarded backfill script links pre-existing rows by exact lowercased email, idempotently and clash-safely. Tests prove the link is authoritative even when a profile's own email no longer matches, that the share ledgers resolve through it, and that another account gains nothing: no profile, no foreign data, no foreign actions."));
bodyChildren.push(h2("3.4 Phase F — Cross-role security matrix"));
bodyChildren.push(body("The final workstream added six boundary tests spanning candidate, recruiter, referee, and administrator roles on the surfaces touched this cycle. Revoking a share immediately ends recruiter dashboard visibility. One candidate can neither see nor revoke another's share links. A consumed one-time link is dead for every recruiter, not merely the one who consumed it. A referee token exposes exactly one candidate's context, and fabricated tokens resolve nothing. The reminder sweep is binding-scoped: a request shared with recruiter A produces zero reminder emails when recruiter B runs the sweep. Superadmin control actions reject unauthenticated callers. Alongside the revocation fix noted in section 3.2, this closes the security-assurance objective for the cycle."));

bodyChildren.push(h1("4. Verification Summary"));
bodyChildren.push(body("Every commit passed the full gate set before it was allowed to exist: the complete regression suite, a zero-error TypeScript check, an automated secret scan of the diff, and — for schema-bearing commits — a production-parity build that compiles the hosted database client exactly as Vercel will. After any hosted-schema build, the local client was regenerated back to the development database engine, following the documented procedure."));
bodyChildren.push(...dataTable("Table 2 — Quality gates at delivery", ["Gate", "Result", "Evidence"], [34, 22, 44], [
  ["Regression suite (vitest)", "148 / 148 pass", "14 files; +36 tests this cycle (14 D4, 15 D4b, 5 Phase E, 6 Phase F minus 0 removed)"],
  ["TypeScript (tsc --noEmit)", "0 errors", "Maintained from 32 baseline through every commit"],
  ["Secret scan of diffs", "Clean", "Credential-pattern grep on every staged diff"],
  ["Production-parity build", "Success", "Hosted-schema client generation + Next.js build"],
  ["Schema twin parity", "Verified", "Both schema files differ only by provider line"],
  ["Migration safety", "Additive only", "Nullable columns; guarded scripts refuse non-local targets"],
]));

bodyChildren.push(h1("5. Deployment Status and Owner Actions"));
bodyChildren.push(body("The deployed production state currently reflects the pushed work through D4. Three commits sit ready in the local repository. The pending production steps are deliberately sequenced so that no deploy ever runs against a database lacking the resources the code expects, and no irreversible action is taken without the owner's explicit approval. The key itself should be generated on the owner's own machine and pasted directly into Vercel; it never needs to transit this chat, consistent with the standing secrecy rule."));
bodyChildren.push(...dataTable("Table 3 — Gated steps in execution order", ["#", "Action", "Actor", "Notes"], [6, 44, 16, 34], [
  ["1", "Generate the encryption key (openssl rand -base64 32) and add REFERENCE_TOKEN_ENCRYPTION_KEY to Vercel in all environments", "Owner", "Value never shared in chat; same value into local .env"],
  ["2", "Approve pushing the three held commits (bb263e5, 1f138ec, Phase F1)", "Owner", "One approval covers the bundle or per-commit, as preferred"],
  ["3", "Add the nullable column to the hosted database (guarded additive push, then restore local client)", "Owner or assistant with approval", "Additive and nullable; no existing row is touched"],
  ["4", "Run the D4b backfill and the identity-unification backfill against production", "Owner or assistant with approval", "Idempotent, resumable, PII-free output; production flag required"],
  ["5", "Verify one existing referee link end-to-end from owner records", "Owner", "Link must open exactly as before; dashboard and reminders unchanged"],
]));

bodyChildren.push(h1("6. Issues, Fixes and Residual Risks"));
bodyChildren.push(body("Three issues worth recording emerged from verification, all resolved inside the cycle. The revocation gap in the referee-link lifecycle — a withdrawn request remained submittable while its expiry clock had not run out — was found by the new swap test and fixed by making the withdrawn status authoritative in both the form view and the submission gate; the fix is two lines, covered by regression, and disclosed in the commit message. The callback-code coupling described in section 3.2 was a migration landmine rather than a live bug; it became live only if the migration had shipped without the fix. Finally, two test-fixture subtleties (share creation requires a recipient under the binding rule; the digest and envelope of a referee token must derive from the same raw value) were corrected during test authoring and document the exact contracts future tests must respect."));
bodyChildren.push(body("Residual risks are known, bounded, and previously disclosed. Older Git history still contains an early database file and a work log; untracking stopped future exposure, and scrubbing history remains a forbidden rewrite absent an owner decision to the contrary. Both the personal access token and the database password transited chat earlier in the project, so owner-side rotation remains advisable; the encryption key introduced this cycle was designed so it never needs to do so. With Option C, anyone holding the encryption key could recover raw reference tokens — that is the deliberate trade for preserving the reminder workflow, and it is mitigated by key handling that is server-only, never logged, never committed, and rotation-ready."));

bodyChildren.push(h1("7. Follow-up Plan"));
bodyChildren.push(body("Once the owner completes the five gated steps in Table 3, the hardening cycle is fully live: all four token families are protected at rest, identity is unified behind one login, and the cross-role matrix guards the boundaries. The natural next increments, in the order they were left off, are the user-interface packs from the product plan that were intentionally deferred — the unified reports and sharing screens — followed by the remaining operational-hardening tail (content-security-policy tightening, retention windows for notification logs, and dependency reviews). Each remains subject to the same discipline: tell the owner first, make nothing unapproved, and gate every deploy on its own verification."));
bodyChildren.push(body("The shared work log records the full detail of every step taken this cycle, including the exact commands, the gates run, and the reasoning behind each design choice, so any future session can resume with complete context."));

// ══ DOCUMENT ══════════════════════════════════════════════════════════
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: EN, size: 24, color: PAL.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: { run: { font: EN, size: 32, bold: true, color: PAL.primary }, paragraph: { spacing: { before: 360, after: 160, line: 312 }, outlineLevel: 0 } },
      heading2: { run: { font: EN, size: 28, bold: true, color: PAL.primary }, paragraph: { spacing: { before: 240, after: 120, line: 312 }, outlineLevel: 1 } },
    },
  },
  sections: [
    { // Section 1: Cover — margin 0, no footer, no page numbers
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({
        title: "VaultVerify Delivery Report",
        subtitle: "Security and platform hardening: D4 token protection, D4b encryption at rest, unified identity, and cross-role assurance",
        englishLabel: "FINAL DELIVERY REPORT",
        metaLines: [
          "Repository: Live-BTS/VaultVerify (branch main)",
          "Scope: Phases D, D4b, E, F — implementation, verification, gated deployment",
          "Date: October 17, 2026",
        ],
        footerLeft: "VaultVerify",
        footerRight: "Confidential — owner distribution only",
        palette: PAL,
      }),
    },
    { // Section 2: Front matter (TOC) — Roman numerals
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN },
        },
      },
      headers: { default: docHeader },
      footers: { default: pageNumFooter() },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360 },
          children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: EN, color: PAL.primary })],
        }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({
            text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"",
            italics: true, size: 18, color: "888888", font: EN,
          })],
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    { // Section 3: Body — Arabic from 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: { default: docHeader },
      footers: { default: pageNumFooter() },
      children: bodyChildren,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/home/z/my-project/download/VaultVerify_Delivery_Report.docx", buf);
  console.log("DOCX written:", buf.length, "bytes");
});
