import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB, type PDFImage } from "pdf-lib";
import {
  RATING_4, RATING_META, RECENCY_META, LAST_PERFORMED, recencyLabel,
  summarizeAnswers, ATTESTATION_STATEMENTS, type SkillAnswer,
} from "@/lib/bts/checklistShared";

// ── Branded Skills Checklist PDF (VaultVerify style) ──────────
// Mirrors the report layout: candidate card, "Summary at a glance" donuts
// (average ring + rating mix + % recent), category overview bars, per-category
// skill tables with color-coded rating rings + "Last performed" pills,
// additional questions, candidate attestation with e-signature, audit footer.
// Backward compatible: completions saved before the recency/extras/attestation
// upgrade simply render without pills, extras or signature.

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

// avg → band color (same ramp as the web report)
function avgColor(avg: number | null | undefined): RGB {
  if (avg == null) return hexToRgb("#9db4ad");
  if (avg < 2) return hexToRgb("#e05252");
  if (avg < 2.75) return hexToRgb("#e8a33d");
  if (avg < 3.5) return hexToRgb("#4285d6");
  return hexToRgb("#33a569");
}

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
  // grouped answers in template order
  categories: { name: string; items: ChecklistPdfItem[] }[];
  // superadmin-managed "Additional questions" snapshot
  additional?: { id: string; prompt: string; kind: string; value: string | null }[];
  // candidate attestation snapshot: { mode: "draw"|"type"|"upload", signature, printedName, signedAt }
  attestation?: { mode: string; signature: string; printedName?: string; signedAt?: string } | null;
}

const PAGE_W = 612;
const PAGE_H = 792;
const M = 56;
const W = PAGE_W - M * 2;   // 500
const RIGHT = PAGE_W - M;   // 556

const C = {
  teal: hexToRgb("#03363d"),
  jade: hexToRgb("#1b4e54"),
  ink: rgb(0.13, 0.15, 0.17),
  muted: rgb(0.45, 0.48, 0.52),
  faint: rgb(0.62, 0.68, 0.66),
  line: rgb(0.85, 0.87, 0.89),
  track: hexToRgb("#eef4f1"),
  band: hexToRgb("#eef5ee"),
  white: rgb(1, 1, 1),
  navy: hexToRgb("#123c54"),
  steel: hexToRgb("#5f87ae"),
  naText: hexToRgb("#8aa29c"),
  naBorder: hexToRgb("#b8c8c2"),
  palePill: hexToRgb("#c5d3dd"),
  palePillText: hexToRgb("#33475b"),
  yesBg: hexToRgb("#e2f4e8"), yesText: hexToRgb("#1f7a4a"),
  noBg: hexToRgb("#fdecec"), noText: hexToRgb("#d64545"),
  riskBg: hexToRgb("#fdf3e0"), riskText: hexToRgb("#9a6a12"),
  checkGreen: hexToRgb("#33a569"),
};

// text-tone hexes for the 1-4 scale (kept out of the shared client tokens)
const RATING_TEXT_HEX: Record<number, string> = { 1: "#d64545", 2: "#c57f1a", 3: "#2f6cbd", 4: "#1f7a4a" };

async function embedSignatureImage(pdf: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  try {
    const m = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/.exec(dataUrl.trim());
    if (!m) return null;
    const buf = Buffer.from(m[2], "base64");
    return /^png$/i.test(m[1]) ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
  } catch { return null; }
}

// SVG-space point on a circle: deg 0 = 12 o'clock, increasing clockwise.
// drawSvgPath anchors the path's (0,0) at the given PDF point and flips y,
// so SVG (px,py) lands at PDF (x+px, y-py) — i.e. SVG +y is down the page.
function pt(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}

function donutWedgePath(ro: number, ri: number, d1: number, d2: number): string {
  const large = d2 - d1 > 180 ? 1 : 0;
  const [x1, y1] = pt(ro, d1);
  const [x2, y2] = pt(ro, d2);
  const [x3, y3] = pt(ri, d2);
  const [x4, y4] = pt(ri, d1);
  const f = (n: number) => n.toFixed(2);
  return `M ${f(x1)} ${f(y1)} A ${ro} ${ro} 0 ${large} 1 ${f(x2)} ${f(y2)} L ${f(x3)} ${f(y3)} A ${ri} ${ri} 0 ${large} 0 ${f(x4)} ${f(y4)} Z`;
}

// Rounded rectangle path (SVG y-down; anchor at the rect's top-left; extends downward)
function rrectPath(w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  const f = (n: number) => n.toFixed(2);
  return `M ${f(rr)} 0 H ${f(w - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(w - rr)} ${f(rr)} V ${f(h - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(w - rr)} ${f(h)} H ${f(rr)} A ${f(rr)} ${f(rr)} 0 0 1 0 ${f(h - rr)} V ${f(rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} 0 Z`;
}

export async function buildChecklistPdf(data: ChecklistPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;
  const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - 26; };
  const ensure = (needed: number) => { if (y - needed < M + 34) newPage(); };

  const wrap = (t: string, maxW: number, size: number, f: PDFFont): string[] => {
    const words = sanitize(t).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const trial = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(trial, size) > maxW) { if (cur) lines.push(cur); cur = w; } else cur = trial;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const draw = (t: string, size: number, opts: { f?: PDFFont; color?: RGB; x?: number; y?: number; align?: "right" | "center"; cx?: number }) => {
    const f = opts.f ?? font;
    const baseline = opts.y ?? y - size;
    let x = opts.x ?? M;
    if (opts.align === "right") x = (opts.x ?? RIGHT) - f.widthOfTextAtSize(t, size);
    if (opts.align === "center" && opts.cx != null) x = opts.cx - f.widthOfTextAtSize(t, size) / 2;
    page.drawText(t, { x, y: baseline, size, font: f, color: opts.color ?? C.ink });
  };

  const dot = (x: number, cy: number, d: number, color: RGB) => {
    page.drawCircle({ x: x + d / 2, y: cy, size: d, color });
  };

  const fmtDate = (d: Date | string) => sanitize(new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }));
  const fmtLong = (d: Date | string) => sanitize(new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));

  // ── flat answers for the summarizer (old rows lack lastPerformed — fine) ──
  const flat: SkillAnswer[] = data.categories.flatMap((cat) =>
    cat.items.map((it) => ({
      category: cat.name, skill: it.skill, questionType: it.questionType,
      value: it.value, na: it.na, highRisk: it.highRisk, lastPerformed: it.lastPerformed ?? null,
    })),
  );
  const summary = summarizeAnswers(flat);

  // ── Header band ──
  page.drawRectangle({ x: 0, y: PAGE_H - 88, width: PAGE_W, height: 88, color: C.teal });
  let tile: PDFImage | null = null;
  try {
    tile = await pdf.embedPng(await readFile(path.join(process.cwd(), "public", "logo-tile.png")));
  } catch { /* fallback below */ }
  const rightW = 190;
  const nameLines = wrap("VaultVerify", rightW, 13, bold);
  const tagLines = wrap("References, verified. Skills, proven.", rightW, 8.5, font);
  let ty = PAGE_H - 44 + (nameLines.length * 16 + tagLines.length * 11 + 4) / 2;
  if (tile) {
    const ts = 52;
    page.drawImage(tile, { x: PAGE_W - M - ts - rightW, y: PAGE_H - 44 - ts / 2 + 4, width: ts, height: ts });
    const tx = PAGE_W - M - rightW;
    for (const ln of nameLines) { page.drawText(ln, { x: tx, y: ty - 13, size: 13, font: bold, color: C.white }); ty -= 16; }
    for (const ln of tagLines) { page.drawText(ln, { x: tx, y: ty - 8.5, size: 8.5, font, color: rgb(0.72, 0.83, 0.84) }); ty -= 11; }
  } else {
    for (const ln of nameLines) { page.drawText(ln, { x: PAGE_W - M - rightW, y: ty - 13, size: 13, font: bold, color: C.white }); ty -= 16; }
  }
  page.drawText("SKILLS CHECKLIST - SELF-ASSESSMENT", { x: M, y: PAGE_H - 50, size: 12.5, font: bold, color: C.white });
  page.drawText("Completed and e-signed by the candidate via VaultVerify", { x: M, y: PAGE_H - 68, size: 8.5, font, color: rgb(0.72, 0.83, 0.84) });
  y = PAGE_H - 112;

  // ── Candidate card ──
  const c = data.completion;
  ensure(100);
  const cardTop = y;
  const cardH = 88;
  page.drawSvgPath(rrectPath(W, cardH, 10), { x: M, y: cardTop, borderColor: C.line, borderWidth: 1 });
  draw(sanitize(data.account.name), 15.5, { f: bold, x: M + 16, y: cardTop - 28 });
  draw(sanitize(`${c.jobTitle || "RN"}  ·  ${c.specialtyLabel || c.specialty}  ·  ${c.profession || "Nursing"}  ·  ${c.yearsExperience} yr experience`), 9.5, { x: M + 16, y: cardTop - 46, color: C.muted });
  draw(sanitize(`Email: ${data.account.email}    Completed: ${fmtDate(c.completedAt)}`), 8.5, { x: M + 16, y: cardTop - 61, color: C.muted });
  draw(sanitize(`Valid until: ${fmtDate(c.expiresAt)} (1 year)    Source: ${c.source === "RECRUITER" ? "Requested by a recruiter" : "Candidate request"}`), 8.5, { x: M + 16, y: cardTop - 75, color: C.muted });
      const chipTxt = `${summary.total} skill${summary.total === 1 ? "" : "s"} assessed`;
  const chipW = bold.widthOfTextAtSize(chipTxt, 8) + 16;
  page.drawSvgPath(rrectPath(chipW, 17, 8.5), { x: RIGHT - 14 - chipW, y: cardTop - 14, color: C.yesBg });
  draw(chipTxt, 8, { f: bold, x: RIGHT - 14 - chipW + 8, y: cardTop - 26, color: C.yesText });
  y = cardTop - cardH - 20;

  // ── Summary at a glance ──
  ensure(160);
  draw("SUMMARY AT A GLANCE", 10, { f: bold, x: M, y: y - 10, color: C.jade });
  draw("Recent = performed within 3 months", 7.5, { x: RIGHT, y: y - 9, color: C.faint, align: "right" });
  y -= 24;

  const ro = 34, ri = 22, ringMid = (ro + ri) / 2;
  const donutCy = y - ro - 4;
  const centers = [M + 64, M + W / 2, RIGHT - 64];

  // filled donut arc — full circles fall back to a stroked ring (degenerate arc safe)
  const arc = (cx: number, cy: number, d1: number, d2: number, color: RGB) => {
    const span = d2 - d1;
    if (span >= 359.9) page.drawCircle({ x: cx, y: cy, size: ringMid, borderColor: color, borderWidth: ro - ri });
    else if (span > 0.4) page.drawSvgPath(donutWedgePath(ro, ri, d1, d2), { x: cx, y: cy, color });
  };

  // average ring
  const avg = summary.avg;
  page.drawCircle({ x: centers[0], y: donutCy, size: ringMid, borderColor: C.track, borderWidth: ro - ri });
  if (avg != null) arc(centers[0], donutCy, 0, Math.min(1, Math.max(0, avg / 4)) * 360, avgColor(avg));
  draw(avg == null ? "-" : avg.toFixed(1), 15, { f: bold, cx: centers[0], y: donutCy + 1, color: avgColor(avg), align: "center" });
  draw("AVG / 4", 6, { f: bold, cx: centers[0], y: donutCy - 11, color: C.faint, align: "center" });
  draw("Overall average", 8, { f: bold, cx: centers[0], y: donutCy - ro - 12, color: C.muted, align: "center" });

  // rating mix donut
  const mixTotal = summary.rated;
  let acc = 0;
  for (const n of [1, 2, 3, 4] as const) {
    const count = summary.mix[n];
    if (!count || !mixTotal) continue;
    const span = (count / mixTotal) * 360;
    const g = mixTotal > 1 ? 2 : 0;
    arc(centers[1], donutCy, acc + g, acc + span - g, hexToRgb(RATING_META[n].dot));
    acc += span;
  }
  draw(String(mixTotal), 15, { f: bold, cx: centers[1], y: donutCy + 1, color: C.ink, align: "center" });
  draw("RATED", 6, { f: bold, cx: centers[1], y: donutCy - 11, color: C.faint, align: "center" });
  draw("Rating mix", 8, { f: bold, cx: centers[1], y: donutCy - ro - 12, color: C.muted, align: "center" });

  // % recent donut (mirror of the web panel: 0% when rows predate recency tracking)
  const pct = summary.recentPct ?? 0;
  if (summary.total) {
    page.drawCircle({ x: centers[2], y: donutCy, size: ringMid, borderColor: C.track, borderWidth: ro - ri });
    arc(centers[2], donutCy, 0, pct * 3.6, C.navy);
  }
  draw(summary.total ? `${pct}%` : "-", 15, { f: bold, cx: centers[2], y: donutCy + 1, color: C.navy, align: "center" });
  draw("RECENT", 6, { f: bold, cx: centers[2], y: donutCy - 11, color: C.faint, align: "center" });
  draw("Performed recently", 8, { f: bold, cx: centers[2], y: donutCy - ro - 12, color: C.muted, align: "center" });

  // legends
  let ly = donutCy - ro - 28;
  let lx = M + 4;
  for (const r of RATING_4) {
    dot(lx, ly - 4.9, 5.5, hexToRgb(RATING_META[r.value].dot));
    const t = `${r.value} ${RATING_META[r.value].short}`;
    page.drawText(t, { x: lx + 9, y: ly - 7.5, size: 7.5, font, color: C.muted });
    lx += 9 + font.widthOfTextAtSize(t, 7.5) + 14;
  }
  ly -= 15;
  lx = M + 4;
  for (const r of LAST_PERFORMED) {
    dot(lx, ly - 4.9, 5.5, hexToRgb(RECENCY_META[r.key]?.dot ?? "#dbe4e0"));
    const t = sanitize(r.label);
    page.drawText(t, { x: lx + 9, y: ly - 7.5, size: 7.5, font, color: C.muted });
    lx += 9 + font.widthOfTextAtSize(t, 7.5) + 14;
  }
  y = ly - 16;

  // ── Category overview bars ──
  if (summary.categories.length) {
    ensure(56);
    draw("CATEGORY OVERVIEW", 10, { f: bold, x: M, y: y - 10, color: C.jade });
    y -= 20;
    for (const cat of summary.categories) {
      ensure(32);
      const col = avgColor(cat.avg);
      draw(sanitize(cat.name), 9, { f: bold, x: M + 2, y: y - 9 });
      draw(cat.avg == null ? "-" : cat.avg.toFixed(1), 9.5, { f: bold, x: M + 240, y: y - 9.5, color: col, align: "right" });
      page.drawSvgPath(rrectPath(240, 4, 2), { x: M + 2, y: y - 17, color: C.track });
      page.drawSvgPath(rrectPath(Math.max(4, ((cat.avg ?? 0) / 4) * 240), 4, 2), { x: M + 2, y: y - 17, color: col });
      draw(sanitize(`${cat.total} skill${cat.total === 1 ? "" : "s"} · ${cat.proficient} proficient · ${cat.recent} recent`), 7, { x: M + 2, y: y - 25, color: C.faint });
      y -= 31;
    }
    y -= 8;
  }

  // ── Per-category skill tables ──
  for (const cat of data.categories) {
    if (!cat.items.length) continue;
    const skillMaxW = W - 178;
    const rows = cat.items.map((it) => {
      const lines = wrap(it.skill, skillMaxW - (it.highRisk ? 46 : 0), 9.5, font);
      return { it, lines, h: Math.max(lines.length * 12.5, 26) + 9 };
    });
    const bandH = 20;
    const rowsH = rows.reduce((s, r) => s + r.h, 0);
    const tableH = bandH + rowsH;
    const usable = y - (M + 34);
    let boxed = tableH <= usable;
    if (!boxed && tableH <= PAGE_H - M - 70) { newPage(); boxed = true; }

    // band
    page.drawSvgPath(rrectPath(W, bandH, 6), { x: M, y, color: C.band });
    draw(sanitize(cat.name.toUpperCase()), 9.5, { f: bold, x: M + 8, y: y - bandH + 6.5, color: C.jade });
    draw(`${cat.items.length} skill${cat.items.length === 1 ? "" : "s"}`, 7.5, { x: RIGHT - 8, y: y - bandH + 6.5, color: C.muted, align: "right" });
    y -= bandH;

    rows.forEach(({ it, lines, h }, idx) => {
      if (!boxed) ensure(h + 6);
      const rowTop = y;
      const mid = rowTop - h / 2;
      // skill text (+ high-risk chip)
      let sx = M + 6;
      if (it.highRisk) {
        page.drawSvgPath(rrectPath(40, 11, 3), { x: sx, y: mid - 5.5, color: C.riskBg });
        draw("HIGH RISK", 5.2, { f: bold, x: sx + 4.5, y: mid - 3, color: C.riskText });
        sx += 48;
      }
      const blockH = lines.length * 12.5;
      const firstBase = rowTop - (h - blockH) / 2 - 10;
      lines.forEach((ln, li) => page.drawText(ln, { x: sx, y: firstBase - li * 12.5, size: 9.5, font, color: C.ink }));

      // right block: short label · rating ring · recency pill (fixed slots, right-aligned)
      let pillTxt = "";
      let pillFill: RGB | null = null;
      let pillText: RGB = C.white;
      if (it.lastPerformed) {
        pillTxt = sanitize(recencyLabel(it.lastPerformed));
        if (it.lastPerformed === "3") { pillFill = C.navy; pillText = C.white; }
        else if (it.lastPerformed === "6") { pillFill = C.steel; pillText = C.white; }
        else if (it.lastPerformed === "6+") { pillFill = C.palePill; pillText = C.palePillText; }
      }
      const pillW = pillTxt ? Math.min(96, bold.widthOfTextAtSize(pillTxt, 6.8) + 14) : 0;
      if (pillW) {
        const pX = RIGHT - pillW;
        const pY = mid + 7.5; // SVG path extends downward from the anchor
        if (pillFill) page.drawSvgPath(rrectPath(pillW, 15, 7.5), { x: pX, y: pY, color: pillFill });
        else page.drawSvgPath(rrectPath(pillW, 15, 7.5), { x: pX, y: pY, borderColor: C.naBorder, borderWidth: 0.8, borderDashArray: [2.5, 2] });
        draw(pillTxt, 6.8, { f: bold, cx: pX + pillW / 2, y: mid - 2.4, color: pillText, align: "center" });
      }

      const ringCx = RIGHT - pillW - 16 - 9;
      if (it.questionType === "rating_1_4" && it.na) {
        page.drawCircle({ x: ringCx, y: mid, size: 9.5, borderColor: C.line, borderWidth: 1.1, borderDashArray: [2, 1.6] });
        draw("N/A", 5, { f: bold, cx: ringCx, y: mid - 1.8, color: C.naText, align: "center" });
        const t = "Not applicable";
        draw(t, 7.5, { x: ringCx - 12 - font.widthOfTextAtSize(t, 7.5), y: mid - 2.5, color: C.naText });
      } else if (it.questionType === "rating_1_4") {
        const v = Number(it.value);
        const meta = RATING_META[v];
        if (meta && v >= 1 && v <= 4) {
          page.drawCircle({ x: ringCx, y: mid, size: 10, color: hexToRgb(meta.dot) });
          draw(String(v), 8.5, { f: bold, cx: ringCx, y: mid - 3, color: C.white, align: "center" });
          const t = meta.short;
          draw(t, 7.5, { f: bold, x: ringCx - 13 - bold.widthOfTextAtSize(t, 7.5), y: mid - 2.5, color: hexToRgb(RATING_TEXT_HEX[v]) });
        } else {
          draw("-", 9, { f: bold, cx: ringCx, y: mid - 3, color: C.muted, align: "center" });
        }
      } else if (it.questionType === "yes_no") {
        const v = String(it.value ?? "").toLowerCase();
        const yes = v === "yes";
        page.drawSvgPath(rrectPath(26, 13, 6.5), { x: ringCx - 9 - 13, y: mid - 6.5, color: yes ? C.yesBg : C.noBg });
        draw(v ? v.toUpperCase() : "-", 6.2, { f: bold, cx: ringCx - 9, y: mid - 2.2, color: yes ? C.yesText : C.noText, align: "center" });
      } else {
        const v = sanitize(String(it.value ?? "-"));
        draw(v.length > 30 ? v.slice(0, 29) + "..." : v, 8, { x: ringCx - 13, y: mid - 2.5, color: C.muted, align: "right" });
      }

      if (idx > 0) page.drawLine({ start: { x: M, y: rowTop }, end: { x: RIGHT, y: rowTop }, thickness: 0.5, color: C.line });
      y = rowTop - h;
    });
    if (boxed) page.drawSvgPath(rrectPath(W, tableH, 6), { x: M, y: y + rowsH + bandH, borderColor: C.line, borderWidth: 1 });
    y -= 18;
  }

  // ── Additional questions ──
  const extras = data.additional ?? [];
  if (extras.length) {
    const exRows = extras.map((q) => {
      const pLines = wrap(q.prompt, W - 130, 9.5, font);
      const aLines = q.kind === "YES_NO" ? [] : wrap(q.value || "-", 210, 8.5, font).slice(0, 4);
      return { q, pLines, aLines, h: Math.max(pLines.length * 12.5, aLines.length * 10.5, 20) + 8 };
    });
    const exTotal = exRows.reduce((s, r) => s + r.h, 0);
    ensure(48);
    draw("ADDITIONAL QUESTIONS", 10, { f: bold, x: M, y: y - 10, color: C.jade });
    y -= 20;
    const boxed = exTotal <= y - (M + 34);
    exRows.forEach(({ q, pLines, aLines, h }, i) => {
      if (!boxed) ensure(h + 4);
      const rowTop = y;
      const mid = rowTop - h / 2;
      const pBase = rowTop - (h - pLines.length * 12.5) / 2 - 10;
      pLines.forEach((ln, li) => page.drawText(ln, { x: M + 4, y: pBase - li * 12.5, size: 9.5, font, color: C.ink }));
      if (q.kind === "YES_NO") {
        const yes = q.value === "yes";
        const no = q.value === "no";
        page.drawSvgPath(rrectPath(30, 15, 7.5), { x: RIGHT - 34, y: mid + 7.5, color: yes ? C.yesBg : no ? C.noBg : C.track });
        draw(yes ? "YES" : no ? "NO" : "-", 7, { f: bold, cx: RIGHT - 34 + 15, y: mid - 2.4, color: yes ? C.yesText : no ? C.noText : C.muted, align: "center" });
      } else {
        const aBase = rowTop - (h - aLines.length * 10.5) / 2 - 8.5;
        aLines.forEach((ln, li) => page.drawText(ln, { x: RIGHT - 4 - font.widthOfTextAtSize(ln, 8.5), y: aBase - li * 10.5, size: 8.5, font, color: C.muted }));
      }
      if (i > 0) page.drawLine({ start: { x: M, y: rowTop }, end: { x: RIGHT, y: rowTop }, thickness: 0.5, color: C.line });
      y = rowTop - h;
    });
    if (boxed) page.drawSvgPath(rrectPath(W, exTotal, 6), { x: M, y: y + exTotal, borderColor: C.line, borderWidth: 1 });
    y -= 18;
  }

  // ── Candidate attestation ──
  const att = data.attestation ?? null;
  if (att && att.signature) {
    ensure(200);
    const aTop = y;
    draw("CANDIDATE ATTESTATION", 10, { f: bold, x: M + 2, y: aTop - 16, color: C.jade });
    let ay = aTop - 30;
    for (const s of ATTESTATION_STATEMENTS) {
      const lines = wrap(s, W - 34, 7.8, font);
      page.drawSvgPath(rrectPath(10, 10, 2.5), { x: M + 4, y: ay - 1, color: C.checkGreen });
      page.drawLine({ start: { x: M + 6.6, y: ay - 6.4 }, end: { x: M + 8.2, y: ay - 8.4 }, thickness: 1.2, color: C.white });
      page.drawLine({ start: { x: M + 8.2, y: ay - 8.4 }, end: { x: M + 11.8, y: ay - 3.6 }, thickness: 1.2, color: C.white });
      lines.forEach((ln, li) => page.drawText(ln, { x: M + 22, y: ay - 9.5 - li * 10, size: 7.8, font, color: C.muted }));
      ay -= Math.max(lines.length * 10, 14) + 4;
    }
    ay -= 8;
    const sigH = 44;
    ensure(sigH + 50);
    const img = att.mode === "type" ? null : await embedSignatureImage(pdf, att.signature);
    page.drawLine({ start: { x: M + 6, y: ay - sigH - 4 }, end: { x: M + 200, y: ay - sigH - 4 }, thickness: 0.8, color: C.line });
    if (img) {
      const scale = Math.min(180 / img.width, sigH / img.height, 1);
      page.drawImage(img, { x: M + 6, y: ay - sigH - 2, width: img.width * scale, height: img.height * scale });
    } else {
      const sigTxt = sanitize(att.signature).slice(0, 40) || "(signature on file)";
      page.drawText(sigTxt, { x: M + 10, y: ay - sigH + 6, size: 17, font: italic, color: C.teal });
    }
    draw(`ELECTRONIC SIGNATURE (${att.mode === "type" ? "TYPED" : att.mode === "upload" ? "UPLOADED" : "DRAWN"})`, 5.8, { f: bold, x: M + 6, y: ay - sigH - 14, color: C.faint });
    const rx = M + 258;
    draw("PRINTED NAME", 5.8, { f: bold, x: rx, y: ay - sigH + 24, color: C.faint });
    draw(sanitize(att.printedName || data.account.name).slice(0, 34), 10, { f: bold, x: rx, y: ay - sigH + 12 });
    page.drawLine({ start: { x: rx, y: ay - sigH + 8 }, end: { x: rx + 176, y: ay - sigH + 8 }, thickness: 0.8, color: C.line });
    draw("DATE", 5.8, { f: bold, x: rx, y: ay - sigH - 8, color: C.faint });
    draw(att.signedAt ? fmtLong(att.signedAt) : fmtLong(c.completedAt), 10, { f: bold, x: rx, y: ay - sigH - 20 });
    page.drawLine({ start: { x: rx, y: ay - sigH - 24 }, end: { x: rx + 176, y: ay - sigH - 24 }, thickness: 0.8, color: C.line });

    const boxBottom = ay - sigH - 32;
    const boxH = aTop + 4 - boxBottom;
    // rrectPath extends downward from its anchor — anchor at the box TOP so it wraps the block
    page.drawSvgPath(rrectPath(W, boxH, 8), { x: M, y: aTop + 4, borderColor: C.line, borderWidth: 1 });
    y = boxBottom - 10;
  }

  // ── Footer ──
  ensure(58);
  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: RIGHT, y }, thickness: 1, color: C.line });
  y -= 13;
  const fLines = [
    "Self-reported assessment. Completed once by the candidate and valid for 12 months. Access was",
    "granted through a VaultVerify share link; sharing rules (one-time or duration) are logged by platform.",
    `Generated ${fmtDate(new Date())} by VaultVerify.`,
  ];
  for (const ln of fLines) {
    page.drawText(sanitize(ln), { x: M, y, size: 7.5, font, color: C.faint });
    y -= 10;
  }

  return pdf.save();
}
