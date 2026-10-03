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
 *
 * Two documented additive extensions over the approved handoff (everything else is
 * unchanged; the golden test against reference/approved-design.pdf still passes):
 *  1. `rating: null` rows (candidate marked the skill N/A) render a dashed neutral
 *     ring with "N/A" centred - the same visual language as the design's own dashed
 *     N/A last-performed chip (#B9C3CD border, #8A97A3 text). Averages/proficient
 *     counts use rated rows only, exactly like the app's summarizeAnswers().
 *  2. `attestation.signatureImage` (data URL) embeds a Draw/Upload signature image
 *     above the signature line; typed signatures keep the Lora Italic text.
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
    skills: { name: string; rating: Rating | null; lastPerformed: LastPerformed }[];
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
    /** data:image/png|jpeg;base64,... - drawn or uploaded signature (additive). */
    signatureImage?: string;
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
const DONUT_TRACK = "#EAF0EC";
const NAVY = "#1E3A5F";
const STEEL = "#6F8FB0";
const PALE = "#C3CCD5";
const NA_DOT = "#DDE3E9";
const LVL_LABEL: Record<Rating, string> = { 4: "Proficient", 3: "Experienced", 2: "Limited", 1: "No theory" };
const LVL_LEGEND: Record<Rating, string> = { 1: "No theory / experience", 2: "Limited", 3: "Experienced", 4: "Proficient" };

interface RecStyle { label: string; fill: string; text: string; border: string | null; bar: string }
const REC: Record<LastPerformed, RecStyle> = {
  within_3_months: { label: "Within 3 months", fill: NAVY, text: WHITE, border: null, bar: NAVY },
  within_6_months: { label: "Within 6 months", fill: STEEL, text: WHITE, border: null, bar: STEEL },
  over_6_months: { label: "6+ months ago", fill: "#E3E8ED", text: "#566273", border: null, bar: PALE },
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
      if (s.rating != null && ![1, 2, 3, 4].includes(s.rating)) throw new Error(`Bad rating for "${s.name}": ${s.rating}`);
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
  const ratedAll = all.filter((s) => s.rating != null);
  const AVG = ratedAll.length ? ratedAll.reduce((a, s) => a + (s.rating as Rating), 0) / ratedAll.length : 0;
  const RECENT = all.filter((s) => s.lastPerformed === "within_3_months").length;
  const cnt = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Rating, number>;
  all.forEach((s) => { if (s.rating != null) cnt[s.rating]++; });
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

  /** Clockwise-from-12-o'clock arc as cubic Beziers (butt caps cut radially, like the design). */
  const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
    const P = (a: number): [number, number] => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const segs = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2)));
    const [x0, y0] = P(a0);
    let d = `M ${x0.toFixed(3)} ${y0.toFixed(3)}`;
    for (let i = 0; i < segs; i++) {
      const t0 = a0 + ((a1 - a0) * i) / segs;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / segs;
      const k = (4 / 3) * Math.tan((t1 - t0) / 4);
      const [xa, ya] = P(t0);
      const [xb, yb] = P(t1);
      d += ` C ${(xa + k * r * Math.cos(t0)).toFixed(3)} ${(ya + k * r * Math.sin(t0)).toFixed(3)} ${(xb - k * r * Math.cos(t1)).toFixed(3)} ${(yb - k * r * Math.sin(t1)).toFixed(3)} ${xb.toFixed(3)} ${yb.toFixed(3)}`;
    }
    return d;
  };
  /** Donut = light track ring + clockwise segments from 12 o'clock (centerline r, lw 13). */
  const donut = (cx: number, cy: number, parts: [number, string][]) => {
    doc.lineWidth(13).lineCap("butt");
    doc.circle(cx, cy, 30).stroke(DONUT_TRACK as any);
    const tot = parts.reduce((a, p) => a + p[0], 0);
    if (!tot) return;
    let a = 0;
    const GAP = (2 * Math.PI) / 180; // 2° padding between segments, like the design
    for (const [n, col] of parts) {
      if (!n) continue;
      const sweep = (2 * Math.PI * n) / tot;
      if (sweep >= 2 * Math.PI - 1e-6) {
        doc.circle(cx, cy, 30).stroke(col as any);
      } else {
        const s0 = a + (a > 0 || a + sweep < 2 * Math.PI ? GAP / 2 : 0);
        doc.path(arcPath(cx, cy, 30, s0, a + sweep - GAP / 2)).stroke(col as any);
      }
      a += sweep;
    }
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
  /** N/A rating row (additive): dashed neutral ring, same language as the design's dashed N/A chip. */
  const ringNA = (cx: number, cy: number, r = 8.2) => {
    doc.lineWidth(1.8).dash(2.2, { space: 1.8 });
    doc.circle(cx, cy, r).stroke("#B9C3CD");
    doc.undash();
    text(cx, cy + 2.2, "N/A", "PB", 5.4, "#8A97A3", "c");
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

  // ---- Summary at a glance (white card; two colour donuts with count legends)
  const ST0 = CT + CH + 16;
  const SUM_H = 128;
  rrect(M, ST0, CW, SUM_H, 14, WHITE, LINE);
  text(M + 20, ST0 + 24, "Summary at a glance", "PB", 9.5, TEAL);
  text(W - M - 20, ST0 + 24, `${N} skills assessed`, "PM", 7.6, SLATE, "r");

  const mixLegend = (
    lx: number,
    title: string,
    rows: [string, number, string][],
    countEndX: number,
    pctEndX: number,
  ) => {
    text(lx, ST0 + 52, title, "PM", 7, SLATE);
    rows.forEach(([lab, n, col], i) => {
      const by = ST0 + 68 + i * 15; // text baseline; row pitch 15pt
      doc.circle(lx + 3, by - 2.6, 3).fill(col as any);
      text(lx + 12, by, lab, "PM", 7.6, INK);
      text(countEndX, by, String(n), "PB", 7.6, INK, "r");
      text(pctEndX, by, `${Math.round((100 * n) / Math.max(N, 1))}%`, "P", 7.2, SLATE, "r");
    });
  };

  // Left donut: rating mix of rated rows, centre = average of 4
  donut(M + 58, ST0 + 80, [[cnt[4], LVL[4]], [cnt[3], LVL[3]], [cnt[2], LVL[2]], [cnt[1], LVL[1]]]);
  text(M + 58, ST0 + 84, AVG.toFixed(1), "PB", 15, INK, "c");
  text(M + 58, ST0 + 94, "avg of 4", "P", 6.4, SLATE, "c");
  mixLegend(
    M + 112, "Rating mix",
    [["Proficient", cnt[4], LVL[4]], ["Experienced", cnt[3], LVL[3]], ["Limited", cnt[2], LVL[2]], ["No theory", cnt[1], LVL[1]]],
    M + 221, M + 251,
  );
  line(M + 266, ST0 + 40, M + 266, ST0 + 114, LINE, 0.8);

  // Right donut: last-performed mix, centre = % recent (within 3 months)
  donut(M + 319, ST0 + 80, [
    [rcnt.within_3_months, NAVY],
    [rcnt.within_6_months, STEEL],
    [rcnt.over_6_months, PALE],
    [rcnt.na, NA_DOT],
  ]);
  text(M + 319, ST0 + 84, `${Math.round((100 * RECENT) / Math.max(N, 1))}%`, "PB", 15, INK, "c");
  text(M + 319, ST0 + 94, "recent", "P", 6.4, SLATE, "c");
  mixLegend(
    M + 373, "Last performed",
    [["Within 3 months", rcnt.within_3_months, NAVY], ["Within 6 months", rcnt.within_6_months, STEEL], ["6+ months ago", rcnt.over_6_months, PALE], ["N/A", rcnt.na, NA_DOT]],
    M + 482, W - M - 20,
  );

  // ---- Category overview
  const OT = ST0 + SUM_H + 14;
  const OH = 38 + cats.length * 17 + 22;
  rrect(M, OT, CW, OH, 14, MINT);
  text(M + 18, OT + 22, "Category overview", "PB", 9.5, TEAL);
  text(W - M - 18, OT + 22, "Average rating and recent activity by category", "PL", 7.4, SLATE, "r");
  let yy = OT + 44;
  for (const cat of cats) {
    const rs = (cat.skills.filter((s) => s.rating != null) as { rating: Rating }[]).map((s) => s.rating);
    const avg = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
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
    text(M + 330, yy + 4, `${pr} of ${cat.skills.length} Proficient`, "P", 7.2, SLATE);
    text(W - M - 18, yy + 4, `${rc} of ${cat.skills.length} recent`, "P", 7.2, SLATE, "r");
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
      if (s.rating != null) {
        ring(RX, y + rh / 2, s.rating);
        levelChip(RX + 14, y + rh / 2, s.rating);
      } else {
        ringNA(RX, y + rh / 2);
      }
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
  const hasSig = !!(att.signatureName || att.signatureImage);
  if (att.signatureImage) {
    // Drawn / uploaded signature: embed the image above the line (additive extension).
    try {
      const b64 = String(att.signatureImage).replace(/^data:image\/\w+;base64,/, "");
      doc.image(Buffer.from(b64, "base64"), sx + 6, sy - 10, { fit: [200, 30], align: "left" });
    } catch { /* ignore malformed image data; the line stays blank */ }
  } else if (att.signatureName) {
    text(sx + 6, sy + 16, att.signatureName, "Sig", 24, INK);
  }
  text(sx, sy + 34, "Candidate signature", "P", 6.8, SLATE);
  if (hasSig) text(sx + 215, sy + 34, "Signed electronically", "PM", 6.8, LEAF_D, "r");
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
