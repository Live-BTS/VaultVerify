#!/usr/bin/env python3
"""Process the uploaded VaultVerify logo into brand assets.

Outputs:
  - public/logo.png          : trimmed original-resolution transparent logo
  - src/app/icon.png         : 512x512 square favicon (content centered, 8% padding)
  - src/app/apple-icon.png   : 180x180 apple touch icon (same composition)
  - scripts/logo-preview-dark.png : QA composite on Midnight Steel bg
"""
from PIL import Image

SRC = "/home/z/my-project/upload/namelogo-removebg-preview.png"
OUT_LOGO = "/home/z/my-project/public/logo.png"
OUT_ICON = "/home/z/my-project/src/app/icon.png"
OUT_APPLE = "/home/z/my-project/src/app/apple-icon.png"
OUT_PREVIEW = "/home/z/my-project/scripts/logo-preview-dark.png"

img = Image.open(SRC).convert("RGBA")

# 1) Trim to alpha bounding box with a tiny margin
bbox = img.getchannel("A").getbbox()
print("alpha bbox:", bbox)
content = img.crop(bbox)
w, h = content.size
print("content size:", content.size)

# 2) Full logo asset (keep native res, capped at 800px wide)
if w > 800:
    ratio = 800 / w
    content = content.resize((800, round(h * ratio)), Image.LANCZOS)
content.save(OUT_LOGO, optimize=True)
print("saved", OUT_LOGO, content.size)

def square_composition(target: int, pad_ratio: float) -> Image.Image:
    """Center content on a transparent square canvas with padding."""
    cw, ch = content.size
    inner = int(target * (1 - pad_ratio))
    scale = min(inner / cw, inner / ch)
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
    resized = content.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((target - nw) // 2, (target - nh) // 2))
    return canvas

# 3) Favicon + apple icon
square_composition(512, 0.08).save(OUT_ICON, optimize=True)
square_composition(180, 0.06).save(OUT_APPLE, optimize=True)
print("saved", OUT_ICON, "and", OUT_APPLE)

# 4) QA preview on dark bg (navbar context) + light bg
prev = Image.new("RGBA", (1000, 340), (8, 18, 21, 255))  # Midnight Steel
light = Image.new("RGBA", (340, 340), (244, 249, 245, 255))  # Crisp Mint White
logo_big = content.resize((int(300 * content.size[0] / content.size[1]), 300), Image.LANCZOS)
icon_sq = square_composition(300, 0.08)
prev.alpha_composite(logo_big, (40, 20))
prev.alpha_composite(icon_sq, (430, 20))
prev.alpha_composite(light, (760, 20))
prev.alpha_composite(logo_big.resize((210, int(210 * logo_big.size[1] / logo_big.size[0])), Image.LANCZOS), (775, 85))
prev.convert("RGB").save(OUT_PREVIEW)
print("saved", OUT_PREVIEW)

# 5) Rounded light tile (for teal #03363d banners: PDF header, reference flow)
tile = 512
radius = 104
tile_img = Image.new("RGBA", (tile, tile), (0, 0, 0, 0))
mask = Image.new("L", (tile, tile), 0)
from PIL import ImageDraw
ImageDraw.Draw(mask).rounded_rectangle([0, 0, tile - 1, tile - 1], radius=radius, fill=255)
white = Image.new("RGBA", (tile, tile), (244, 249, 245, 255))
tile_img.paste(white, (0, 0), mask)
inner = square_composition(tile, 0.14)
tile_img.alpha_composite(inner)
tile_img.save("/home/z/my-project/public/logo-tile.png", optimize=True)
print("saved /home/z/my-project/public/logo-tile.png")

# 6) Contrast sample: darkest opaque pixels vs Midnight Steel
import collections
dark_samples = []
px = content.load()
for yy in range(0, content.size[1], 4):
    for xx in range(0, content.size[0], 4):
        r, g, b, a = px[xx, yy]
        if a > 200:
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            dark_samples.append((lum, (r, g, b)))
dark_samples.sort(key=lambda t: t[0])
print("darkest 5 opaque colors:", [c for _, c in dark_samples[:5]])
print("median opaque luminance:", dark_samples[len(dark_samples)//2][0])
