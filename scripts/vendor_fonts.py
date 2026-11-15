"""把 fontsource 里"这份版式真的用得上"的字形文件挑出来，随仓库带走。

为什么不用整套：Noto Serif/Sans SC 的 fontsource 包各 60–70 MB，仓库吃不消；
为什么必须挑"用得上"的：只要有一个字没进子集/没进这批文件，浏览器会静默回落到系统字体，
图照样出，字形全变——所以脚本最后要反过来核对一遍：每个用到的字，必须落在某个已收的 unicode-range 里。

用法：python scripts/vendor_fonts.py
产出：assets/fonts/*.woff2 与 assets/fonts/fonts.css（供 src/base.css 引用）
"""
import glob
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

# 这份版式用到的字重
FACES = [
    ("@fontsource/noto-serif-sc", "Noto Serif SC", ["300", "400", "600"]),
    ("@fontsource/noto-sans-sc", "Noto Sans SC", ["300", "400", "500"]),
]

# 1) 版式里出现的所有字符
chars = set()
for p in glob.glob(str(ROOT / "src" / "*.html")):
    txt = Path(p).read_text(encoding="utf-8")
    txt = re.sub(r"<style[\s\S]*?</style>", "", txt)
    txt = re.sub(r"<script[\s\S]*?</script>", "", txt)
    txt = re.sub(r"<[^>]+>", "", txt)
    chars |= {c for c in txt if not c.isspace()}
chars |= set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
             "·—–…“”‘’《》〈〉「」『』、，。；：？！（）%×/+-=.·#°′″℃")
codes = {ord(c) for c in chars}
print(f"版式用字 {len(chars)} 个")

RANGE_RE = re.compile(r"@font-face\s*\{([^}]*)\}", re.M)


def parse_ranges(css_text):
    out = []
    for block in RANGE_RE.findall(css_text):
        src = re.search(r"url\(([^)]+\.woff2)\)", block)
        rng = re.search(r"unicode-range:\s*([^;]+);", block)
        if not src or not rng:
            continue
        codes_in = set()
        for part in rng.group(1).split(","):
            part = part.strip().replace("U+", "")
            if "-" in part:
                a, b = part.split("-")
                codes_in.update(range(int(a, 16), int(b, 16) + 1))
            elif part:
                codes_in.add(int(part, 16))
        out.append((Path(src.group(1)).name, codes_in, rng.group(1).strip()))
    return out


rules, used_files, covered = [], [], set()
for pkg, family, weights in FACES:
    for w in weights:
        css_path = ROOT / "node_modules" / pkg / f"{w}.css"
        if not css_path.exists():
            print(f"✗ 缺 {css_path}（先 npm ci）")
            sys.exit(1)
        for name, codes_in, rng in parse_ranges(css_path.read_text(encoding="utf-8")):
            if not (codes & codes_in):
                continue
            src = ROOT / "node_modules" / pkg / "files" / name
            if not src.exists():
                print(f"✗ 缺字形文件 {src}")
                sys.exit(1)
            dst = OUT / name
            if not dst.exists() or dst.stat().st_size != src.stat().st_size:
                shutil.copyfile(src, dst)
            used_files.append(name)
            covered |= (codes & codes_in)
            rules.append(
                "@font-face{font-family:'%s';font-style:normal;font-display:block;font-weight:%s;"
                "src:url(./%s) format('woff2');unicode-range:%s;}" % (family, w, name, rng)
            )

missing = codes - covered
css_out = "\n".join(rules) + "\n"
(OUT / "fonts.css").write_text(
    "/* 由 scripts/vendor_fonts.py 生成：只收这份版式用得到的字形分片 */\n" + css_out,
    encoding="utf-8",
)
total = sum((OUT / n).stat().st_size for n in used_files) / 1024 / 1024
print(f"收录 {len(used_files)} 个字形分片，共 {total:.1f} MB")
if missing:
    print("✗ 有字没有被任何分片覆盖：" + "".join(sorted(chr(c) for c in missing)))
    sys.exit(1)
print("✓ 版式里每个字都落在已收录的 unicode-range 内")
