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

// ── VaultVerify Skills Checklist PDF — reference-cloned layout ──────────
// 1:1 reproduction of the approved sample (VaultVerify-Skills-Checklist-Sam).
// Every coordinate, size, radius and color below was extracted from the
// reference file's vector operators (design space 1020x1320 rendered x0.6
// onto Letter 612x792pt, exactly like the reference).

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

// palette lifted from the reference vectors
const C = {
  band: hexToRgb("#03363d"),
  strip: hexToRgb("#4daa57"),
  deco: hexToRgb("#4dab57"),
  shadow: hexToRgb("#0a2e33"),
  tileBg: hexToRgb("#f3f8f4"),
  teal: hexToRgb("#0f5257"),
  ink: hexToRgb("#0b2e33"),
  gray: hexToRgb("#5e7075"),
  tagline: hexToRgb("#bfe3c7"),
  hdrSub: hexToRgb("#bfd6d3"),
  headGreen: hexToRgb("#8be39a"),
  tableNavy: hexToRgb("#0b2e33"),
  sage: hexToRgb("#eef6f1"),
  chip: hexToRgb("#ddede3"),
  cardBorder: hexToRgb("#e2eae6"),
  divider: hexToRgb("#e2eae6"),
  dots: hexToRgb("#d3ddd8"),
  track: hexToRgb("#c9ddd0"),
  barGreen: hexToRgb("#4daa57"),
  avgGreen: hexToRgb("#2f8a3e"),
  ringRest: hexToRgb("#e3eae7"),
  donutTrack: hexToRgb("#eaf0ec"),
  navy: hexToRgb("#1e3a5f"),
  steel: hexToRgb("#6f8fb0"),
  paleSeg: hexToRgb("#c3ccd5"),
  naSeg: hexToRgb("#dde3e9"),
  palePill: hexToRgb("#e3e8ed"),
  palePillText: hexToRgb("#566273"),
  naBorder: hexToRgb("#b9c3cd"),
  naText: hexToRgb("#8a9a96"),
  unsel: hexToRgb("#e9efec"),
  unselText: hexToRgb("#8a9a96"),
  yes: hexToRgb("#2f8a3e"),
  noSel: hexToRgb("#5e7075"),
  accent: hexToRgb("#4daa57"),
  boxFill: hexToRgb("#f7faf8"),
  boxBorder: hexToRgb("#d5e2db"),
  sigLine: hexToRgb("#9db5ac"),
  white: rgb(1, 1, 1),
};

const RATING_VIS: Record<number, { ring: string; pillBg: string; pillText: string; legend: string; short: string }> = {
  1: { ring: "#e5484d", pillBg: "#fde7e7", pillText: "#a53437", legend: "No theory / experience", short: "No theory" },
  2: { ring: "#f2a20c", pillBg: "#fdf0d9", pillText: "#b57313", legend: "Limited", short: "Limited" },
  3: { ring: "#2f80ed", pillBg: "#deebfc", pillText: "#225cab", legend: "Experienced", short: "Experienced" },
  4: { ring: "#12a150", pillBg: "#d9f0e3", pillText: "#0d743a", legend: "Proficient", short: "Proficient" },
};

// SVG helpers (design-space units, drawn with scale S)
function pt(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}
function arcPath(r: number, d1: number, d2: number): string {
  const large = d2 - d1 > 180 ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  const [x1, y1] = pt(r, d1);
  const [x2, y2] = pt(r, d2);
  return `M ${f(x1)} ${f(y1)} A ${f(r)} ${f(r)} 0 ${large} 1 ${f(x2)} ${f(y2)}`;
}
function rrectPath(w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const f = (n: number) => n.toFixed(2);
  return `M ${f(rr)} 0 H ${f(w - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(w - rr)} ${f(rr)} V ${f(h - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(w - rr)} ${f(h)} H ${f(rr)} A ${f(rr)} ${f(rr)} 0 0 1 0 ${f(h - rr)} V ${f(rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} 0 Z`;
}
function leftRoundPath(w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const f = (n: number) => n.toFixed(2);
  return `M ${f(rr)} 0 H ${f(w)} V ${f(h)} H ${f(rr)} A ${f(rr)} ${f(rr)} 0 0 1 0 ${f(h - rr)} V ${f(rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} 0 Z`;
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
  const fBold = await loadFont("Poppins-Bold.ttf", StandardFonts.HelveticaBold);
  const fSemi = await loadFont("Poppins-SemiBold.ttf", StandardFonts.HelveticaBold);
  const fScript = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  let tile: PDFImage | null = null;
  try { tile = await pdf.embedPng(await readFile(path.join(process.cwd(), "public", "logo-tile.png"))); } catch { /* optional */ }

  let pg: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = 0; // design-space flow cursor (top-down)

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

  const leftRound = (x: number, yD: number, w: number, h: number, r: number, fill: RGB) => {
    pg.drawSvgPath(leftRoundPath(w, h, r), { x: X(x), y: Y(yD), scale: S, color: fill });
  };

  const circle = (cx: number, cy: number, r: number, o: { fill?: RGB; border?: RGB; bw?: number; opacity?: number } = {}) => {
    pg.drawCircle({
      x: X(cx), y: Y(cy), size: r * S,
      color: o.fill, borderColor: o.border, borderWidth: o.bw ?? 1, opacity: o.opacity ?? 1,
      borderOpacity: o.opacity ?? 1,
    });
  };

  const ln = (x1: number, y1: number, x2: number, y2: number, color: RGB, w = 1, cap?: LineCapStyle) => {
    pg.drawLine({ start: { x: X(x1), y: Y(y1) }, end: { x: X(x2), y: Y(y2) }, thickness: w * S, color, lineCap: cap });
  };

  // stroked arc: degrees measured clockwise from 12 o'clock
  const arc = (cx: number, cy: number, r: number, d1: number, d2: number, color: RGB, lw: number) => {
    if (d2 - d1 <= 0.5) return;
    pg.drawSvgPath(arcPath(r, d1, d2), {
      x: X(cx), y: Y(cy), scale: S, borderColor: color, borderWidth: lw * S,
      borderLineCap: LineCapStyle.Butt,
    });
  };

  // quarter progress ring (row rings: exact quarters; legend rings: 6deg inset)
  const quarterRing = (cx: number, cy: number, r: number, lw: number, value: number, inset = 0) => {
    for (let q = 0; q < 4; q++) {
      const d1 = q * 90 + inset, d2 = (q + 1) * 90 - inset;
      arc(cx, cy, r, d1, d2, q < value ? hexToRgb(RATING_VIS[value].ring) : C.ringRest, lw);
    }
  };

  // donut: stroked track ring + clockwise segments from 12 o'clock
  const donut = (cx: number, cy: number, segs: { count: number; color: RGB }[], centerMain: string, centerSub: string) => {
    const R = 50, LW = 21.67;
    circle(cx, cy, R, { border: C.donutTrack, bw: LW });
    const total = segs.reduce((s, g) => s + g.count, 0);
    if (total) {
      let acc = 0;
      for (const g of segs) {
        if (!g.count) continue;
        const span = (g.count / total) * 360;
        if (span >= 359) arc(cx, cy, R, 0.5, 359.5, g.color, LW);
        else arc(cx, cy, R, acc + 1, acc + span - 1, g.color, LW);
        acc += span;
      }
    }
    txt(centerMain, cx, cy + 6.7, { size: 25, f: fBold, color: C.ink, align: "center" });
    txt(centerSub, cx, cy + 23.3, { size: 10.67, color: C.gray, align: "center" });
  };

  const dots = (x1: number, x2: number, cy: number, color: RGB) => {
    if (x2 - x1 < 8) return;
    pg.drawSvgPath(`M 0 0 H ${(x2 - x1).toFixed(1)}`, {
      x: X(x1), y: Y(cy), scale: S, borderColor: color, borderWidth: 1.17,
      borderDashArray: [0.1, 4.2], borderLineCap: LineCapStyle.Round,
    });
  };

  const clockIcon = (cx: number, cy: number, color: RGB, r = 4.67) => {
    circle(cx, cy, r, { border: color, bw: 1.33 });
    ln(cx, cy, cx, cy - 3, color, 1.33, LineCapStyle.Round);
    ln(cx, cy, cx + 2.5, cy + 1, color, 1.33, LineCapStyle.Round);
  };

  // recency pill — geometry identical everywhere (h 21.67, r 10.83)
  const recencyPill = (key: string | null | undefined, cy: number, left: number): number => {
    if (!key) return left;
    const label = key === "na" ? "N/A" : recencyLabel(key) || "N/A";
    const w = key === "na" ? 43.3 : tw(label, 10.67, fBold) + 44;
    if (key === "3") rrect(left, cy - 10.83, w, 21.67, 10.83, { fill: C.navy });
    else if (key === "6") rrect(left, cy - 10.83, w, 21.67, 10.83, { fill: C.steel });
    else if (key === "6+") rrect(left, cy - 10.83, w, 21.67, 10.83, { fill: C.palePill });
    else rrect(left, cy - 10.83, w, 21.67, 10.83, { fill: C.white, border: C.naBorder, bw: 1.33 });
    const iconColor = key === "3" || key === "6" ? C.white : C.palePillText;
    const textColor = key === "na" ? C.naText : key === "6+" ? C.palePillText : C.white;
    if (key !== "na") clockIcon(left + 15, cy, iconColor);
    txt(label, left + 28.3, cy + 3.83, { size: 10.67, f: fBold, color: textColor });
    return left + w;
  };

  const labelPill = (label: string, bgHex: string, fgHex: string, x: number, cy: number) => {
    const w = tw(label, 11, fBold) + 26;
    rrect(x, cy - 10.83, w, 21.67, 10.83, { fill: hexToRgb(bgHex) });
    txt(label, x + w / 2, cy + 3.83, { size: 11, f: fBold, color: hexToRgb(fgHex), align: "center" });
    return w;
  };

  const fmtDate = (d: Date | string) => sanitize(new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }));
  const subLine = `Skills Checklist: ${sanitize(data.account.name)}, ${sanitize(data.completion.jobTitle || "RN")} (${sanitize(data.completion.specialtyLabel || data.completion.specialty)})`;

  const newPage = () => {
    pg = pdf.addPage([PAGE_W, PAGE_H]);
    // slim header band + green line (reference: band 86.7, strip 86.7-90)
    pg.drawRectangle({ x: 0, y: Y(86.7), width: PAGE_W, height: 86.7 * S, color: C.band });
    pg.drawRectangle({ x: 0, y: Y(90), width: PAGE_W, height: 3.3 * S, color: C.strip });
    if (tile) pg.drawImage(tile, { x: X(66.7), y: Y(68.3), width: 50 * S, height: 50 * S });
    txt("VaultVerify", 133.3, 51.7, { size: 20.83, f: fBold, color: C.white });
    txt(subLine, 953.3, 51.7, { size: 14.17, f: fMed, color: C.white, align: "right" });
    y = 120;
    tableBandPending = true;
  };

  let tableBandPending = true; // navy Skill/Rating/Last-performed band: once per page
  const CONTENT_LIMIT = 1190;
  const ensure = (needed: number) => { if (y + needed > CONTENT_LIMIT) newPage(); };
