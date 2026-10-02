import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB, type PDFImage } from "pdf-lib";

// ── Branded Skills Checklist PDF (VaultVerify style) ──────────
// Self-assessment results: candidate block, per-category answers on the
// MyZipVault 1-4 scale, N/A marks, validity window and audit footer.

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

export interface ChecklistPdfData {
  account: { name: string; email: string; title: string };
  completion: {
    profession: string; jobTitle: string; specialty: string; specialtyLabel: string;
    yearsExperience: number; source: string;
    completedAt: Date; expiresAt: Date;
  };
  // grouped answers in template order
  categories: { name: string; items: { skill: string; questionType: string; value: number | string | null; na: boolean; highRisk: boolean }[] }[];
}

const PAGE_W = 612;
const PAGE_H = 792;
const M = 56;

export async function buildChecklistPdf(data: ChecklistPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const teal = hexToRgb("#03363d");
  const green = hexToRgb("#7cc118");
  const jade = hexToRgb("#1b4e54");
  const ink = rgb(0.13, 0.15, 0.17);
  const muted = rgb(0.45, 0.48, 0.52);
  const line = rgb(0.85, 0.87, 0.89);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;
  const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H; };
  const ensure = (needed: number) => { if (y - needed < M + 30) newPage(); };

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

  const text = (t: string, size: number, opts: { f?: PDFFont; color?: RGB; x?: number; maxW?: number; lh?: number } = {}) => {
    const f = opts.f ?? font;
    const x = opts.x ?? M;
    const lh = opts.lh ?? size + 3;
    const lines = opts.maxW ? wrap(t, opts.maxW, size, f) : [sanitize(t)];
    for (const ln of lines) {
      ensure(lh + 2);
      page.drawText(ln, { x, y: y - size, size, font: f, color: opts.color ?? ink });
      y -= lh;
    }
  };

  // ── Banner (mirrors reference packet header) ──
  page.drawRectangle({ x: 0, y: PAGE_H - 96, width: PAGE_W, height: 96, color: teal });
  let tile: PDFImage | null = null;
  try {
    tile = await pdf.embedPng(await readFile(path.join(process.cwd(), "public", "logo-tile.png")));
  } catch { /* fallback below */ }
  const rightW = 190;
  const nameLines = wrap("VaultVerify", rightW, 13, bold);
  const tagLines = wrap("References, verified. Skills, proven.", rightW, 8.5, font);
  const rightH = nameLines.length * 16 + tagLines.length * 11 + 4;
  let ty = PAGE_H - 48 + rightH / 2;
  if (tile) {
    const ts = 54;
    page.drawImage(tile, { x: PAGE_W - M - ts - rightW, y: PAGE_H - 48 - ts / 2 + 4, width: ts, height: ts });
    const tx = PAGE_W - M - rightW;
    for (const ln of nameLines) { page.drawText(ln, { x: tx, y: ty - 13, size: 13, font: bold, color: rgb(1, 1, 1) }); ty -= 16; }
    for (const ln of tagLines) { page.drawText(ln, { x: tx, y: ty - 8.5, size: 8.5, font, color: rgb(0.72, 0.83, 0.84) }); ty -= 11; }
  } else {
    for (const ln of nameLines) { page.drawText(ln, { x: PAGE_W - M - rightW, y: ty - 13, size: 13, font: bold, color: rgb(1, 1, 1) }); ty -= 16; }
  }
  page.drawText("SKILLS CHECKLIST - SELF-ASSESSMENT", { x: M, y: PAGE_H - 52, size: 12, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Completed by the candidate via VaultVerify", { x: M, y: PAGE_H - 70, size: 8.5, font, color: rgb(0.72, 0.83, 0.84) });
  y = PAGE_H - 120;

  // ── Candidate block ──
  const c = data.completion;
  text(`${data.account.name}`, 16, { f: bold });
  text(`${c.jobTitle || "RN"}  ·  ${c.specialtyLabel || c.specialty}  ·  ${c.profession || "Nursing"}`, 10, { color: muted });
  const fmt = (d: Date) => sanitize(d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }));
  text(`Email: ${data.account.email}    Self-reported experience: ${c.yearsExperience} yr(s)`, 9, { color: muted });
  text(`Completed: ${fmt(c.completedAt)}    Valid until: ${fmt(c.expiresAt)} (1 year)`, 9, { color: muted });
  text(`Source: ${c.source === "RECRUITER" ? "Requested by a recruiter" : "Candidate request (approved)"}`, 9, { color: muted });
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 1, color: line });
  y -= 16;

  // ── Rating legend ──
  text("Rating scale", 10, { f: bold, color: jade });
  for (const [v, label] of Object.entries(RATING_4_LABELS)) {
    text(`${v} = ${label}`, 8.5, { color: muted, x: M + 10 });
  }
  y -= 10;

  // ── Categories & answers ──
  for (const cat of data.categories) {
    ensure(60);
    y -= 4;
    page.drawRectangle({ x: M, y: y - 16, width: PAGE_W - M * 2, height: 20, color: hexToRgb("#eef5ee") });
    text(cat.name.toUpperCase(), 9.5, { f: bold, color: jade });
    y -= 8;
    for (const item of cat.items) {
      const answer = item.na
        ? "N/A"
        : item.questionType === "yes_no"
          ? (item.value === "yes" ? "Yes" : item.value === "no" ? "No" : "-")
          : item.questionType === "text"
            ? String(item.value ?? "-")
            : item.value != null ? `${item.value} - ${RATING_4_LABELS[Number(item.value)] ?? "-"}` : "-";
      const skillLines = wrap(item.skill, PAGE_W - M * 2 - 150, 9.5, font);
      ensure(skillLines.length * 13 + 14);
      const valX = PAGE_W - M - 140;
      for (const ln of skillLines) {
        page.drawText(ln, { x: M + (item.highRisk ? 14 : 2), y: y - 9.5, size: 9.5, font, color: ink });
        y -= 13;
      }
      if (item.highRisk) {
        page.drawText("!", { x: M + 2, y: y + 13 - 9.5 + 2, size: 9, font: bold, color: rgb(0.72, 0.45, 0) });
      }
      // answer right-aligned block
      const valSize = answer.length > 34 ? 7.5 : 9;
      const valW = Math.min(font.widthOfTextAtSize(answer, valSize), 138);
      page.drawText(answer, { x: valX + 138 - valW, y: y + 13 - valSize + 1, size: valSize, font: bold, color: item.na ? muted : teal });
      page.drawLine({ start: { x: M, y: y + 4 }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: line });
      y -= 2;
    }
    y -= 8;
  }

  // ── Footer on last page ──
  ensure(60);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 1, color: line });
  y -= 14;
  text("Self-reported assessment. Completed once by the candidate and valid for 12 months. Access was", 8, { color: muted });
  text("granted through a VaultVerify share link; sharing rules (one-time or duration) are logged by platform.", 8, { color: muted });
  text(`Generated ${fmt(new Date())} by VaultVerify.`, 8, { color: muted });

  return pdf.save();
}
