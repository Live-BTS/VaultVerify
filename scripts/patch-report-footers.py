#!/usr/bin/env python3
"""Post-process VaultVerify_Delivery_Report.docx footers per docx skill toc.md:
- map each section's footerReference to its footer part via rels
- section fmt=upperRoman -> PAGE \\* ROMAN \\* MERGEFORMAT
- section fmt=decimal (or numeric start) -> PAGE \\* arabic \\* MERGEFORMAT
- strip empty <w:pgNumType/> elements (WPS confusion)
"""
import re, shutil, sys, zipfile, os

SRC = "/home/z/my-project/download/VaultVerify_Delivery_Report.docx"
TMP = SRC + ".tmp"

with zipfile.ZipFile(SRC) as z:
    names = z.namelist()
    data = {n: z.read(n) for n in names}

doc = data["word/document.xml"].decode("utf-8")
rels = data["word/_rels/document.xml.rels"].decode("utf-8")

# rId -> footer target
rid_target = dict(re.findall(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels))

# find each sectPr and its footerReference + pgNumType fmt
patch_plan = {}  # footer file -> fmt
for sect in re.findall(r"<w:sectPr[^>]*>.*?</w:sectPr>", doc, flags=re.S):
    m_ref = re.search(r'<w:footerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"', sect) or \
            re.search(r'<w:footerReference[^>]*r:id="([^"]+)"[^>]*w:type="default"', sect)
    if not m_ref:
        continue
    target = rid_target.get(m_ref.group(1), "")
    fname = "word/" + target.lstrip("/")
    m_fmt = re.search(r'<w:pgNumType[^>]*w:fmt="([^"]+)"', sect)
    fmt = m_fmt.group(1) if m_fmt else "decimal"
    if fmt in ("upperRoman", "lowerRoman"):
        patch_plan[fname] = "ROMAN"
    else:
        patch_plan[fname] = "arabic"

for fname, switch in patch_plan.items():
    if fname not in data:
        continue
    xml = data[fname].decode("utf-8")
    xml, n = re.subn(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        rf"\1 PAGE \\* {switch} \\* MERGEFORMAT \2",
        xml,
    )
    data[fname] = xml.encode("utf-8")
    print(f"patched {fname}: {n} PAGE field(s) -> \\* {switch}")

# strip empty pgNumType (cover section emits it)
doc2, n_strip = re.subn(r"<w:pgNumType/>", "", doc)
data["word/document.xml"] = doc2.encode("utf-8")
print(f"stripped {n_strip} empty <w:pgNumType/>")

with zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as z:
    for n in names:
        z.writestr(n, data[n])
shutil.move(TMP, SRC)
print("footer post-processing complete")
