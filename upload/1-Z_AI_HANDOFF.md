# VaultVerify Skills Checklist PDF: Next.js handoff for Z.ai

You are the developer on MyZipVault / VaultVerify (a **Next.js** project). Add a **"Skills Checklist" PDF** that is generated from a
candidate's real checklist data. The design is **final and approved**. The renderer is already written and tested (section 8).
**Do not redesign, restyle or "improve" it.** Your job is to wire it into the app: data mapping, authorisation, a download endpoint,
a download button, deployment, and tests.

---

## 1. What you were given (4 files)

| # | File | What it is |
|---|---|---|
| 1 | `1-Z_AI_HANDOFF.md` | This file: instructions **and all the code** (section 8). |
| 2 | `2-approved-design.pdf` | The approved design (5 pages, sample data). **The visual target. Open it and look at it.** |
| 3 | `3-sample-data.json` | The exact data that produced the approved PDF (73 skills, 8 categories). Golden-test input. |
| 4 | `4-assets.zip` | `assets/skills-checklist/logo.png` and `assets/skills-checklist/fonts/` (Poppins Light, Regular, Medium, Bold; Lora Italic). Unzip into the **project root**. |

The code files are written out in section 8; create them exactly as shown. If `4-assets.zip` cannot be opened, put these files in
`assets/skills-checklist/` yourself: `logo.png` (ask the owner) and, in `fonts/`, the **static TTFs** `Poppins-Light.ttf`, `Poppins-Regular.ttf`,
`Poppins-Medium.ttf`, `Poppins-Bold.ttf` and `Lora-Italic-Regular.ttf` (Google Fonts, SIL Open Font License).

## 2. Already verified (do not redo, just do not break it)

- Renderer output vs `reference/approved-design.pdf`: **identical in layout, 5 pages, 31 differing pixels of 935,000 on page 1 (a dashed outline), 0 on pages 2 to 4, 1 on page 5**.
- Runs inside a real Next.js **16.3.8** App Router route handler with **pdfkit 0.15.2** (HTTP 200, `application/pdf`, correct page count).
- Edge cases verified: long candidate name, long skill names, empty text answer, no extra questions, unchecked attestation box, 2-category list.
- Speed: about **180 ms** per 73-skill PDF; the file is about **195 KB**.
- Without the `next.config` change the build **fails** (see section 3, step 2).

## 3. Your task, step by step

**Step 0. Inspect the repo first. Do not guess.** Find: the Next.js version and whether it uses the **App Router** (`app/`) or **Pages Router** (`pages/`);
the Prisma models for skill checklists, ratings, last-performed answers, yes/no and text answers, and the attestation/signature;
the existing auth/session helper; the existing document-sharing / consent logic (share links, expiry); the Dockerfile / deploy config;
the path alias (`@/`). Adapt to what exists. Do not add new infrastructure or paid services.

**Step 1. Install:** `npm i pdfkit` and `npm i -D @types/pdfkit` (tested with pdfkit 0.15.2).

**Step 2. Add the files and fix the config (REQUIRED).**
- Create `lib/pdf/skills-checklist-pdf.ts` from section 8 (adjust the folder to the project's convention; keep the code unchanged).
- Unzip `4-assets.zip` into the project root so the files land in `./assets/skills-checklist/` (the renderer reads them from
  `process.cwd()/assets/skills-checklist`; you may pass `{ assetsDir }` to change that).
- Merge the `next.config` snippet from section 8: **`serverExternalPackages: ["pdfkit", "fontkit"]`**
  (Next 13/14: `experimental.serverComponentsExternalPackages`). Without this, `next build` fails with
  *"The export applyDecoratedDescriptor was not found in module .../@swc/helpers"* from `fontkit`.
- Create the route from section 8. It must run on the **Node.js runtime** (`export const runtime = "nodejs"`), never Edge.

**Step 3. Implement the two TODOs in `route.ts`:**
1. `isAuthorised(req, checklistId)`: **fails closed today.** Allow only the candidate who owns the checklist, or a recruiter holding a valid, unexpired
   share link / consent for it. Reuse the existing session and sharing checks. Return **404** (not 403) when denied.
2. `loadChecklistData(checklistId)`: map database rows to `ChecklistData` (section 5). **Read-only. No schema change, no migration.**
If the project uses the Pages Router, create the equivalent `pages/api/skill-checklists/[id]/pdf.ts` handler (`res.setHeader`, `res.send(buffer)`).

**Step 4. Deployment.** The renderer needs `assets/skills-checklist/**` at runtime. On a container host (Fly.io), make sure the Dockerfile copies `./assets`
into the runtime image (including with `output: "standalone"`). On serverless hosts add `outputFileTracingIncludes` (see the snippet).
Verify the deployed endpoint, not just localhost.

**Step 5. UI.** Add a "Download PDF" link on the candidate's completed checklist and in the recruiter's view of a shared checklist:
`<a href="/api/skill-checklists/{id}/pdf" target="_blank" rel="noopener">Download PDF</a>`, using the project's existing button component and Tailwind tokens.
Only show it when the checklist is completed and signed. Do not restyle anything else.

**Step 6. Tests** (section 7). All must pass before you report done.

## 4. Safety rules for this task

- This feature is **read-only PDF generation**. It needs **no schema change and no migration**.
- Never run `--accept-data-loss`, `migrate reset`, or `DROP TABLE`. Production uses `prisma migrate deploy` only; if a migration is ever unavoidable, stop and ask first.
- Use the **dev** database for testing, never production.
- End your session with a short checklist of every database command you ran (expected: none that write).
- Never log candidate data (names, emails, ratings) to the console or error tracker.

## 5. Data contract

`renderSkillsChecklistPdf(data: ChecklistData, opts?)` returns `Promise<Buffer>`. The `ChecklistData` interface is exported from the renderer; this is its shape:

```json
{
  "candidate": { "name": "Sam", "profession": "Nursing", "jobTitle": "RN", "specialty": "General",
                 "email": "sam@example.com", "experience": "1 yr(s)",
                 "completedOn": "Oct 2, 2026", "validUntil": "Oct 2, 2027 (1 year)", "source": "Requested by a recruiter" },
  "categories": [ { "name": "Medication Administration", "shortName": "optional, used in the Category overview",
                    "skills": [ { "name": "Documentation on M.A.R.", "rating": 3, "lastPerformed": "within_6_months" } ] } ],
  "questions": [ { "category": "Availability & preferences", "items": [
                    { "type": "yes_no", "question": "Are you comfortable working night shifts?", "answer": true },
                    { "type": "text", "question": "Which EHR systems have you used?", "answer": "Epic and Cerner." } ] } ],
  "attestation": { "statements": [ { "text": "I confirm that the ratings above are my own ...", "accepted": true } ],
                   "signatureName": "Sam", "printedName": "Sam", "signedOn": "Oct 2, 2026" },
  "footerNote": "Self-reported assessment. Completed once by the candidate and valid for 12 months. ...",
  "generatedOn": "Oct 2, 2026",
  "sampleNotice": ""
}
```

Rules:
- `rating`: integer **1 to 4** (1 = No theory, 2 = Limited, 3 = Experienced, 4 = Proficient). Rating questions have **no N/A**.
- `lastPerformed`: `within_3_months` | `within_6_months` | `over_6_months` | `na` (never performed).
- `questions[].items[].type`: `yes_no` or `text`. **Assumed names. Confirm them against the real question-type enum and map if different.**
- Dates are display strings, formatted `Oct 2, 2026`. `validUntil` is completion + 12 months, written like `Oct 2, 2027 (1 year)`.
- `sampleNotice` must be **empty in production** (the approved sample sets it because its data is sample data).
- Keep the order of `categories` and `skills` as in the checklist template. Do not re-sort.
- If `signatureName` is empty the signature line stays blank and "Signed electronically" is hidden. An unaccepted statement renders as an empty checkbox.
- Export columns (Profession, Job Title, Specialty, Category, Skill Name, Question Type, Has N/A Option): Profession, Job Title and Specialty feed the candidate chips;
  Category groups the skills; Skill Name is the row label; Question Type picks the widget (`rating_1_4` = ring + chip + last-performed chip; yes/no = toggle; text = answer box).
- `footerNote` / attestation statement texts: use the platform's approved legal wording. The sample wording is a draft and needs legal review.

## 6. Design specification (for review; non-negotiable)

**Page:** US Letter 612 x 792 pt, 40 pt margins, top-left origin. Content never goes below y = 716. **Fonts:** Poppins (Light/Regular/Medium/Bold); Lora Italic 24 pt for the typed signature.

| Token | Hex | Use |
|---|---|---|
| ink | `#0B2E33` | primary text, dark table header |
| deep | `#03363D` | brand header band |
| teal | `#0F5257` | section titles, avatar |
| leaf / leaf-dark | `#4DAA57` / `#2F8A3E` | accent line, category bars / numbers, checkbox |
| mint | `#EEF6F1` | section backgrounds, category bands |
| slate | `#5E7075` | secondary text |
| line | `#E2EAE6` | hairlines, card borders |

**Rating colours (one hue per level):** 4 Proficient `#12A150`, 3 Experienced `#2F80ED`, 2 Limited `#F2A20C`, 1 No theory `#E5484D`.
**Last performed (professional navy to grey):** within 3 months solid navy `#1E3A5F`; within 6 months steel `#6F8FB0`; 6+ months light grey `#E3E8ED`; N/A white with a dashed outline. The first three carry a small clock icon.

**Page 1, top to bottom:** brand header (logo tile on the **left**, "VaultVerify" next to it, tagline below; title and subtitle right-aligned; green line beneath) ->
candidate card overlapping the header (avatar, name, chips, divider, email / experience / completed / valid until / source) ->
**Summary at a glance** (white card: four plain figures in one row; below, two slim stacked bars, Rating mix and Last performed; only the bars carry colour) ->
Category overview (mint card with average bars) -> legends (rating scale rings; last-performed chips) -> skills table.

**Skills table:** dark header (Skill | Rating | Last performed); a mint band per category; each row = wrapped skill name, dotted leader, **score ring** (four 90 degree segments filled clockwise to the level, number in the centre),
tinted level chip, last-performed chip.

**Pagination:** a category band is kept with at least its first two rows; a category split across pages repeats its band as "<Category> (continued)"; pages 2+ get a slim header and a repeated table header;
every footer shows "Page x of y" (two-pass render); the last page footer carries the disclaimer and "Generated <date> by VaultVerify."

**Additional questions:** dark header; yes/no = segmented **Yes | No** toggle (selected side filled, green for Yes, slate for No); text = boxed answer with green left edge, height grows with the text.
**Candidate attestation:** mint card with green left edge, one checkbox per statement, then typed signature, printed name and date. The card moves whole to the next page if it does not fit.

**Robustness (already implemented, keep):** long names shrink then truncate; role chips that do not fit are dropped; long skill names wrap; empty text answers show "No answer provided"; empty `questions` hides the section.

## 7. Acceptance tests

1. **Golden test.** Save `3-sample-data.json` as `reference/sample-data.json` and `2-approved-design.pdf` as `reference/approved-design.pdf`, create the two helper scripts from section 8, then run
   `npx tsx scripts/render-sample.ts reference/sample-data.json out.pdf` and
   `python scripts/compare-pdfs.py reference/approved-design.pdf out.pdf` (needs poppler, pillow, numpy). Must print **PASS** (5 pages; at most a few dozen differing pixels).
   Also look at the rendered pages yourself next to the approved PDF.
2. **Real data:** generate a PDF from a real dev-database checklist. Rating counts, averages and "x of y" figures must match the database.
3. **Different candidate, shorter list** (2 categories, name `Priya Raghunathan-Fernandez`, job title `CRNA`): no overlap with the Email column.
4. Long skill name wraps without touching the rating column; empty text answer shows "No answer provided"; `questions: []` hides the section; an unaccepted statement shows an empty box.
5. A category split across pages shows "(continued)" and the repeated table header; "Page x of y" is correct on every page.
6. **Authorisation:** non-owner without a valid share link gets **404** and no PDF; an expired share link gets 404; the owner and a recruiter with a valid link get 200 `application/pdf`.
7. The footer of a production PDF contains **no** sample-data notice.
8. `next build` succeeds, and the endpoint works in the **production build** (`next start`) and in the deployed environment, not only `next dev`.

Report back with: the Next.js router type and version, files added/changed, the golden-test output, and your database-command checklist.

## 8. Code

### `lib/pdf/skills-checklist-pdf.ts` (the renderer: copy unchanged)

```ts
/**
 * VaultVerify - Skills Checklist PDF (Node / PDFKit port)
 *
 * Faithful port of the approved reference implementation (generate_checklist.py).
 * All coordinates are PDF points on US Letter (612 x 792) with a TOP-LEFT origin,
 * which is what PDFKit uses, so the `top` values from the reference apply unchanged.
 *
 * Usage:
 *   import { renderSkillsChecklistPdf } from "@/lib/pdf/skills-checklist-pdf";
 *   const pdf: Buffer = await renderSkillsChecklistPdf(data);
 *
 * Runtime: Node.js only (never the Edge runtime).
 */
import path from "node:path";
import PDFDocument from "pdfkit";

// --------------------------------------------------------------------------- types
export type Rating = 1 | 2 | 3 | 4;
export type LastPerformed = "within_3_months" | "within_6_months" | "over_6_months" | "na";

export interface ChecklistData {
  candidate: {
    name: string;
    profession: string;
    jobTitle: string;
    specialty: string;
    email: string;
    experience: string;
    completedOn: string;
    validUntil: string;
    source: string;
  };
  categories: {
    name: string;
    shortName?: string;
    skills: { name: string; rating: Rating; lastPerformed: LastPerformed }[];
  }[];
  questions?: {
    category: string;
    items: (
      | { type: "yes_no"; question: string; answer: boolean }
      | { type: "text"; question: string; answer: string }
    )[];
  }[];
  attestation: {
    statements: { text: string; accepted: boolean }[];
    signatureName?: string;
    printedName?: string;
    signedOn?: string;
  };
  footerNote: string;
  generatedOn: string;
  sampleNotice?: string;
}

export interface RenderOptions {
  /** Folder that contains logo.png and fonts/. Default: <cwd>/assets/skills-checklist */
  assetsDir?: string;
}

// --------------------------------------------------------------------------- design tokens
const W = 612;
const H = 792;
const M = 40;
const CW = W - 2 * M;
const LIMIT = H - 76; // lowest y a content row may reach (footer lives below)

const INK = "#0B2E33";
const TEAL = "#0F5257";
const DEEP = "#03363D";
const LEAF = "#4DAA57";
const LEAF_D = "#2F8A3E";
const MINT = "#EEF6F1";
const MINT2 = "#DDEDE3";
const SLATE = "#5E7075";
const LINE = "#E2EAE6";
const WHITE = "#FFFFFF";
const ACCENT_ON_DARK = "#8BE39A";

const LVL: Record<Rating, string> = { 4: "#12A150", 3: "#2F80ED", 2: "#F2A20C", 1: "#E5484D" };
const LVL_LABEL: Record<Rating, string> = { 4: "Proficient", 3: "Experienced", 2: "Limited", 1: "No theory" };
const LVL_LEGEND: Record<Rating, string> = { 1: "No theory / experience", 2: "Limited", 3: "Experienced", 4: "Proficient" };

interface RecStyle { label: string; fill: string; text: string; border: string | null; bar: string }
const REC: Record<LastPerformed, RecStyle> = {
  within_3_months: { label: "Within 3 months", fill: "#1E3A5F", text: WHITE, border: null, bar: "#1E3A5F" },
  within_6_months: { label: "Within 6 months", fill: "#6F8FB0", text: WHITE, border: null, bar: "#6F8FB0" },
  over_6_months: { label: "6+ months ago", fill: "#E3E8ED", text: "#566273", border: null, bar: "#C9D1D9" },
  na: { label: "N/A", fill: WHITE, text: "#8A97A3", border: "#B9C3CD", bar: "#E8ECEF" },
};
const REC_ORDER: LastPerformed[] = ["within_3_months", "within_6_months", "over_6_months", "na"];

const RX = 322; // centre of the rating ring
const LPX = 446; // left edge of the "Last performed" chip
const SKILL_W = 246; // max width of a skill name before it wraps

// --------------------------------------------------------------------------- colour helpers
type RGB = [number, number, number];
const toRgb = (hex: string): RGB => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
/** Blend a colour toward white by k (0..1). */
const mix = (hex: string, k: number): RGB => toRgb(hex).map((v) => v + (255 - v) * k) as RGB;
const darken = (hex: string, k: number): RGB => toRgb(hex).map((v) => v * k) as RGB;

// --------------------------------------------------------------------------- validation
function validate(data: ChecklistData) {
  for (const cat of data.categories) {
    for (const s of cat.skills) {
      if (![1, 2, 3, 4].includes(s.rating)) throw new Error(`Bad rating for "${s.name}": ${s.rating}`);
      if (!(s.lastPerformed in REC)) throw new Error(`Bad lastPerformed for "${s.name}": ${s.lastPerformed}`);
    }
  }
  if (!data.categories.some((c) => c.skills.length)) throw new Error("Checklist has no skills");
}

// --------------------------------------------------------------------------- public API
export async function renderSkillsChecklistPdf(data: ChecklistData, opts: RenderOptions = {}): Promise<Buffer> {
  validate(data);
  const assetsDir = opts.assetsDir ?? path.join(process.cwd(), "assets", "skills-checklist");
  // Two passes: the first counts pages so "Page x of y" is right on every page.
  const first = await draw(data, assetsDir, 1);
  const second = await draw(data, assetsDir, first.pages);
  return second.buffer;
}

// --------------------------------------------------------------------------- renderer
function draw(data: ChecklistData, assetsDir: string, total: number): Promise<{ buffer: Buffer; pages: number }> {
  const cand = data.candidate;
  const cats = data.categories;
  const all = cats.flatMap((c) => c.skills);
  const N = all.length;
  const AVG = all.reduce((a, s) => a + s.rating, 0) / N;
  const PROF = all.filter((s) => s.rating === 4).length;
  const RECENT = all.filter((s) => s.lastPerformed === "within_3_months").length;
  const cnt = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Rating, number>;
  all.forEach((s) => cnt[s.rating]++);
  const rcnt = { within_3_months: 0, within_6_months: 0, over_6_months: 0, na: 0 } as Record<LastPerformed, number>;
  all.forEach((s) => rcnt[s.lastPerformed]++);
  const roleLine = `${cand.name}, ${cand.jobTitle} (${cand.specialty})`;

  const doc = new PDFDocument({
    size: [W, H],
    margin: 0,
    autoFirstPage: false,
    info: { Title: `Skills Checklist - ${cand.name} (${cand.jobTitle}, ${cand.specialty})`, Author: "VaultVerify" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const fontDir = path.join(assetsDir, "fonts");
  doc.registerFont("P", path.join(fontDir, "Poppins-Regular.ttf"));
  doc.registerFont("PL", path.join(fontDir, "Poppins-Light.ttf"));
  doc.registerFont("PM", path.join(fontDir, "Poppins-Medium.ttf"));
  doc.registerFont("PB", path.join(fontDir, "Poppins-Bold.ttf"));
  doc.registerFont("Sig", path.join(fontDir, "Lora-Italic-Regular.ttf"));
  // Pass the file PATH (not a Buffer) so PDFKit embeds the logo once and reuses it on every page
  const logo = path.join(assetsDir, "logo.png");

  // ------------------------------------------------------------------ primitives
  type Fill = string | RGB;
  const rrect = (x: number, top: number, w: number, h: number, r: number, fill?: Fill, stroke?: Fill, lw = 0.8) => {
    doc.roundedRect(x, top, w, h, r);
    if (fill && stroke) { doc.lineWidth(lw); doc.fillAndStroke(fill as any, stroke as any); }
    else if (fill) doc.fill(fill as any);
    else if (stroke) { doc.lineWidth(lw); doc.stroke(stroke as any); }
  };
  const width = (s: string, font = "P", size = 9) => doc.font(font).fontSize(size).widthOfString(s);
  const text = (x: number, top: number, s: string, font = "P", size = 9, color: Fill = INK, align: "l" | "r" | "c" = "l") => {
    doc.font(font).fontSize(size).fillColor(color as any);
    const w = doc.widthOfString(s);
    const x0 = align === "l" ? x : align === "r" ? x - w : x - w / 2;
    doc.text(s, x0, top, { lineBreak: false, baseline: "alphabetic" });
  };
  const line = (x1: number, y1: number, x2: number, y2: number, color: Fill, lw: number) => {
    doc.lineWidth(lw).strokeColor(color as any).moveTo(x1, y1).lineTo(x2, y2).stroke();
  };
  /** ReportLab simpleSplit: greedy word wrap on spaces. */
  const wrap = (s: string, font: string, size: number, maxW: number): string[] => {
    const out: string[] = [];
    for (const para of s.split("\n")) {
      let cur = "";
      for (const w of para.split(/\s+/).filter(Boolean)) {
        const cand2 = cur ? `${cur} ${w}` : w;
        if (!cur || width(cand2, font, size) <= maxW) cur = cand2;
        else { out.push(cur); cur = w; }
      }
      out.push(cur);
    }
    return out;
  };
  const alpha = (fn: () => void, a: number) => { doc.save(); doc.fillOpacity(a); fn(); doc.restore(); };

  const headerRings = (hb: number) => {
    doc.save();
    doc.rect(0, 0, W, hb).clip();
    for (const [r, a] of [[150, 0.06], [112, 0.07], [74, 0.08]] as const) {
      doc.fillColor([77, 171, 87] as any).fillOpacity(a).circle(W - 40, 10, r).fill();
    }
    doc.restore();
  };

  // ------------------------------------------------------------------ rating widgets
  /** 4-segment score ring; segments fill clockwise from 12 o'clock up to `level`, number centred. */
  const ring = (cx: number, cy: number, level: Rating, r = 8.2, lw = 2.6) => {
    doc.lineCap("round").lineWidth(lw);
    for (let i = 0; i < 4; i++) {
      const a0 = ((i * 90 + 6) * Math.PI) / 180;
      const a1 = ((i * 90 + 84) * Math.PI) / 180;
      const p = (a: number): [number, number] => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
      const [x0, y0] = p(a0);
      const [x1, y1] = p(a1);
      doc.path(`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`).stroke((i < level ? LVL[level] : "#E3EAE7") as any);
    }
    text(cx, cy + 2.6, String(level), "PB", 7.4, LVL[level], "c");
  };
  const levelChip = (x: number, cy: number, level: Rating) => {
    const lab = LVL_LABEL[level];
    const w = width(lab, "PB", 6.6) + 14;
    rrect(x, cy - 6.5, w, 13, 6.5, mix(LVL[level], 0.84));
    text(x + w / 2, cy + 2.4, lab, "PB", 6.6, darken(LVL[level], 0.72), "c");
  };
  const recChip = (x: number, cy: number, key: LastPerformed, size = 6.4): number => {
    const st = REC[key];
    const icon = key === "na" ? 0 : 10;
    const w = width(st.label, "PB", size) + 14 + icon;
    rrect(x, cy - 6.5, w, 13, 6.5, st.fill);
    if (st.border) {
      doc.lineWidth(0.8).dash(2, { space: 1.6 });
      doc.roundedRect(x, cy - 6.5, w, 13, 6.5).stroke(st.border);
      doc.undash();
    }
    if (icon) { // tiny clock icon
      const ix = x + 9;
      doc.lineWidth(0.8).lineCap("round").strokeColor(st.text);
      doc.circle(ix, cy, 2.8).stroke();
      doc.moveTo(ix, cy).lineTo(ix, cy - 1.8).stroke();
      doc.moveTo(ix, cy).lineTo(ix + 1.5, cy + 0.6).stroke();
    }
    text(icon ? x + (w + icon) / 2 : x + w / 2, cy + 2.3, st.label, "PB", size, st.text, "c");
    return w;
  };

  // ------------------------------------------------------------------ page chrome
  let page = 0;
  const tableHeader = (top: number): number => {
    rrect(M, top, CW, 34, 10, INK);
    text(M + 16, top + 21, "Skill", "PB", 8.5, WHITE);
    text(RX - 10, top + 21, "Rating", "PB", 8.5, ACCENT_ON_DARK);
    text(LPX, top + 21, "Last performed", "PB", 8.5, ACCENT_ON_DARK);
    return top + 40;
  };
  const footer = (last: boolean) => {
    line(M, H - 56, W - M, H - 56, LINE, 0.6);
    if (last) {
      wrap(data.footerNote, "P", 6.6, CW - 70).forEach((ln, k) => text(M, H - 44 + k * 9, ln, "P", 6.6, SLATE));
      let gen = `Generated ${data.generatedOn} by VaultVerify.`;
      if (data.sampleNotice) gen += "   " + data.sampleNotice;
      text(M, H - 44 + 2 * 9, gen, "PM", 6.6, TEAL);
    } else {
      text(M, H - 40, `VaultVerify   Skills Checklist: ${roleLine}`, "PM", 6.8, TEAL);
    }
    text(W - M, H - 40, `Page ${page} of ${total}`, "PM", 6.8, SLATE, "r");
  };
  const slimHeader = (): number => {
    doc.rect(0, 0, W, 52).fill(DEEP);
    headerRings(52);
    doc.rect(0, 52, W, 2).fill(LEAF);
    rrect(M, 11, 30, 30, 8, "#F3F8F4");
    doc.image(logo, M + 3, 14, { width: 24, height: 24 });
    text(M + 40, 31, "VaultVerify", "PB", 12.5, WHITE);
    text(W - M, 31, `Skills Checklist: ${roleLine}`, "PM", 8.5, WHITE, "r");
    return 72;
  };
  const newPage = (): number => {
    footer(false);
    doc.addPage();
    page++;
    return slimHeader();
  };

  // ================================================================== PAGE 1
  doc.addPage();
  page = 1;

  // ---- brand header (logo LEFT, platform name next to it)
  const HB = 104;
  doc.rect(0, 0, W, HB).fill(DEEP);
  headerRings(HB);
  doc.rect(0, HB, W, 3).fill(LEAF);
  rrect(M, 17, 54, 54, 14, "#F3F8F4");
  doc.image(logo, M + 4, 21, { width: 46, height: 46 });
  text(M + 68, 43, "VaultVerify", "PB", 21, WHITE);
  text(M + 69, 60, "References, verified. Skills, proven.", "PL", 8.5, "#BFE3C7");
  text(W - M, 40, "Skills Checklist", "PM", 15, WHITE, "r");
  text(W - M, 56, "Self-assessment completed by the candidate", "PL", 8, "#BFD6D3", "r");

  // ---- candidate card (overlaps the header)
  const CT = 78;
  const CH = 92;
  [0.025, 0.03, 0.04].forEach((a, i) => { // faux soft shadow
    alpha(() => doc.roundedRect(M - 3 + i, CT + 1 + (2 - i) * 1.2, CW + 6 - 2 * i, CH + 2, 16).fill([10, 46, 51] as any), a);
  });
  rrect(M, CT, CW, CH, 14, WHITE, LINE);
  doc.circle(M + 36, CT + 36, 20).fill(TEAL);
  text(M + 36, CT + 43, cand.name.slice(0, 1).toUpperCase(), "PB", 18, WHITE, "c");
  // Name: shrink to fit left of the divider (max 160pt); ellipsis only as a last resort
  let nameTxt = cand.name;
  let nameSize = 21;
  while (width(nameTxt, "PB", nameSize) > 160 && nameSize > 13) nameSize--;
  while (width(nameTxt, "PB", nameSize) > 160 && nameTxt.length > 4) nameTxt = nameTxt.slice(0, -4).trimEnd() + "...";
  text(M + 68, CT + 34, nameTxt, "PB", nameSize, INK);
  let cx = M + 68;
  for (const chip of [cand.jobTitle, cand.specialty, cand.profession]) {
    const w = width(chip, "PM", 7.5) + 14;
    if (cx + w > M + 232) break; // never run into the divider
    rrect(cx, CT + 44, w, 16, 8, MINT2);
    text(cx + w / 2, CT + 55.2, chip, "PM", 7.5, TEAL, "c");
    cx += w + 5;
  }
  line(M + 240, CT + 16, M + 240, CT + CH - 16, LINE, 0.8);
  const meta = (x: number, top: number, label: string, value: string) => {
    text(x, top, label, "P", 6.8, SLATE);
    text(x, top + 12, value, "PM", 8, INK);
  };
  const mx = M + 256;
  meta(mx, CT + 30, "Email", cand.email);
  meta(mx + 150, CT + 30, "Self-reported experience", cand.experience);
  meta(mx, CT + 62, "Completed", cand.completedOn);
  meta(mx + 68, CT + 62, "Valid until", cand.validUntil);
  meta(mx + 160, CT + 62, "Source", cand.source);

  // ---- Summary at a glance (restrained white card; only the two bars carry colour)
  const ST0 = CT + CH + 16;
  const SUM_H = 122;
  rrect(M, ST0, CW, SUM_H, 14, WHITE, LINE);
  text(M + 20, ST0 + 24, "Summary at a glance", "PB", 9.5, TEAL);
  const stats: [string, string, string][] = [
    [String(N), "", "Skills assessed"],
    [AVG.toFixed(1), " / 4", "Average rating"],
    [String(PROF), `  ${Math.round((100 * PROF) / N)}%`, "Rated Proficient"],
    [String(RECENT), `  ${Math.round((100 * RECENT) / N)}%`, "Used within 3 months"],
  ];
  const colw = (CW - 40) / 4;
  stats.forEach(([big, sub, lab], i) => {
    const sx = M + 20 + i * colw;
    if (i) line(sx - 12, ST0 + 38, sx - 12, ST0 + 76, LINE, 0.8);
    text(sx, ST0 + 58, big, "PB", 20, INK);
    text(sx + width(big, "PB", 20) + 2, ST0 + 58, sub, "PM", 8, SLATE);
    text(sx, ST0 + 72, lab, "P", 7.4, SLATE);
  });
  line(M + 20, ST0 + 84, W - M - 20, ST0 + 84, LINE, 0.8);

  /** Pill-shaped stacked bar. Counts are printed inside segments wide enough to hold them. */
  const stacked = (x: number, top: number, w: number, h: number, parts: [number, string, string][]) => {
    const tot = parts.reduce((a, p) => a + p[0], 0);
    doc.save();
    doc.roundedRect(x, top, w, h, h / 2).clip();
    let cx_ = x;
    for (const [n, col, tcol] of parts) {
      if (!n) continue;
      const sw = (w * n) / tot;
      doc.rect(cx_, top, sw, h).fill(col);
      line(cx_, top, cx_, top + h, WHITE, 1.2);
      if (sw > 15) text(cx_ + sw / 2, top + h / 2 + 2.3, String(n), "PB", 6.4, tcol, "c");
      cx_ += sw;
    }
    doc.restore();
  };
  const bw = (CW - 40 - 28) / 2;
  text(M + 20, ST0 + 98, "Rating mix", "PM", 7, SLATE);
  stacked(M + 20, ST0 + 103, bw, 10, [[cnt[4], LVL[4], WHITE], [cnt[3], LVL[3], WHITE], [cnt[2], LVL[2], WHITE], [cnt[1], LVL[1], WHITE]]);
  text(M + 20 + bw + 28, ST0 + 98, "Last performed", "PM", 7, SLATE);
  stacked(M + 20 + bw + 28, ST0 + 103, bw, 10, [
    [rcnt.within_3_months, REC.within_3_months.bar, WHITE],
    [rcnt.within_6_months, REC.within_6_months.bar, WHITE],
    [rcnt.over_6_months, REC.over_6_months.bar, "#3F4B5A"],
    [rcnt.na, REC.na.bar, "#3F4B5A"],
  ]);

  // ---- Category overview
  const OT = ST0 + SUM_H + 14;
  const OH = 38 + cats.length * 17 + 22;
  rrect(M, OT, CW, OH, 14, MINT);
  text(M + 18, OT + 22, "Category overview", "PB", 9.5, TEAL);
  text(W - M - 18, OT + 22, "Average rating and recent activity by category", "PL", 7.4, SLATE, "r");
  let yy = OT + 44;
  for (const cat of cats) {
    const rs = cat.skills.map((s) => s.rating);
    const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
    const pr = rs.filter((r) => r === 4).length;
    const rc = cat.skills.filter((s) => s.lastPerformed === "within_3_months").length;
    let label = cat.shortName || cat.name;
    while (width(label, "PM", 7.6) > 150 && label.length > 4) label = label.slice(0, -4).trimEnd() + "...";
    text(M + 18, yy + 4, label, "PM", 7.6, INK);
    const tx = M + 176;
    const tw = 110;
    doc.roundedRect(tx, yy - 3, tw, 6, 3).fill("#C9DDD0");
    doc.roundedRect(tx, yy - 3, (tw * avg) / 4, 6, 3).fill(LEAF);
    text(tx + tw + 10, yy + 4, avg.toFixed(1), "PB", 7.6, LEAF_D);
    text(M + 330, yy + 4, `${pr} of ${rs.length} Proficient`, "P", 7.2, SLATE);
    text(W - M - 18, yy + 4, `${rc} of ${rs.length} recent`, "P", 7.2, SLATE, "r");
    yy += 17;
  }
  text(M + 18, OT + OH - 9, "Recent means last performed within 3 months.", "PL", 6.8, SLATE);

  // ---- Legends
  const LT = OT + OH + 14;
  text(M, LT + 8, "Rating scale", "PB", 8.5, INK);
  let lx = M + 74;
  ([1, 2, 3, 4] as Rating[]).forEach((lv) => {
    ring(lx + 6, LT + 5, lv, 6.4, 2.0);
    text(lx + 17, LT + 8, `${lv}  ${LVL_LEGEND[lv]}`, "P", 7, SLATE);
    lx += [128, 78, 92, 80][lv - 1];
  });
  text(M, LT + 30, "Last performed", "PB", 8.5, INK);
  let lx2 = M + 74;
  for (const key of REC_ORDER) lx2 += recChip(lx2, LT + 27, key, 6.2) + 10;

  // ---- Skills table
  let y = tableHeader(LT + 46);
  for (const cat of cats) {
    const skills = cat.skills;
    // Keep a category band together with at least its first two rows
    const need = 19 + skills.slice(0, 2).reduce((a, s) => a + 10 + 9 * wrap(s.name, "P", 7.9, SKILL_W).length, 0) + 6;
    if (y + need > LIMIT) y = tableHeader(newPage());
    const band = (continued = false) => {
      rrect(M, y, CW, 19, 6, MINT);
      text(M + 16, y + 13, cat.name + (continued ? " (continued)" : ""), "PB", 8.3, TEAL);
      y += 19;
    };
    band();
    for (const s of skills) {
      const ln = wrap(s.name, "P", 7.9, SKILL_W);
      const rh = 12 + 9 * ln.length;
      if (y + rh > LIMIT) { y = tableHeader(newPage()); band(true); }
      ln.forEach((l, k) => text(M + 16, y + 13 + k * 9, l, "P", 7.9, INK));
      // dotted leader from the end of the name to the rating
      const lw_ = width(ln[ln.length - 1], "P", 7.9);
      const ly = y + rh / 2 + 3.2 + (ln.length - 1) * 4.5;
      doc.lineWidth(0.7).lineCap("round").dash(0.6, { space: 3.2 });
      doc.moveTo(M + 16 + lw_ + 8, ly).lineTo(RX - 14, ly).stroke("#D3DDD8");
      doc.undash();
      ring(RX, y + rh / 2, s.rating);
      levelChip(RX + 14, y + rh / 2, s.rating);
      recChip(LPX, y + rh / 2, s.lastPerformed);
      line(M + 10, y + rh, W - M - 10, y + rh, LINE, 0.6);
      y += rh;
    }
    y += 5;
  }

  // ---- Additional questions (yes/no + free text)
  const ensure = (h: number) => { if (y + h > LIMIT) y = newPage(); };
  /** Segmented Yes | No toggle. Selected side is filled (green = Yes, slate = No). */
  const seg = (x: number, top: number, ans: boolean) => {
    const w = 100;
    const h = 18;
    rrect(x, top, w, h, 9, "#E9EFEC");
    const col = ans ? LEAF_D : SLATE;
    const sx = ans ? x : x + 48;
    const [labOn, labOff, onX, offX] = ans ? ["Yes", "No", x + 26, x + 76] : ["No", "Yes", x + 74, x + 24];
    alpha(() => doc.roundedRect(sx - 2, top - 2, 54, h + 4, 11).fill(col), 0.18);
    rrect(sx, top, 52, h, 9, col);
    doc.circle(ans ? sx + 9 : sx + 43, top + 9, 2.2).fill(WHITE);
    text(onX + (ans ? 4 : -4), top + 12.2, labOn, "PB", 7.8, WHITE, "c");
    text(offX, top + 12.2, labOff, "PM", 7.6, "#8A9A96", "c");
  };

  if (data.questions && data.questions.length) {
    ensure(34 + 19 + 30);
    y += 6;
    rrect(M, y, CW, 34, 10, INK);
    text(M + 16, y + 21, "Additional questions", "PB", 8.5, WHITE);
    text(W - M - 16, y + 21, "Answer", "PB", 8.5, ACCENT_ON_DARK, "r");
    y += 40;
    for (const group of data.questions) {
      ensure(19 + 30);
      rrect(M, y, CW, 19, 6, MINT);
      text(M + 16, y + 13, group.category, "PB", 8.3, TEAL);
      y += 19;
      for (const item of group.items) {
        if (item.type === "yes_no") {
          const ln = wrap(item.question, "P", 7.9, 360);
          const rh = Math.max(28, 14 + 9 * ln.length);
          ensure(rh);
          ln.forEach((l, k) => text(M + 16, y + rh / 2 + 3 - (ln.length - 1) * 4.5 + k * 9, l, "P", 7.9, INK));
          seg(W - M - 10 - 100, y + rh / 2 - 9, item.answer === true);
          line(M + 10, y + rh, W - M - 10, y + rh, LINE, 0.6);
          y += rh;
        } else {
          const ql = wrap(item.question, "P", 7.9, CW - 32);
          const answer = (item.answer || "").trim() || "No answer provided";
          const al = wrap(answer, "PM", 8, CW - 32 - 28);
          const bh = 14 + 10.5 * al.length;
          ensure(8 + 10 * ql.length + bh + 10);
          y += 8;
          ql.forEach((l, k) => text(M + 16, y + 7 + k * 10, l, "P", 7.9, SLATE));
          y += 10 * ql.length + 2;
          rrect(M + 16, y, CW - 32, bh, 8, "#F7FAF8", "#D5E2DB", 0.9);
          doc.roundedRect(M + 16, y, 3.5, bh, 1.75).fill(LEAF);
          al.forEach((l, k) => text(M + 30, y + 14 + k * 10.5, l, "PM", 8, INK));
          y += bh + 8;
        }
      }
      y += 5;
    }
  }

  // ---- Candidate attestation (checkboxes + signature)
  const att = data.attestation;
  const AH = 214;
  if (y + 8 + AH > LIMIT + 14) y = newPage();
  y += 10;
  rrect(M, y, CW, AH, 14, MINT);
  doc.roundedRect(M, y, 4, AH, 2).fill(LEAF);
  text(M + 22, y + 26, "Candidate attestation", "PB", 11, TEAL);
  text(M + 22, y + 40, "Please read and confirm before this checklist is shared.", "PL", 7.8, SLATE);
  const checkbox = (x: number, top: number, checked: boolean) => {
    if (checked) alpha(() => doc.roundedRect(x - 3, top - 3, 20, 20, 7).fill([77, 171, 87] as any), 0.2);
    rrect(x, top, 14, 14, 4, checked ? LEAF_D : WHITE, LEAF_D, 1.2);
    if (checked) {
      doc.lineWidth(1.8).lineCap("round").lineJoin("round").strokeColor(WHITE);
      doc.moveTo(x + 3.4, top + 7.4).lineTo(x + 6, top + 10).lineTo(x + 11, top + 4).stroke();
    }
  };
  let cy_ = y + 60;
  for (const st of att.statements) {
    checkbox(M + 22, cy_ - 1, st.accepted);
    wrap(st.text, "P", 7.9, CW - 90).forEach((l, k) => text(M + 46, cy_ + 9 + k * 10.5, l, "P", 7.9, INK));
    cy_ += 40;
  }
  const sy = y + 148;
  const sx = M + 22;
  const sigLine = (x1: number, x2: number) => line(x1, sy + 22, x2, sy + 22, "#9DB5AC", 0.9);
  sigLine(sx, sx + 215);
  if (att.signatureName) text(sx + 6, sy + 16, att.signatureName, "Sig", 24, INK);
  text(sx, sy + 34, "Candidate signature", "P", 6.8, SLATE);
  if (att.signatureName) text(sx + 215, sy + 34, "Signed electronically", "PM", 6.8, LEAF_D, "r");
  sigLine(sx + 245, sx + 355);
  text(sx + 249, sy + 15, att.printedName ?? "", "PM", 9, INK);
  text(sx + 245, sy + 34, "Printed name", "P", 6.8, SLATE);
  sigLine(sx + 380, sx + 480);
  text(sx + 384, sy + 15, att.signedOn ?? "", "PM", 9, INK);
  text(sx + 380, sy + 34, "Date", "P", 6.8, SLATE);
  y += AH + 8;

  footer(true);
  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), pages: page }));
    doc.on("error", reject);
    doc.end();
  });
}
```

### `app/api/skill-checklists/[id]/pdf/route.ts` (finish the two TODOs)

```ts
import { renderSkillsChecklistPdf, type ChecklistData } from "@/lib/pdf/skills-checklist-pdf";

// PDFKit needs Node APIs. Never the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TODO(z.ai) 1 of 2. Authorisation. FAILS CLOSED until implemented.
 * Allow only: the candidate who owns this checklist, OR a recruiter holding a valid, unexpired share link / consent
 * for it. Reuse the project's existing session + document-sharing checks. Do not invent a new auth scheme.
 */
async function isAuthorised(_req: Request, _checklistId: string): Promise<boolean> {
  return false;
}

/**
 * TODO(z.ai) 2 of 2. Data mapper: database rows -> ChecklistData (see the data contract in Z_AI_HANDOFF.md).
 * Return null when the checklist does not exist. Read-only: no writes, no schema changes.
 */
async function loadChecklistData(_checklistId: string): Promise<ChecklistData | null> {
  throw new Error("loadChecklistData is not implemented");
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Next.js 15+: params is a Promise. On Next 13/14 use `{ params }: { params: { id: string } }` and drop the await.
  const { id } = await ctx.params;

  if (!(await isAuthorised(req, id))) {
    // 404 (not 403) so the response does not reveal whether a checklist exists
    return new Response("Not found", { status: 404 });
  }
  const data = await loadChecklistData(id);
  if (!data) return new Response("Not found", { status: 404 });

  const pdf = await renderSkillsChecklistPdf(data);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="skills-checklist-${id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
```

### `next.config` change (merge into the existing config)

```js
// Merge this into the project's existing next.config (.js / .mjs / .ts).
// REQUIRED: without it `next build` fails ("applyDecoratedDescriptor was not found" from fontkit).
// Verified with Next.js 16.3.8 and pdfkit 0.15.2.
//
// Next.js 15 and 16:
const nextConfig = {
  serverExternalPackages: ["pdfkit", "fontkit"],
};
export default nextConfig;

// Next.js 13 / 14 use the older key instead:
//   experimental: { serverComponentsExternalPackages: ["pdfkit", "fontkit"] }
//
// If the app is deployed to a serverless host (e.g. Vercel) the font/logo files must be traced into the function:
//   outputFileTracingIncludes: { "/api/skill-checklists/[id]/pdf": ["./assets/skills-checklist/**/*"] }
// On a container host (e.g. Fly.io) make sure the Dockerfile copies ./assets into the runtime image.
```

### `scripts/render-sample.ts` (golden-test helper)

```ts
// Golden-test helper:  npx tsx scripts/render-sample.ts reference/sample-data.json out.pdf
import fs from "node:fs";
import path from "node:path";
import { renderSkillsChecklistPdf } from "../lib/pdf/skills-checklist-pdf";

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) throw new Error("usage: tsx scripts/render-sample.ts data.json out.pdf");
const data = JSON.parse(fs.readFileSync(inFile, "utf8"));
renderSkillsChecklistPdf(data, { assetsDir: path.join(process.cwd(), "assets", "skills-checklist") }).then((buf) => {
  fs.writeFileSync(outFile, buf);
  console.log(`wrote ${outFile} (${buf.length} bytes)`);
});
```

### `scripts/compare-pdfs.py` (golden comparison)

```python
"""Golden comparison: python compare-pdfs.py approved-design.pdf candidate.pdf
Rasterises both at 100 dpi and reports differing pixels per page. Needs: poppler (pdftoppm), pillow, numpy."""
import subprocess, sys, tempfile, os
from PIL import Image
import numpy as np
a, b = sys.argv[1], sys.argv[2]
with tempfile.TemporaryDirectory() as d:
    for tag, f in (("a", a), ("b", b)):
        subprocess.run(["pdftoppm", "-r", "100", "-png", f, os.path.join(d, tag)], check=True)
    pa = sorted(x for x in os.listdir(d) if x.startswith("a"))
    pb = sorted(x for x in os.listdir(d) if x.startswith("b"))
    print("pages:", len(pa), "vs", len(pb))
    ok = len(pa) == len(pb)
    for x, y in zip(pa, pb):
        ia = np.asarray(Image.open(os.path.join(d, x)).convert("RGB")).astype(int)
        ib = np.asarray(Image.open(os.path.join(d, y)).convert("RGB")).astype(int)
        if ia.shape != ib.shape:
            print(x, "size mismatch"); ok = False; continue
        n = int((np.abs(ia - ib).max(axis=2) > 40).sum())
        print(x, "differing pixels:", n)
        ok &= n < 300   # tolerance: a few hairline/dash pixels
    print("PASS" if ok else "FAIL"); sys.exit(0 if ok else 1)
```
