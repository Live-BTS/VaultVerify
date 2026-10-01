import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from "pdf-lib";

// ── Branded reference packet PDF (MEDS Talent style) ───────────
// One PDF per completed submission: agency banner, candidate block,
// reference + employment confirmation, all 10 answers with the anchored
// scale, remarks, skills verification, signature block with timestamp +
// IP, and fraud flag summary for recruiter review.

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

export interface PacketData {
  agency: { name: string; logoText: string; tagline: string; primaryColor: string; accentColor: string };
  candidate: {
    fullName: string; role: string; specialty: string; email: string; phone: string;
    city: string; state: string; yearsExperience: number; consentSignedAt: Date | null;
  };
  request: {
    refName: string; refTitle: string; refEmail: string; refPhone: string;
    facilityName: string; facilityCity: string; facilityState: string;
    relationship: string; workStartDate: string; workEndDate: string;
    status: string; sentAt: Date; completedAt: Date | null;
  };
  response: {
    identityMethod: string; confirmedRelationship: string; confirmedFacility: string;
    confirmedDates: string; mismatchNotes: string;
    answers: { key: string; question: string; value: string }[];
    overallRating: number | null;
    q8Discipline: boolean; q8Explanation: string | null; remarks: string;
    signatureName: string; signedAt: Date; signerIp: string; signerUserAgent: string;
    durationSeconds: number;
  };
  skills: { skillName: string; nurseProficiency: string; confirmed: boolean; refProficiency: string | null }[];
  flags: { type: string; detail: string; severity: string }[];
}

const PAGE_W = 612;
const PAGE_H = 792;
const M = 56;
const CONTENT_W = PAGE_W - M * 2;

export async function buildReferencePacket(data: PacketData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const primary = hexToRgb(data.agency.primaryColor);
  const accent = hexToRgb(data.agency.accentColor);
  const ink = rgb(0.13, 0.15, 0.17);
  const muted = rgb(0.45, 0.48, 0.52);
  const line = rgb(0.85, 0.87, 0.89);
  const rose = rgb(0.79, 0.16, 0.28);
  const teal = rgb(0.06, 0.46, 0.43);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H;
  };
  const ensure = (needed: number) => {
    if (y - needed < M + 34) newPage();
  };

  const wrap = (t: string, maxW: number, size: number, f: PDFFont): string[] => {
    const words = sanitize(t).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const trial = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(trial, size) > maxW) {
        if (cur) lines.push(cur);
        cur = w;
      } else cur = trial;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const text = (
    t: string,
    size: number,
    opts: { f?: PDFFont; color?: RGB; x?: number; maxW?: number; lh?: number } = {}
  ) => {
    const f = opts.f ?? font;
    const x = opts.x ?? M;
    const maxW = opts.maxW ?? CONTENT_W - (x - M);
    const lines = wrap(t, maxW, size, f);
    const lh = opts.lh ?? size * 1.35;
    for (const ln of lines) {
      ensure(lh);
      page.drawText(ln, { x, y: y - size, size, font: f, color: opts.color ?? ink });
      y -= lh;
    }
  };

  const sectionTitle = (t: string, color: RGB = primary) => {
    ensure(28);
    y -= 12;
    page.drawText(sanitize(t.toUpperCase()), { x: M, y: y - 10, size: 10, font: bold, color, letterSpacing: 0.5 });
    y -= 18;
  };

  const hRule = (w = CONTENT_W, x = M) => {
    ensure(8);
    page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.7, color: line });
  };

  const kv = (pairs: [string, string][]) => {
    const labelW = 118;
    for (const [k, v] of pairs) {
      ensure(15);
      page.drawText(sanitize(k), { x: M, y: y - 9.5, size: 8.5, font: bold, color: muted });
      const vx = M + labelW;
      const lines = wrap(v || "—", CONTENT_W - labelW, 9.5, font);
      for (const ln of lines) {
        ensure(13);
        page.drawText(ln, { x: vx, y: y - 9.5, size: 9.5, font, color: ink });
        y -= 13;
      }
      y -= 2.5;
    }
  };

  // ── Banner ──
  const bannerH = 92;
  page.drawRectangle({ x: 0, y: PAGE_H - bannerH, width: PAGE_W, height: bannerH, color: primary });
  page.drawRectangle({ x: 0, y: PAGE_H - bannerH - 6, width: PAGE_W, height: 6, color: accent });
  page.drawText(sanitize(data.agency.logoText).slice(0, 14), { x: M, y: PAGE_H - 46, size: 24, font: bold, color: rgb(1, 1, 1) });
  page.drawText(sanitize(data.agency.name), { x: M, y: PAGE_H - 64, size: 11, font, color: rgb(0.9, 0.98, 0.97) });
  const rt = "Verified Reference Packet";
  page.drawText(rt, { x: PAGE_W - M - bold.widthOfTextAtSize(rt, 12), y: PAGE_H - 44, size: 12, font: bold, color: rgb(1, 1, 1) });
  const rs = "Generated " + new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  page.drawText(rs, { x: PAGE_W - M - font.widthOfTextAtSize(rs, 9), y: PAGE_H - 60, size: 9, font, color: rgb(0.9, 0.98, 0.97) });

  y = PAGE_H - bannerH - 36;
  text(`${data.candidate.fullName}, ${data.candidate.role} — Reference Verification`, 15, { f: bold });
  y -= 3;
  text(`Specialty: ${data.candidate.specialty}  |  Prepared for ${data.agency.name} recruitment`, 9.5, { color: muted });
  y -= 8;
  hRule();

  // ── Candidate ──
  y -= 14;
  sectionTitle("Candidate");
  kv([
    ["Name", `${data.candidate.fullName} (${data.candidate.role})`],
    ["Specialty", data.candidate.specialty],
    ["Contact", `${data.candidate.email}  ·  ${data.candidate.phone}`],
    ["Location", `${data.candidate.city}, ${data.candidate.state}`],
    ["Experience", `${data.candidate.yearsExperience} year(s)`],
    ["Release signed", data.candidate.consentSignedAt ? new Date(data.candidate.consentSignedAt).toLocaleString("en-US") : "—"],
  ]);
  y -= 8;
  hRule();

  // ── Reference & employment ──
  y -= 14;
  sectionTitle("Reference & Employment Confirmation");
  kv([
    ["Reference", `${data.request.refName} — ${data.request.refTitle}`],
    ["Contact", `${data.request.refEmail}  ·  ${data.request.refPhone}`],
    ["Facility", `${data.request.facilityName}, ${data.request.facilityCity}, ${data.request.facilityState}`],
    ["Stated relationship", data.request.relationship || "—"],
    ["Confirmed relationship", data.response.confirmedRelationship || "—"],
    ["Dates worked", data.response.confirmedDates || `${data.request.workStartDate} - ${data.request.workEndDate || "present"}`],
    ["Identity check", data.response.identityMethod],
  ]);
  if (data.response.mismatchNotes) {
    y -= 4;
    text("Mismatch notes: " + data.response.mismatchNotes, 9, { color: rose, f: bold });
  }
  y -= 8;
  hRule();

  // ── Answers ──
  y -= 14;
  sectionTitle("Reference Questions & Ratings");
  if (data.response.overallRating != null) {
    text(`Average clinical rating: ${data.response.overallRating.toFixed(1)} / 5.0`, 11, { f: bold, color: teal });
    y -= 5;
  }
  for (const a of data.response.answers) {
    ensure(44);
    y -= 2;
    text(a.question, 9, { f: bold });
    y -= 1;
    text(a.value || "—", 9.5);
    y -= 3;
    hRule(CONTENT_W - 8, M + 8);
    y -= 7;
  }

  // ── Discipline ──
  ensure(46);
  y -= 10;
  sectionTitle("Disciplinary Disclosure (Q8)");
  if (data.response.q8Discipline) {
    text("YES - reported by reference", 10, { f: bold, color: rose });
    y -= 3;
    text(data.response.q8Explanation ?? "No detail provided", 9.5);
  } else {
    text("No - to the best of the reference's knowledge, no formal disciplinary action or substantiated complaint.", 9.5);
  }
  y -= 8;
  hRule();

  // ── Skills verification ──
  if (data.skills.length > 0) {
    y -= 14;
    sectionTitle("Skills Verification (high-risk skills)");
    for (const s of data.skills) {
      ensure(20);
      page.drawCircle({ x: M + 3, y: y - 3.5, size: 2.2, color: s.confirmed ? teal : accent });
      const mark = s.confirmed ? "CONFIRMED" : "ADJUSTED";
      const detail = s.confirmed ? s.nurseProficiency : `${s.nurseProficiency} -> ${s.refProficiency ?? "not observed"}`;
      text(`${s.skillName} - ${mark} (${detail})`, 9.5, { x: M + 14 });
      y -= 3;
    }
    y -= 8;
    hRule();
  }

  // ── Remarks ──
  if (data.response.remarks) {
    y -= 14;
    sectionTitle("Remarks");
    text(data.response.remarks, 9.5);
    y -= 8;
    hRule();
  }

  // ── Fraud flags ──
  if (data.flags.length > 0) {
    y -= 14;
    sectionTitle("Review Flags", rose);
    for (const f of data.flags) {
      ensure(30);
      text(`[${f.severity}] ${f.type}`, 9.5, { f: bold, color: rose });
      text(f.detail, 8.5, { color: muted });
      y -= 4;
    }
    y -= 8;
    hRule();
  }

  // ── Signature ──
  ensure(110);
  y -= 14;
  sectionTitle("Electronic Signature & Audit");
  text(`Signed by: ${data.response.signatureName}`, 10, { f: bold });
  ensure(14);
  page.drawLine({ start: { x: M, y: y - 2 }, end: { x: M + 240, y: y - 2 }, thickness: 1, color: ink });
  y -= 18;
  kv([
    ["Signed at", new Date(data.response.signedAt).toLocaleString("en-US")],
    ["Completion time", `${Math.max(1, Math.round(data.response.durationSeconds / 60))} min (${data.response.durationSeconds}s)`],
    ["Signer IP", data.response.signerIp || "recorded"],
    ["Device", data.response.signerUserAgent.slice(0, 88) || "recorded"],
  ]);
  y -= 10;
  text(
    "This signature is the legal equivalent of a handwritten signature. All views and edits to this record are timestamped and immutable.",
    7.5,
    { color: muted }
  );

  // ── Footer on every page ──
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 40 }, end: { x: PAGE_W - M, y: 40 }, thickness: 0.7, color: line });
    p.drawText(sanitize(`${data.agency.name} - Confidential reference verification`), { x: M, y: 28, size: 8, font, color: muted });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, { x: PAGE_W - M - font.widthOfTextAtSize(pn, 8), y: 28, size: 8, font, color: muted });
  });

  return pdf.save();
}
