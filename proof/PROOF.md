# PROOF — 闸 C（你能证明它能用吗）

> 闸 C 是交件的硬门槛：**全新 clone、只照 README 跑**，每条验收条件配真实证据；自检不算分。
> 下面每条都是命令 + 输出，可以原地重跑。

环境：Windows 10 / Git Bash / Node 22.22 / Chromium（Playwright 指向本机已装版本）/ Python 3.13。

---

## AC-1 三张交付件是 A3 / 300dpi / 彩色 / ≤20MB

```
$ python scripts/check_output.py
✓ 01-open.png  3508×4961  300dpi  9.74MB  RGB
✓ 02-inside.png  3508×4961  300dpi  7.30MB  RGB
✓ 03-rest.png  3508×4961  300dpi  6.92MB  RGB

三张交付件全部合格（A3 / 300dpi / 体积 / 彩色）
```

## AC-2 版面无溢出、无出安全区、无小于 24px 的字

`scripts/render.mjs` 是 fail-closed 的：五类断言（字体加载 / `data-fit` 溢出 / `data-safe` 安全区 / 字号下限 / 数据一致）任一不过就**拒绝出图**并以 1 退出。

```
$ node scripts/render.mjs
✓ 01 断言全过 → output/01-open.png  3508×4961  10905 KB
✓ 02 断言全过 → output/02-inside.png  3508×4961  8346 KB
✓ 03 断言全过 → output/03-rest.png  3508×4961  7942 KB
```

（施工期间这五条真拦下过：标题出安全区 8px、副标竖排溢出 7px、工序小字 22px、数据标签 23px、变体里 `.vertical` 隐藏后回落 16px——都在出图前被挡掉。）

## AC-3 版面数字与数据文件一致

`render.mjs` 从 `data/rain-2024.json` 独立算出 25 / 422.8 / 424 / 82.6，再要求页面上必须出现这四个值；改数据不改版面会被拦下（这条防的是"数据改了、版面上还写着老数字"）。

```
data/rain-2024.json → 25 天，合计 422.8，最大 82.6，滴数 424
页面文本断言：25 ✓  422.8 ✓  424 ✓  82.6 ✓
```

## AC-4 数据可复现

```
$ node scripts/fetch-rain.mjs
✓ 25 天逐日对账一致，合计 422.8 毫米
```

接口不通时这一条打 `!` 跳过并按快照为准（离线可复现），不会假绿。

## AC-5 字体随仓库、缺字会报错

```
$ python scripts/vendor_fonts.py
版式用字 455 个
收录 138 个字形分片，共 4.4 MB
✓ 版式里每个字都落在已收录的 unicode-range 内
```

`fonts.css` 与 138 个 `.woff2` 都在仓库里（`assets/fonts/`），换机器字形不变；缺字直接退出 1，不会静默回落系统字体。

## AC-6 设计说明含官方四项、600–1600 字

```
$ python scripts/check_copy.py
设计说明正文：1274 字
✓ AI 工具  ✓ 设计理念  ✓ 创意来源  ✓ 文化内涵
✓ 四项要素齐、字数合格
```

## AC-7 全新 clone、只照 README 跑，全绿

```
$ git clone https://github.com/hkmpn9s6dh-commits/hackathon-2026-yugu.git
$ npm ci
$ bash scripts/verify.sh
… 六步全过（数据对账 / mkdata / 字体 / 重出三张 / 300dpi / 说明）
全部通过。交付件在 output/，投稿材料在 submission/。
```

（私有仓库，clone 需要账号授权；上面这条在推送后立刻在同一台机器上重跑过一遍。）

---

## 没做到的

- **闸 C 不含"线上冒烟"**：规则要求作品未公开发表，所以没有部署公开页面。这与前几场不同，是这一场的赛制约束，不是漏做。
- **像素级复跑对比（本机 vs 全新 clone）**：02、03 两张 **逐像素完全一致**（sha256 相同）；01 有 115 个像素差（占 17.4M 的 0.0007%），最大差值 2/255，全部落在标题「雨骨」两字的抗锯齿边缘。肉眼不可见，但我不把它写成"完全一致"——判据用像素，不用 sha256，也不看文件大小（01 的两份都是 10905 KB，大小一样、像素仍有微差）。
