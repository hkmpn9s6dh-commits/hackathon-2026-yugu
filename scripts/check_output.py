"""交付件量测：尺寸、DPI、体积、色彩模式。

赛事原文：彩色图片，JPG/PNG，300dpi，单幅 A3（297×420 毫米 → 3508×4961 像素）。
用法：python scripts/check_output.py
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
W_EXPECT, H_EXPECT, MAX_MB = 3508, 4961, 20
FILES = ["01-open.png", "02-inside.png", "03-rest.png"]

fail = 0
for name in FILES:
    p = OUT / name
    if not p.exists():
        print(f"✗ 缺文件 {name}")
        fail += 1
        continue
    im = Image.open(p)
    w, h = im.size
    mb = p.stat().st_size / 1024 / 1024
    dpi = im.info.get("dpi", (0, 0))[0]
    bad = []
    if (w, h) != (W_EXPECT, H_EXPECT):
        bad.append(f"尺寸 {w}×{h} ≠ A3 300dpi 的 {W_EXPECT}×{H_EXPECT}")
    if mb > MAX_MB:
        bad.append(f"体积 {mb:.2f}MB 超过 {MAX_MB}MB")
    if im.mode != "RGB":
        bad.append(f"色彩模式 {im.mode}（应为 RGB，彩色图）")
    if round(dpi) != 300:
        bad.append(f"DPI {dpi:.0f} ≠ 300")
    if bad:
        fail += 1
        print(f"✗ {name}: " + "；".join(bad))
    else:
        print(f"✓ {name}  {w}×{h}  {dpi:.0f}dpi  {mb:.2f}MB  {im.mode}")

if fail:
    print(f"\n{fail} 个文件不合格")
    sys.exit(1)
print("\n三张交付件全部合格（A3 / 300dpi / 体积 / 彩色）")
