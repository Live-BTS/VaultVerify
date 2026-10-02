import { PDFDocument } from "pdf-lib";
import { readFileSync } from "fs";
const bytes = readFileSync("/tmp/test-packet.pdf");
const pdf = await PDFDocument.load(bytes);
console.log("pages:", pdf.getPageCount());
console.log("title:", pdf.getTitle() ?? "(none)");
const p = pdf.getPage(0);
console.log("page size:", p.getWidth(), "x", p.getHeight());
console.log("VALID PDF");
