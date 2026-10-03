import { PDFDocument, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";

const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
const base = "/home/z/my-project/public/fonts";

for (const [name, file] of [
  ["Poppins-Medium", "Poppins-Medium.ttf"],
  ["Poppins-SemiBold", "Poppins-SemiBold.ttf"],
] as const) {
  const bytes = await readFile(`${base}/${file}`);
  for (const subset of [true, false]) {
    try {
      const f = await pdf.embedFont(bytes, { subset });
      console.log(
        `${name} subset=${subset}: "RN"@7.5pt=${f.widthOfTextAtSize("RN", 7.5).toFixed(2)}pt`,
        `"ICU / Critical Care"@7.5=${f.widthOfTextAtSize("ICU / Critical Care", 7.5).toFixed(2)}pt`,
        `"Within 3 months"@6.9=${f.widthOfTextAtSize("Within 3 months", 6.9).toFixed(2)}pt`,
      );
    } catch (e) {
      console.log(`${name} subset=${subset} FAILED:`, (e as Error).message);
    }
  }
}
const helv = await pdf.embedFont(StandardFonts.Helvetica);
console.log(`Helvetica: "RN"@7.5pt=${helv.widthOfTextAtSize("RN", 7.5).toFixed(2)}pt`);
