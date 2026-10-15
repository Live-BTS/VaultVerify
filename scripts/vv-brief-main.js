// VaultVerify Product & Content Brief — main assembly
// 3-section architecture: Cover (no page#) → TOC (Roman) → Body (Arabic, start 1)
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, HeadingLevel, SectionType, TableOfContents, LevelFormat,
} = require("docx");
const fs = require("fs");
const { PAL, FONT_BODY, FONT_HEAD, buildCoverR1 } = require("./vv-brief-lib");
const { part1 } = require("./vv-brief-content1");
const { part2 } = require("./vv-brief-content2");
const { part3 } = require("./vv-brief-content3");

const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

function pageNumFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808890", font: FONT_BODY })],
    })],
  });
}
function docHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: "single", size: 2, color: PAL.table.innerLine, space: 4 } },
      children: [new TextRun({ text: "VaultVerify · Product & Content Brief", size: 16, color: "98A2A8", font: FONT_BODY })],
    })],
  });
}

const coverConfig = {
  title: "VaultVerify Product & Content Brief",
  subtitle: "Complete functionality description and writing brief for producing Terms of Use, Privacy Policy, and all public site content",
  englishLabel: "FUNCTIONALITY SPECIFICATION",
  metaLines: [
    "Prepared for: content production (ChatGPT / copywriter)",
    "Scope: product functionality · legal pages · landing copy · FAQ · micro-copy",
    "Version 1.0 · 16 October 2026",
    "Contains confidential positioning notes — share with the writer only",
  ],
  footerLeft: "VaultVerify",
  footerRight: "Working brief · October 2026",
  palette: PAL,
};

// TOC section children — TOC title (no HeadingLevel), TableOfContents, refresh hint
const tocChildren = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 360 },
    children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: FONT_HEAD, color: PAL.primary })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"",
      italics: true, size: 18, color: "888888", font: FONT_BODY,
    })],
  }),
];

const bodyChildren = [...part1(), ...part2(), ...part3()];

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT_BODY, size: 23, color: "000000" },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: FONT_HEAD, size: 32, bold: true, color: PAL.primary },
        paragraph: { spacing: { before: 360, after: 160, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: FONT_HEAD, size: 27, bold: true, color: PAL.primary },
        paragraph: { spacing: { before: 260, after: 120, line: 312 }, outlineLevel: 1 },
      },
      heading3: {
        run: { font: FONT_HEAD, size: 24, bold: true, color: "1E3A45" },
        paragraph: { spacing: { before: 200, after: 100, line: 312 }, outlineLevel: 2 },
      },
    },
  },
  numbering: {
    config: [
      {
        reference: "toc-list",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 640, hanging: 360 } } },
        }],
      },
      {
        reference: "pp-list",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 640, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [
    { // Section 1: Cover — margin 0, no footer, no pageNumbers
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1(coverConfig),
    },
    { // Section 2: TOC — Roman numerals
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageNumFooter() },
      children: tocChildren,
    },
    { // Section 3: Body — Arabic, restart at 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: docHeader() },
      footers: { default: pageNumFooter() },
      children: bodyChildren,
    },
  ],
});

const OUT = "/home/z/my-project/download/VaultVerify-Product-Content-Brief.docx";
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("WROTE", OUT, buf.length, "bytes");
});
