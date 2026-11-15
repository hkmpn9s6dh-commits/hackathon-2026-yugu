#!/usr/bin/env bash
# 一条命令复验全部：数据对得上、字收齐了、三张 A3 能重出、交付件合规、说明齐四项。
# 用法：bash scripts/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/6 依赖 =="
[ -d node_modules/playwright ] || { echo "缺依赖：先 npm ci"; exit 1; }
python -c "import PIL, fontTools" 2>/dev/null || { echo "缺 python 包：pip install pillow fonttools"; exit 1; }
echo ok

echo "== 2/6 气象数据逐日对账（接口不通则跳过，按快照为准）=="
node scripts/fetch-rain.mjs

echo "== 3/6 数据 → JS 快照 =="
node scripts/mkdata.mjs

echo "== 4/6 字体分片齐不齐（缺字会静默回落系统字体）=="
python scripts/vendor_fonts.py | tail -3

echo "== 5/6 重出三张（尺寸/安全区/溢出/字号/数据一致，任一不过就拒绝出图）=="
node scripts/render.mjs

echo "== 6/6 打 300dpi 并量交付件 + 说明四要素 =="
python scripts/set_dpi.py
python scripts/check_output.py
python scripts/check_copy.py

echo
echo "全部通过。交付件在 output/，投稿材料在 submission/。"
