import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Isolate: does drawSvgPath with borderDashArray render at a different position than filled?
const pdf = await PDFDocument.create();
const page = pdf.addPage([300, 200]);
const font = await pdf.embedFont(StandardFonts.HelveticaBold);

const rrect = (w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h / 2);
  const f = (n: number) => n.toFixed(2);
  return `M ${f(rr)} 0 H ${f(w - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(w - rr)} ${f(rr)} V ${f(h - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(w - rr)} ${f(h)} H ${f(rr)} A ${f(rr)} ${f(rr)} 0 0 1 0 ${f(h - rr)} V ${f(rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} 0 Z`;
};

const mid = 100;
const pY = mid - 7.5;

// filled pill anchored at (40, pY)
page.drawSvgPath(rrect(60, 15, 7.5), { x: 40, y: pY, color: rgb(0.07, 0.24, 0.33) });
page.drawText("filled", { x: 40, y: pY - 10, size: 6, font, color: rgb(0, 0, 0) });

// dashed pill anchored at (150, pY)
page.drawSvgPath(rrect(60, 15, 7.5), { x: 150, y: pY, borderColor: rgb(0.7, 0.78, 0.76), borderWidth: 0.8, borderDashArray: [2.5, 2] });
page.drawText("dashed", { x: 150, y: pY - 10, size: 6, font, color: rgb(0, 0, 0) });

// baseline marker line at mid
page.drawLine({ start: { x: 20, y: mid }, end: { x: 280, y: mid }, thickness: 0.3, color: rgb(1, 0, 0) });

import { writeFile } from "node:fs/promises";
await writeFile("/home/z/my-project/scripts/pilltest.pdf", await pdf.save());
console.log("written");
