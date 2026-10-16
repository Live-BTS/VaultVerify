#!/usr/bin/env python3
"""Post-process footers per toc.md: explicit PAGE format switches (WPS compat)
+ strip empty <w:pgNumType/>. Mapping: first sectPr with footerReference = TOC
section (ROMAN), second = body (arabic)."""
import re, shutil, sys, zipfile, os

path = "/home/z/my-project/download/VaultVerify-Product-Content-Brief.docx"
tmp = path + ".tmp"

with zipfile.ZipFile(path, "r") as z:
    names = z.namelist()
    data = {n: z.read(n) for n in names}

doc = data["word/document.xml"].decode("utf-8")

# 1. Strip empty pgNumType (docx-js emits them; confuses WPS)
doc = doc.replace("<w:pgNumType/>", "")

# 2. Map footer rels in section order: find footerReference r:ids in document order
rels = data["word/_rels/document.xml.rels"].decode("utf-8")
rel_map = dict(re.findall(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="(footer\d+\.xml)"', rels))
# also handle attribute order variance
for m in re.finditer(r'<Relationship\b[^>]*>', rels):
    tag = m.group(0)
    rid = re.search(r'Id="([^"]+)"', tag)
    tgt = re.search(r'Target="(footer\d+\.xml)"', tag)
    if rid and tgt:
        rel_map[rid.group(1)] = tgt.group(1)

foot_refs = re.findall(r'<w:footerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"|<w:footerReference[^>]*r:id="([^"]+)"[^>]*w:type="default"', doc)
ordered = []
for a, b in foot_refs:
    rid = a or b
    tgt = rel_map.get(rid)
    if tgt and tgt not in ordered:
        ordered.append(tgt)
print("Footer files in section order:", ordered)

fmt_for = {}
if len(ordered) >= 1: fmt_for[ordered[0]] = "ROMAN"   # TOC section
if len(ordered) >= 2: fmt_for[ordered[1]] = "arabic"  # body section

for fname, fmt in fmt_for.items():
    key = "word/" + fname
    xml = data[key].decode("utf-8")
    xml2, n = re.subn(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        r"\1 PAGE \\* " + fmt + r" \\* MERGEFORMAT \2",
        xml,
    )
    print(f"{fname}: patched {n} PAGE field(s) -> \\* {fmt}")
    data[key] = xml2.encode("utf-8")

data["word/document.xml"] = doc.encode("utf-8")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
    for n in names:
        z.writestr(n, data[n])
shutil.move(tmp, path)
print("OK: post-processing complete")
