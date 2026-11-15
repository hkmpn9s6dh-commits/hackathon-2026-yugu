"""把渲染出来的 PNG 打上 300dpi 标记（Playwright 默认 96dpi，A3 会变成巨幅）。
只改元数据与重编码，不改像素。用法：python scripts/set_dpi.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
FILES = ["01-open.png", "02-inside.png", "03-rest.png"]

for name in FILES:
    p = OUT / name
    if not p.exists():
        continue
    im = Image.open(p)
    im.load()
    im = im.convert("RGB")
    im.save(p, dpi=(300, 300), optimize=True)
    print(f"{name}: {im.size[0]}×{im.size[1]}  300dpi  {p.stat().st_size/1024/1024:.2f}MB")
