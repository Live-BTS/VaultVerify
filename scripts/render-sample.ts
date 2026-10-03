// Golden-test helper:  bun scripts/render-sample.ts reference/sample-data.json out.pdf
import fs from "node:fs";
import path from "node:path";
import { renderSkillsChecklistPdf } from "../src/lib/pdf/skills-checklist-pdf";

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) throw new Error("usage: bun scripts/render-sample.ts data.json out.pdf");
const data = JSON.parse(fs.readFileSync(inFile, "utf8"));
renderSkillsChecklistPdf(data, { assetsDir: path.join(process.cwd(), "assets", "skills-checklist") }).then((buf) => {
  fs.writeFileSync(outFile, buf);
  console.log(`wrote ${outFile} (${buf.length} bytes)`);
});
