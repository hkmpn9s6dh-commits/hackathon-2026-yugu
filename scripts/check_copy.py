"""设计说明闸：官方要求"设计说明应阐述使用的 AI 工具、设计理念、创意来源、文化内涵"。

四条缺一条就退——这四样是评委照着找的东西，不是文采问题。
另量字数：官方没给上限，定 600–1600 字（一页 A4 上下），超出就是要写论文而不是投稿。
用法：python scripts/check_copy.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / "submission" / "设计说明.md"
if not p.exists():
    print(f"✗ 缺 {p}")
    sys.exit(1)

text = p.read_text(encoding="utf-8")
body = "\n".join(l for l in text.splitlines() if l.strip() and not l.startswith("#") and not l.startswith(">"))
n = len(re.sub(r"\s+", "", body))
print(f"设计说明正文：{n} 字")

need = {
    "AI 工具": ["AI 用在哪", "大模型", "Open-Meteo"],
    "设计理念": ["怎么读它", "一天一圈", "一滴墨"],
    "创意来源": ["为什么是绸伞", "西湖绸伞"],
    "文化内涵": ["暴力梅", "梅雨", "非遗"],
}
fail = 0
for k, keys in need.items():
    if not any(x in text for x in keys):
        print(f"✗ 少了「{k}」这一项（找不到 {keys} 中任何一个）")
        fail += 1
    else:
        print(f"✓ {k}")

lo, hi = 600, 1600
if not (lo <= n <= hi):
    print(f"✗ 字数 {n} 不在 {lo}–{hi}")
    fail += 1
if fail:
    sys.exit(1)
print("✓ 四项要素齐、字数合格")
