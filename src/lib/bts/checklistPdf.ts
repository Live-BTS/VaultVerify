import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument, StandardFonts, rgb, LineCapStyle,
  type PDFFont, type PDFPage, type RGB, type PDFImage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  LAST_PERFORMED, recencyLabel,
  summarizeAnswers, ATTESTATION_STATEMENTS, type SkillAnswer,
} from "@/lib/bts/checklistShared";

// ── VaultVerify Skills Checklist PDF — reference-matched layout ─────────
// Reproduces the approved sample (VaultVerify-Skills-Checklist-Sam) 1:1:
// teal header + candidate card, "Summary at a glance" dual donuts with side
// legends, sage "Category overview" bars, rating-scale / last-performed
// legends, navy table band with per-skill progress rings + recency pills,
// "Additional questions" band with toggle + note answers, and the sage
// attestation card with e-signature. Built in a 1020x1320 design space
// scaled x0.6 onto Letter (612x792pt) — same as the reference file.

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function sanitize(text: string): string {
  return (text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2011\u00A0]/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");
}

export const RATING_4_LABELS: Record<number, string> = {
  1: "No theory and/or experience",
  2: "Limited experience",
  3: "Experienced / minimal support needed",
  4: "Proficient",
};

export interface ChecklistPdfItem {
  skill: string; questionType: string; value: number | string | null;
  na: boolean; highRisk: boolean; lastPerformed?: string | null;
}

export interface ChecklistPdfData {
  account: { name: string; email: string; title: string };
  completion: {
    profession: string; jobTitle: string; specialty: string; specialtyLabel: string;
    yearsExperience: number; source: string;
    completedAt: Date; expiresAt: Date;
  };
  categories: { name: string; items: ChecklistPdfItem[] }[];
  additional?: { id: string; prompt: string; kind: string; value: string | null }[];
  attestation?: { mode: string; signature: string; printedName?: string; signedAt?: string } | null;
}

// ── design space: 1020x1320 px, rendered at x0.6 on Letter ──
const S = 0.6;
const PAGE_W = 612;
const PAGE_H = 792;
const X = (v: number) => v * S;
const Y = (v: number) => PAGE_H - v * S; // design y measured from page TOP

const C = {
  band: hexToRgb("#03363d"),
  greenLine: hexToRgb("#4daa57"),
  headingTeal: hexToRgb("#0f5257"),
  ink: hexToRgb("#253c38"),
  dark: hexToRgb("#1f3532"),
  navyText: hexToRgb("#0b2e33"),
  label: hexToRgb("#8ba09b"),
  muted: hexToRgb("#6b807b"),
  faint: hexToRgb("#9db3ae"),
  legendText: hexToRgb("#4a5f5b"),
  divider: hexToRgb("#e2eae6"),
  dividerSoft: hexToRgb("#e8eeec"),
  cardBorder: hexToRgb("#e2eae6"),
  sage: hexToRgb("#eef6f1"),
  pillSage: hexToRgb("#ddede3"),
  pillSageText: hexToRgb("#35635e"),
  track: hexToRgb("#c9ddd0"),
  barGreen: hexToRgb("#4daa57"),
  tableNavy: hexToRgb("#0b2e33"),
  headGreen: hexToRgb("#8be39a"),
  navy: hexToRgb("#1e3a5f"),
  steel: hexToRgb("#6f8fb0"),
  paleSeg: hexToRgb("#c3ccd5"),
  naSeg: hexToRgb("#e7ecef"),
  palePill: hexToRgb("#e3e8ed"),
  palePillText: hexToRgb("#566273"),
  naBorder: hexToRgb("#b9c6cd"),
  naText: hexToRgb("#8ba09b"),
  ringRest: hexToRgb("#e4e8ea"),
  yes: hexToRgb("#2f8a3e"),
  unsel: hexToRgb("#e9efec"),
  unselText: hexToRgb("#8a9a96"),
  accent: hexToRgb("#4daa57"),
  sigLine: hexToRgb("#9fb0ac"),
  genText: hexToRgb("#35635e"),
  white: rgb(1, 1, 1),
  hdrSub: hexToRgb("#c2d2d3"),
  tagline: hexToRgb("#b7c9cb"),
};

const RATING_VIS: Record<number, { ring: string; pillBg: string; pillText: string; legend: string; short: string }> = {
  1: { ring: "#e5484d", pillBg: "#fde7e7", pillText: "#c94040", legend: "No theory / experience", short: "No theory" },
  2: { ring: "#f2a20c", pillBg: "#fdf0d9", pillText: "#b57313", legend: "Limited", short: "Limited" },
  3: { ring: "#2f80ed", pillBg: "#dce9fb", pillText: "#2f6cbd", legend: "Experienced", short: "Experienced" },
  4: { ring: "#12a150", pillBg: "#d9f0e3", pillText: "#0d743a", legend: "Proficient", short: "Proficient" },
};

// SVG helpers (design-space units, drawn with scale S)
function pt(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}
function wedgePath(ro: number, ri: number, d1: number, d2: number): string {
  const large = d2 - d1 > 180 ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  const [x1, y1] = pt(ro, d1), [x2, y2] = pt(ro, d2);
  const [x3, y3] = pt(ri, d2), [x4, y4] = pt(ri, d1);
  return `M ${f(x1)} ${f(y1)} A ${f(ro)} ${f(ro)} 0 ${large} 1 ${f(x2)} ${f(y2)} L ${f(x3)} ${f(y3)} A ${f(ri)} ${f(ri)} 0 ${large} 0 ${f(x4)} ${f(y4)} Z`;
}
function rrectPath(w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  const f = (n: number) => n.toFixed(2);
  return `M ${f(rr)} 0 H ${f(w - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(w - rr)} ${f(rr)} V ${f(h - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(w - rr)} ${f(h)} H ${f(rr)} A ${f(rr)} ${f(rr)} 0 0 1 0 ${f(h - rr)} V ${f(rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} 0 Z`;
}

async function embedSignatureImage(pdf: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  try {
    const m = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/.exec(dataUrl.trim());
    if (!m) return null;
    const buf = Buffer.from(m[2], "base64");
    return /^png$/i.test(m[1]) ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
  } catch { return null; }
}

export async function buildChecklistPdf(data: ChecklistPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const loadFont = async (file: string, fallback: StandardFonts): Promise<PDFFont> => {
    try {
      return await pdf.embedFont(await readFile(path.join(process.cwd(), "public", "fonts", file)), { subset: true });
    } catch { return pdf.embedFont(fallback); }
  };
  const fReg = await loadFont("Poppins-Regular.ttf", StandardFonts.Helvetica);
  const fMed = await loadFont("Poppins-Medium.ttf", StandardFonts.Helvetica);
  const fSemi = await loadFont("Poppins-SemiBold.ttf", StandardFonts.HelveticaBold);
  const fBold = await loadFont("Poppins-Bold.ttf", StandardFonts.HelveticaBold);
  const fScript = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  let tile: PDFImage | null = null;
  try { tile = await pdf.embedPng(await readFile(path.join(process.cwd(), "public", "logo-tile.png"))); } catch { /* optional */ }

  let pg: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = 130; // design-space cursor (below page-1 header)
  let tableBandPending = true; // navy Skill/Rating/Last-performed band: once per page

  const wrap = (t: string, maxW: number, size: number, f: PDFFont): string[] => {
    const words = sanitize(t).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const trial = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(trial, size * S) / S > maxW) { if (cur) lines.push(cur); cur = w; } else cur = trial;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const tw = (t: string, size: number, f: PDFFont) => f.widthOfTextAtSize(sanitize(t), size * S) / S;

  // text with design-space coords; y = BASELINE from page top
  const txt = (
    t: string, x: number, yD: number,
    o: { size: number; f?: PDFFont; color?: RGB; align?: "left" | "right" | "center"; opacity?: number },
  ) => {
    const f = o.f ?? fReg;
    const s = sanitize(t);
    let xPt = X(x);
    if (o.align === "right") xPt = X(x) - f.widthOfTextAtSize(s, o.size * S);
    if (o.align === "center") xPt = X(x) - f.widthOfTextAtSize(s, o.size * S) / 2;
    pg.drawText(s, { x: xPt, y: Y(yD), size: o.size * S, font: f, color: o.color ?? C.ink, opacity: o.opacity ?? 1 });
  };

  const rrect = (
    x: number, yD: number, w: number, h: number, r: number,
    o: { fill?: RGB; border?: RGB; bw?: number; dash?: number[]; opacity?: number } = {},
  ) => {
    const hasBorder = !!o.border;
    pg.drawSvgPath(rrectPath(w, h, r), {
      x: X(x), y: Y(yD), scale: S,
      color: o.fill,
      ...(hasBorder ? { borderColor: o.border, borderWidth: o.bw ?? 1, borderDashArray: o.dash, borderOpacity: o.opacity ?? 1 } : {}),
      opacity: o.opacity ?? 1,
    });
  };

  const circle = (cx: number, cy: number, r: number, o: { fill?: RGB; border?: RGB; bw?: number; opacity?: number } = {}) => {
    pg.drawCircle({
      x: X(cx), y: Y(cy), size: r * S,
      color: o.fill, borderColor: o.border, borderWidth: o.bw ?? 1, opacity: o.opacity ?? 1,
      borderOpacity: o.opacity ?? 1,
    });
  };

  const ln = (x1: number, y1: number, x2: number, y2: number, color: RGB, w = 1) => {
    pg.drawLine({ start: { x: X(x1), y: Y(y1) }, end: { x: X(x2), y: Y(y2) }, thickness: w * S, color });
  };

  const wedge = (cx: number, cy: number, ro: number, ri: number, d1: number, d2: number, color: RGB) => {
    if (d2 - d1 <= 0.5) return;
    pg.drawSvgPath(wedgePath(ro, ri, d1, d2), { x: X(cx), y: Y(cy), scale: S, color });
  };

  // quartered progress ring: value/4 colored quarters, rest light gray, notched joins
  const ring = (cx: number, cy: number, r: number, value: number) => {
    const band = r * 0.27;
    for (let q = 0; q < 4; q++) {
      const d1 = q * 90 + 3, d2 = (q + 1) * 90 - 3;
      wedge(cx, cy, r, r - band, d1, d2, q < value ? hexToRgb(RATING_VIS[value].ring) : C.ringRest);
    }
  };

  const dots = (x1: number, x2: number, cy: number, color: RGB) => {
    if (x2 - x1 < 8) return;
    pg.drawSvgPath(`M 0 0 H ${(x2 - x1).toFixed(1)}`, {
      x: X(x1), y: Y(cy), scale: S, borderColor: color, borderWidth: 1.1,
      borderDashArray: [0.1, 4.2], borderLineCap: LineCapStyle.Round,
    });
  };

  const clockIcon = (cx: number, cy: number, color: RGB, r = 5) => {
    circle(cx, cy, r, { border: color, bw: 1.2 });
    ln(cx, cy, cx, cy - r * 0.62, color, 1.1);
    ln(cx, cy, cx + r * 0.5, cy + r * 0.1, color, 1.1);
  };

  // recency pill, right-aligned to rightEdge (or drawn left-to-right when rightEdge=null)
  const recencyPill = (key: string | null | undefined, cy: number, rightEdge: number | null, xHint?: number) => {
    if (!key) return null;
    const label = key === "na" ? "N/A" : recencyLabel(key) || "N/A";
    const size = 11.5;
    const twD = tw(label, size, fSemi);
    const w = key === "na" ? twD + 26 : twD + 46;
    const h = 24;
    const left = rightEdge != null ? rightEdge - w : (xHint ?? 0);
    const top = cy - h / 2;
    if (key === "3") rrect(left, top, w, h, 12, { fill: C.navy });
    else if (key === "6") rrect(left, top, w, h, 12, { fill: C.steel });
    else if (key === "6+") rrect(left, top, w, h, 12, { fill: C.palePill });
    else rrect(left, top, w, h, 12, { border: C.naBorder, bw: 1, dash: [3, 2.4] });
    const iconColor = key === "3" || key === "6" ? C.white : key === "6+" ? C.palePillText : C.naText;
    const textColor = key === "3" || key === "6" ? C.white : key === "6+" ? C.palePillText : C.naText;
    if (key !== "na") clockIcon(left + 15, cy, iconColor, 4.6);
    txt(label, left + (key === "na" ? w / 2 : 27), cy + 4.2, { size, f: fSemi, color: textColor, align: key === "na" ? "center" : "left" });
    return left;
  };

  const labelPill = (label: string, bgHex: string, fgHex: string, x: number, cy: number) => {
    const w = tw(label, 11.5, fSemi) + 22;
    rrect(x, cy - 12, w, 24, 12, { fill: hexToRgb(bgHex) });
    txt(label, x + w / 2, cy + 4.2, { size: 11.5, f: fSemi, color: hexToRgb(fgHex), align: "center" });
    return w;
  };

  const fitText = (s: string, maxW: number, size: number, f: PDFFont): string => {
    if (tw(s, size, f) <= maxW) return s;
    let out = s;
    while (out.length > 4 && tw(out + "...", size, f) > maxW) out = out.slice(0, -2);
    return out + "...";
  };

  const fmtDate = (d: Date | string) => sanitize(new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }));
  const subLine = `Skills Checklist: ${sanitize(data.account.name)}, ${sanitize(data.completion.jobTitle || "RN")} (${sanitize(data.completion.specialtyLabel || data.completion.specialty)})`;

  const newPage = () => {
    pg = pdf.addPage([PAGE_W, PAGE_H]);
    // slim header band + green line
    pg.drawRectangle({ x: 0, y: Y(88), width: PAGE_W, height: 88 * S, color: C.band });
    pg.drawRectangle({ x: 0, y: Y(91), width: PAGE_W, height: 3 * S, color: C.greenLine });
    if (tile) pg.drawImage(tile, { x: X(66), y: Y(68), width: 48 * S, height: 48 * S });
    txt("VaultVerify", 130, 57, { size: 22, f: fSemi, color: C.white });
    txt(subLine, 953, 53, { size: 15, f: fMed, color: C.white, align: "right" });
    y = 112;
    tableBandPending = true;
  };

  const ensure = (needed: number) => { if (y + needed > 1190) newPage(); };

  // ── PAGE 1 header band ──
  pg.drawRectangle({ x: 0, y: Y(130), width: PAGE_W, height: 130 * S, color: C.band });
  circle(900, 2, 125, { fill: C.white, opacity: 0.035 });
  circle(1018, 54, 75, { fill: C.white, opacity: 0.03 });
  if (tile) pg.drawImage(tile, { x: X(68), y: Y(120), width: 76 * S, height: 76 * S });
  txt("VaultVerify", 178, 79, { size: 34, f: fBold, color: C.white });
  txt("References, verified. Skills, proven.", 180, 102, { size: 14, color: C.tagline });
  txt("Skills Checklist", 953, 71, { size: 24, f: fBold, color: C.white, align: "right" });
  txt("Self-assessment completed by the candidate", 953, 96, { size: 13.5, color: C.hdrSub, align: "right" });
  y = 131;

  // ── Candidate card ──
  const acc = data.account;
  const c = data.completion;
  rrect(66, 131, 888, 152, 24, { fill: C.white, border: C.cardBorder, bw: 0.8 });
  circle(123, 191, 28, { fill: C.headingTeal });
  txt(sanitize(acc.name).charAt(0).toUpperCase() || "?", 123, 199, { size: 24, f: fSemi, color: C.white, align: "center" });
  txt(acc.name, 178, 200, { size: 30, f: fSemi, color: C.dark });
  // pills: title / specialty / profession
  let px = 178;
  for (const p of [c.jobTitle || "RN", c.specialtyLabel || c.specialty, c.profession || "Nursing"].filter(Boolean)) {
    const label = sanitize(p);
    const w = tw(label, 12.5, fMed) + 22;
    rrect(px, 210, w, 26, 13, { fill: C.pillSage });
    txt(label, px + w / 2, 227, { size: 12.5, f: fMed, color: C.pillSageText, align: "center" });
    px += w + 10;
  }
  ln(465, 152, 465, 262, C.dividerSoft, 1);
  const emailFit = (s: string) => tw(s, 14, fMed) > 196 ? 12 : 14;
  const emailSize = emailFit(acc.email);
  // row 1
  txt("Email", 493, 172, { size: 12.5, color: C.label });
  txt(acc.email, 493, 194, { size: emailSize, f: fMed, color: C.ink });
  txt("Self-reported experience", 708, 172, { size: 12.5, color: C.label });
  txt(`${c.yearsExperience} yr(s)`, 708, 194, { size: 14, f: fMed, color: C.ink });
  // row 2
  txt("Completed", 493, 232, { size: 12.5, color: C.label });
  txt(fmtDate(c.completedAt), 493, 254, { size: 14, f: fMed, color: C.ink });
  txt("Valid until", 583, 232, { size: 12.5, color: C.label });
  const vuStr = `${fmtDate(c.expiresAt)} (1 year)`;
  const vuSize = tw(vuStr, 14, fMed) > 115 ? 12.5 : 14;
  txt(vuStr, 583, 254, { size: vuSize, f: fMed, color: C.ink });
  txt("Source", 708, 232, { size: 12.5, color: C.label });
  txt(c.source === "RECRUITER" ? "Requested by a recruiter" : "Self-requested via VaultVerify", 708, 254, { size: 14, f: fSemi, color: C.ink });
  y = 283;

  // ── Summary at a glance ──
  const flat: SkillAnswer[] = data.categories.flatMap((cat) =>
    cat.items.map((it) => ({
      category: cat.name, skill: it.skill, questionType: it.questionType,
      value: it.value, na: it.na, highRisk: it.highRisk, lastPerformed: it.lastPerformed ?? null,
    })),
  );
  const summary = summarizeAnswers(flat);

  rrect(66, 309, 888, 214, 20, { fill: C.white, border: C.cardBorder, bw: 0.8 });
  txt("Summary at a glance", 98, 352, { size: 19, f: fSemi, color: C.headingTeal });
  txt(`${summary.total} skills assessed`, 922, 352, { size: 13.5, color: C.label, align: "right" });
  ln(510, 385, 510, 500, C.dividerSoft, 1);

  const donutCy = 448, ro = 57, ri = 38;
  const donut = (
    cx: number, segs: { count: number; color: RGB }[], centerMain: string, centerSub: string, subColor: RGB,
  ) => {
    const total = segs.reduce((s, g) => s + g.count, 0);
    if (!total) {
      circle(cx, donutCy, (ro + ri) / 2, { border: C.ringRest, bw: ro - ri });
    } else if (segs.filter((g) => g.count > 0).length === 1) {
      circle(cx, donutCy, (ro + ri) / 2, { border: segs.find((g) => g.count > 0)!.color, bw: ro - ri });
    } else {
      let acc2 = 0;
      for (const g of segs) {
        if (!g.count) continue;
        const span = (g.count / total) * 360;
        wedge(cx, donutCy, ro, ri, acc2 + 1.2, acc2 + span - 1.2, g.color);
        acc2 += span;
      }
    }
    txt(centerMain, cx, donutCy + 9, { size: 26, f: fSemi, color: C.navyText, align: "center" });
    txt(centerSub, cx, donutCy + 30, { size: 12.5, color: subColor, align: "center" });
  };

  const ratedTotal = summary.rated || 0;
  donut(163, [
    { count: summary.mix[4], color: hexToRgb(RATING_VIS[4].ring) },
    { count: summary.mix[3], color: hexToRgb(RATING_VIS[3].ring) },
    { count: summary.mix[2], color: hexToRgb(RATING_VIS[2].ring) },
    { count: summary.mix[1], color: hexToRgb(RATING_VIS[1].ring) },
  ], summary.avg == null ? "-" : summary.avg.toFixed(1), "avg of 4", C.label);
  donut(612, [
    { count: summary.recency["3"], color: C.navy },
    { count: summary.recency["6"], color: C.steel },
    { count: summary.recency["6+"], color: C.paleSeg },
    { count: summary.recency.na, color: C.naSeg },
  ], summary.total ? `${summary.recentPct ?? 0}%` : "-", "recent", C.label);

  // legends inside summary card
  const legendRow = (
    x: number, baseY: number, rows: { label: string; count: string; pct: string; colorHex: string }[],
    countRight: number, pctRight: number,
  ) => {
    let ry = baseY;
    for (const r of rows) {
      circle(x + 6, ry - 5, 5.5, { fill: hexToRgb(r.colorHex) });
      txt(r.label, x + 20, ry, { size: 14, color: C.ink });
      txt(r.count, countRight, ry, { size: 14, f: fSemi, color: C.dark, align: "right" });
      txt(r.pct, pctRight, ry, { size: 13, color: C.label, align: "right" });
      ry += 29;
    }
  };
  txt("Rating mix", 250, 398, { size: 15, f: fSemi, color: C.dark });
  const pctOf = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "0%");
  legendRow(250, 428, [
    { label: RATING_VIS[4].short, count: String(summary.mix[4]), pct: pctOf(summary.mix[4], ratedTotal), colorHex: RATING_VIS[4].ring },
    { label: RATING_VIS[3].short, count: String(summary.mix[3]), pct: pctOf(summary.mix[3], ratedTotal), colorHex: RATING_VIS[3].ring },
    { label: RATING_VIS[2].short, count: String(summary.mix[2]), pct: pctOf(summary.mix[2], ratedTotal), colorHex: RATING_VIS[2].ring },
    { label: RATING_VIS[1].short, count: String(summary.mix[1]), pct: pctOf(summary.mix[1], ratedTotal), colorHex: RATING_VIS[1].ring },
  ], 418, 462);
  txt("Last performed", 700, 398, { size: 15, f: fSemi, color: C.dark });
  legendRow(700, 428, [
    { label: "Within 3 months", count: String(summary.recency["3"]), pct: pctOf(summary.recency["3"], summary.total), colorHex: "#1e3a5f" },
    { label: "Within 6 months", count: String(summary.recency["6"]), pct: pctOf(summary.recency["6"], summary.total), colorHex: "#6f8fb0" },
    { label: "6+ months ago", count: String(summary.recency["6+"]), pct: pctOf(summary.recency["6+"], summary.total), colorHex: "#c3ccd5" },
    { label: "N/A", count: String(summary.recency.na), pct: pctOf(summary.recency.na, summary.total), colorHex: "#e7ecef" },
  ], 868, 912);
  y = 546;

  // ── Category overview (sage card) ──
  const cats = summary.categories;
  if (cats.length) {
    const cardH = 96 + cats.length * 29;
    rrect(66, y, 888, cardH, 20, { fill: C.sage });
    txt("Category overview", 98, y + 38, { size: 19, f: fSemi, color: C.headingTeal });
    txt("Average rating and recent activity by category", 922, y + 38, { size: 13.5, color: C.label, align: "right" });
    let ry = y + 76;
    for (const cat of cats) {
      const cname = fitText(cat.name, 250, 14.5, fSemi);
      txt(cname, 98, ry, { size: 14.5, f: fSemi, color: C.ink });
      rrect(360, ry - 7, 180, 9, 4.5, { fill: C.track });
      const fillW = Math.max(cat.avg ? 8 : 0, ((cat.avg ?? 0) / 4) * 180);
      if (fillW > 2) rrect(360, ry - 7, fillW, 9, 4.5, { fill: C.barGreen });
      txt(cat.avg == null ? "-" : cat.avg.toFixed(1), 560, ry, { size: 14.5, f: fSemi, color: C.headingTeal });
      txt(`${cat.proficient} of ${cat.total} Proficient`, 615, ry, { size: 13.5, color: C.muted });
      txt(`${cat.recent} of ${cat.total} recent`, 922, ry, { size: 13.5, color: C.muted, align: "right" });
      ry += 29;
    }
    txt("Recent means last performed within 3 months.", 98, ry + 3, { size: 12.5, color: C.faint });
    y += cardH;
  }
  y += 38;

  // ── Rating scale + Last performed legends ──
  txt("Rating scale", 66, y, { size: 15, f: fSemi, color: C.dark });
  let lx = 190;
  for (const v of [1, 2, 3, 4] as const) {
    ring(lx + 13, y - 5, 13, v);
    txt(String(v), lx + 13, y - 1, { size: 12.5, f: fSemi, color: hexToRgb(RATING_VIS[v].ring), align: "center" });
    txt(RATING_VIS[v].legend, lx + 34, y, { size: 12.5, color: C.legendText });
    lx += 34 + tw(RATING_VIS[v].legend, 12.5, fReg) + 28;
  }
  y += 40;
  txt("Last performed", 66, y, { size: 15, f: fSemi, color: C.dark });
  let px2 = 66 + tw("Last performed", 15, fSemi) + 28;
  for (const r of LAST_PERFORMED) {
    const left = recencyPill(r.key, y - 8, null, px2);
    px2 = (left ?? px2) + tw(r.key === "na" ? "N/A" : recencyLabel(r.key), 11.5, fSemi) + (r.key === "na" ? 26 : 46) + 16;
  }
  y += 22;

  // ── Skill table ──
  const drawTableBand = () => {
    rrect(66, y, 888, 58, 16, { fill: C.tableNavy });
    txt("Skill", 98, y + 36, { size: 15.5, f: fSemi, color: C.white });
    txt("Rating", 536, y + 36, { size: 15.5, f: fSemi, color: C.headGreen, align: "center" });
    txt("Last performed", 803, y + 36, { size: 15.5, f: fSemi, color: C.headGreen, align: "center" });
    y += 58 + 14;
  };

  const drawRow = (it: ChecklistPdfItem, divider: boolean) => {
    if (divider) ln(66, y, 954, y, C.dividerSoft, 0.8);
    const base = y + 23, cy = y + 18;
    const name = fitText(sanitize(it.skill), 380, 14, fReg);
    txt(name, 98, base, { size: 14, color: C.ink });
    dots(98 + tw(name, 14, fReg) + 12, 500, base - 4, C.track);
    if (it.questionType === "rating_1_4") {
      if (it.na) {
        for (let q = 0; q < 4; q++) wedge(536, cy, 13, 9.5, q * 90 + 3, (q + 1) * 90 - 3, C.ringRest);
        txt("N/A", 536, cy + 4, { size: 9, f: fSemi, color: C.naText, align: "center" });
        labelPill("N/A", "#f2f6f4", "#8ba09b", 560, cy);
      } else {
        const v = Number(it.value);
        if (v >= 1 && v <= 4) {
          ring(536, cy, 13, v);
          txt(String(v), 536, cy + 4.4, { size: 12.5, f: fSemi, color: hexToRgb(RATING_VIS[v].ring), align: "center" });
          labelPill(RATING_VIS[v].legend, RATING_VIS[v].pillBg, RATING_VIS[v].pillText, 560, cy);
        }
      }
    } else if (it.questionType === "yes_no") {
      const yes = String(it.value ?? "").toLowerCase() === "yes";
      rrect(522, cy - 12, 30, 24, 12, { fill: yes ? hexToRgb("#e2f4e8") : hexToRgb("#fdecec") });
      txt(yes ? "YES" : "NO", 537, cy + 4, { size: 9.5, f: fSemi, color: yes ? hexToRgb("#1f7a4a") : hexToRgb("#d64545"), align: "center" });
    } else {
      let v = sanitize(String(it.value ?? "-"));
      if (tw(v, 11.5, fReg) > 180) v = v.slice(0, 40) + "...";
      txt(v, 722, base, { size: 11.5, color: C.muted, align: "right" });
    }
    recencyPill(it.lastPerformed ?? null, cy, 922);
    y += 36;
  };

  const liveCats = data.categories.filter((c2) => c2.items.length);
  for (const cat of liveCats) {
    let idx = 0;
    while (idx < cat.items.length) {
      const need = (tableBandPending ? 72 : 0) + 32 + 36 + 6;
      if (y + need > 1190) { newPage(); continue; }
      if (tableBandPending) { drawTableBand(); tableBandPending = false; }
      rrect(66, y, 888, 32, 8, { fill: C.sage });
      txt(cat.name + (idx > 0 ? " (continued)" : ""), 98, y + 22, { size: 15, f: fSemi, color: C.headingTeal });
      y += 32 + 8;
      let prevRow = false;
      while (idx < cat.items.length) {
        if (y + 36 + 4 > 1190) break;
        drawRow(cat.items[idx], prevRow);
        prevRow = true;
        idx++;
      }
      if (idx < cat.items.length) newPage();
    }
    y += 14;
  }

  // ── Additional questions ──
  const extras = data.additional ?? [];
  if (extras.length) {
    ensure(58 + 14 + 32 + 46 + 16);
    rrect(66, y, 888, 58, 16, { fill: C.tableNavy });
    txt("Additional questions", 98, y + 36, { size: 15.5, f: fSemi, color: C.white });
    txt("Answer", 922, y + 36, { size: 15.5, f: fSemi, color: C.headGreen, align: "right" });
    y += 72;

    const drawGroup = (title: string, rows: { q: string; kind: string; value: string | null }[]) => {
      if (!rows.length) return;
      ensure(32 + 46 + 12);
      rrect(66, y, 888, 32, 8, { fill: C.sage });
      txt(title, 98, y + 22, { size: 15, f: fSemi, color: C.headingTeal });
      y += 32 + 8;
      let first = true;
      for (const r of rows) {
        if (r.kind === "YES_NO") {
          ensure(46 + 2);
          if (!first) ln(66, y, 954, y, C.divider, 0.8);
          const cy = y + 23;
          txt(r.q, 98, cy + 5, { size: 14.5, color: C.ink });
          const yes = (r.value ?? "").toLowerCase() === "yes";
          const no = (r.value ?? "").toLowerCase() === "no";
          // Yes segment
          rrect(767, cy - 13, 88, 26, 13, { fill: yes ? C.yes : C.unsel });
          if (yes) circle(783, cy, 4, { fill: C.white });
          txt("Yes", 767 + (yes ? 50 : 44), cy + 4.4, { size: 12.5, f: fSemi, color: yes ? C.white : C.unselText, align: "center" });
          // No segment
          rrect(857, cy - 13, 80, 26, 13, { fill: no ? C.navy : C.unsel });
          if (no) circle(921, cy, 4, { fill: C.white });
          txt("No", 857 + (no ? 34 : 40), cy + 4.4, { size: 12.5, f: fSemi, color: no ? C.white : C.unselText, align: "center" });
          y += 46;
        } else {
          const aLines = wrap(r.value || "-", 790, 14, fMed);
          const boxH = Math.max(40, aLines.length * 20 + 16);
          ensure(26 + boxH + 18);
          const qBase = y + 16;
          txt(r.q, 98, qBase, { size: 14, color: C.label });
          const boxTop = y + 26;
          rrect(94, boxTop, 832, boxH, 10, { fill: C.white, border: hexToRgb("#d5e2db"), bw: 1 });
          rrect(94, boxTop, 5, boxH, 2.5, { fill: C.accent });
          aLines.forEach((l2, i) => txt(l2, 116, boxTop + 27 + i * 20, { size: 14, f: fMed, color: C.ink }));
          y = boxTop + boxH + 18;
        }
        first = false;
      }
      y += 12;
    };

    drawGroup("Availability & preferences", extras.filter((q) => q.kind === "YES_NO").map((q) => ({ q: q.prompt, kind: q.kind, value: q.value })));
    drawGroup("Experience notes", extras.filter((q) => q.kind !== "YES_NO").map((q) => ({ q: q.prompt, kind: q.kind, value: q.value })));
    y += 8;
  }

  // ── Candidate attestation ──
  const att = data.attestation;
  if (att && att.signature) {
    const stmts = ATTESTATION_STATEMENTS.map((s) => ({ lines: wrap(s, 735, 14.5, fReg) }));
    let innerH = 108;
    for (const s of stmts) innerH += s.lines.length * 20 + 26;
    innerH += 38 + 10 + 16 + 26 + 20; // sig text + line + labels + bottom pad
    ensure(innerH + 8);
    const top = y;
    rrect(66, top, 888, innerH, 16, { fill: C.sage });
    rrect(66, top, 6, innerH, 3, { fill: C.accent });
    txt("Candidate attestation", 103, top + 44, { size: 21, f: fSemi, color: C.headingTeal });
    txt("Please read and confirm before this checklist is shared.", 103, top + 68, { size: 14, color: C.label });
    let b = top + 108;
    for (const s of stmts) {
      rrect(103, b - 16, 24, 24, 7, { fill: C.yes });
      ln(109, b - 4, 113.5, b + 0.5, C.white, 2.2);
      ln(113.5, b + 0.5, 121, b - 9, C.white, 2.2);
      s.lines.forEach((l2, i) => txt(l2, 143, b + i * 20, { size: 14.5, color: C.ink }));
      b += s.lines.length * 20 + 26;
    }
    const sigBase = b + 38;
    if (att.mode === "type") {
      const sig = sanitize(att.signature).slice(0, 32) || data.account.name;
      txt(sig, 113, sigBase, { size: 30, f: fScript, color: C.dark });
    } else {
      const img = await embedSignatureImage(pdf, att.signature);
      if (img) {
        const ratio = img.width / img.height;
        const h = 52;
        const w = Math.min(340, ratio * h);
        pg.drawImage(img, { x: X(108), y: Y(sigBase + 6), width: w * S, height: (w / ratio) * S });
      } else {
        txt("(signature on file)", 113, sigBase, { size: 16, f: fScript, color: C.dark });
      }
    }
    ln(103, sigBase + 10, 463, sigBase + 10, C.sigLine, 1);
    txt("Candidate signature", 103, sigBase + 28, { size: 13, color: C.label });
    txt("Signed electronically", 463, sigBase + 28, { size: 13, f: fSemi, color: C.yes, align: "right" });
    const printed = sanitize(att.printedName || data.account.name);
    txt(printed, 518, sigBase, { size: 16, f: fMed, color: C.ink });
    ln(518, sigBase + 10, 697, sigBase + 10, C.sigLine, 1);
    txt("Printed name", 518, sigBase + 28, { size: 13, color: C.label });
    const dStr = fmtDate(att.signedAt || c.completedAt);
    txt(dStr, 742, sigBase, { size: 16, f: fMed, color: C.ink });
    ln(742, sigBase + 10, 903, sigBase + 10, C.sigLine, 1);
    txt("Date", 742, sigBase + 28, { size: 13, color: C.label });
    y = top + innerH;
  }

  // ── Footers ──
  const pages = pdf.getPages();
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    pg = pages[i];
    ln(66, 1226, 954, 1226, C.divider, 1);
    const isLast = i === total - 1;
    if (isLast && total > 1) {
      const disc = "Self-reported assessment. Completed once by the candidate and valid for 12 months. Access was granted through a VaultVerify share link; sharing rules (one-time or duration) are logged by platform.";
      const dLines = wrap(disc, 780, 11.5, fReg);
      dLines.slice(0, 2).forEach((l2, j) => txt(l2, 66, 1248 + j * 16, { size: 11.5, color: C.faint }));
      txt(`Generated ${fmtDate(new Date())} by VaultVerify.`, 66, 1248 + dLines.length * 16 + 6, { size: 11.5, f: fSemi, color: C.genText });
      txt(`Page ${i + 1} of ${total}`, 954, 1250, { size: 13, color: C.label, align: "right" });
    } else {
      txt("VaultVerify", 66, 1252, { size: 13, f: fSemi, color: C.headingTeal });
      txt(subLine, 66 + tw("VaultVerify", 13, fSemi) + 14, 1252, { size: 13, color: C.muted });
      txt(`Page ${i + 1} of ${total}`, 954, 1252, { size: 13, color: C.label, align: "right" });
    }
  }

  return pdf.save();
}
