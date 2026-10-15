// VaultVerify Product & Content Brief — shared builders (docx-js)
// Follows docx skill: design-system.md R1 recipe + DS-1 palette, common-rules.md profiles.
const {
  Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, TableLayoutType,
} = require("docx");

// ── Palette: DS-1 Deep Sea (teal accent matches VaultVerify brand) ──
const PAL = {
  bg: "0B1C2C", accent: "529286",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "529286", headerText: "FFFFFF", accentLine: "529286", innerLine: "BECFCC", surface: "E8ECEB" },
  primary: "0B1C2C", body: "000000", secondary: "506070",
};

const FONT_BODY = { ascii: "Calibri", eastAsia: "Microsoft YaHei" };
const FONT_HEAD = { ascii: "Calibri", eastAsia: "SimHei" };

// ── Border helpers (mandatory allNoBorders for cover) ──
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ── Latin-aware title layout (English doc: char ≈ pt*10.5 twips; CJK would be pt*20) ──
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."，。、；：！？", ..."的与和及之在于为", ..."-_—–·/", ..." \t", "&"]);
  const lines = [];
  let remaining = title;
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
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 10.5; // Latin average width
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ── Cover Recipe R1: Pure Paragraph Left (validated recipe, DS-1) ──
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
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: P.accent, font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.cover.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.cover.subtitleColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: P.cover.metaColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.cover.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.cover.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ── Body builders (English report profile) ──
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: PAL.primary, font: FONT_HEAD })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 27, color: PAL.primary, font: FONT_HEAD })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100, line: 312 },
    children: [new TextRun({ text, bold: true, size: 24, color: "1E3A45", font: FONT_HEAD })],
  });
}
// Body paragraph — runs: string OR array of TextRun-spec objects {t, b, i}
function p(runs, opts = {}) {
  const arr = typeof runs === "string" ? [{ t: runs }] : runs;
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? 140, line: 312 },
    keepNext: opts.keepNext || undefined,
    children: arr.map(r => new TextRun({
      text: r.t, bold: r.b || false, italics: r.i || false,
      size: r.s || 23, color: r.c || PAL.body, font: FONT_BODY,
    })),
  });
}
// Left-aligned list item (lists must NOT be justified)
function li(runs, opts = {}) {
  const arr = typeof runs === "string" ? [{ t: runs }] : runs;
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    bullet: { level: opts.level ?? 0 },
    spacing: { after: 80, line: 312 },
    children: arr.map(r => new TextRun({
      text: r.t, bold: r.b || false, italics: r.i || false,
      size: r.s || 23, color: r.c || PAL.body, font: FONT_BODY,
    })),
  });
}
function numItem(reference, runs, opts = {}) {
  const arr = typeof runs === "string" ? [{ t: runs }] : runs;
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    numbering: { reference, level: opts.level ?? 0 },
    spacing: { after: 100, line: 312 },
    children: arr.map(r => new TextRun({
      text: r.t, bold: r.b || false, italics: r.i || false,
      size: r.s || 23, color: r.c || PAL.body, font: FONT_BODY,
    })),
  });
}
// Quoted copy block — exact UI/legal string the writer must reproduce
function copyBlock(text, label) {
  const out = [];
  if (label) {
    out.push(new Paragraph({
      alignment: AlignmentType.LEFT, keepNext: true,
      spacing: { after: 40, line: 312 },
      children: [new TextRun({ text: label, bold: true, size: 21, color: PAL.secondary, font: FONT_BODY })],
    }));
  }
  out.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { left: 360, right: 360 },
    spacing: { after: 160, line: 312 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 12, color: PAL.accent, space: 10 },
    },
    shading: { type: ShadingType.CLEAR, fill: "F2F7F5" },
    children: [new TextRun({ text, italics: true, size: 23, color: "1E3A45", font: FONT_BODY })],
  }));
  return out;
}
// Table builder — header row + data rows; widths in %, WPS-safe
function tbl(title, headers, rows, widths) {
  const out = [];
  if (title) {
    out.push(new Paragraph({
      keepNext: true, alignment: AlignmentType.LEFT,
      spacing: { before: 120, after: 80, line: 312 },
      children: [new TextRun({ text: title, bold: true, size: 21, color: PAL.secondary, font: FONT_BODY })],
    }));
  }
  const cellPara = (text, bold, color) => new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 0, line: 276 },
    children: [new TextRun({ text, bold: !!bold, size: 21, color: color || PAL.body, font: FONT_BODY })],
  });
  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: PAL.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: PAL.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: PAL.table.innerLine },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: PAL.table.innerLine },
    },
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: headers.map((t, i) => new TableCell({
          children: [cellPara(t, true, PAL.table.headerText)],
          shading: { type: ShadingType.CLEAR, fill: PAL.table.headerBg },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          width: { size: widths[i], type: WidthType.PERCENTAGE },
        })),
      }),
      ...rows.map((row, ri) => new TableRow({
        cantSplit: true,
        children: row.map((t, i) => new TableCell({
          children: [cellPara(t, false)],
          shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: PAL.table.surface } : undefined,
          margins: { top: 70, bottom: 70, left: 120, right: 120 },
          width: { size: widths[i], type: WidthType.PERCENTAGE },
        })),
      })),
    ],
  }));
  out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  return out;
}

module.exports = { PAL, FONT_BODY, FONT_HEAD, NB, noBorders, allNoBorders, buildCoverR1, h1, h2, h3, p, li, numItem, copyBlock, tbl };
