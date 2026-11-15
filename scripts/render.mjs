/**
 * 版式渲染 + 构建护栏（fail-closed：任一断言不过就不出图）
 *
 * 用法：node scripts/render.mjs [--only 01]
 * 产出：output/01-open.png 等，3508×4961（A3 300dpi）
 */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 3508, H = 4961, SAFE = 170;

const SHEETS = [
  { id: "01", file: "01-open.html", out: "01-open.png", shows: ["n", "total", "drops", "max"] },
  { id: "02", file: "02-inside.html", out: "02-inside.png", shows: ["n", "drops"] },
  { id: "03", file: "03-rest.html", out: "03-rest.png", shows: ["n", "total"] },
  { id: "A", file: "99-varA.html", out: "../proof/gate-d/varA.png", optional: true },
  { id: "B", file: "99-varB.html", out: "../proof/gate-d/varB.png", optional: true },
  { id: "C", file: "99-varC.html", out: "../proof/gate-d/varC.png", optional: true },
];

const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
let targets = only ? SHEETS.filter((s) => s.id === only || s.file.includes(only)) : SHEETS;
targets = targets.filter((s) => !s.optional || only || fs.existsSync(path.join(ROOT, "src", s.file)));

/** 本机的 chromium 是既有版本；直接指到已装的 chrome.exe，避免每次下载新浏览器 */
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
  if (!fs.existsSync(base)) return undefined;
  for (const dir of fs.readdirSync(base)) {
    if (!dir.startsWith("chromium-")) continue;
    for (const rel of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe"]) {
      const p = path.join(base, dir, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

const DAILY = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "rain-2024.json"), "utf8")).daily;
const STATS = {
  n: DAILY.length,
  total: Math.round(DAILY.reduce((a, d) => a + d.mm, 0) * 10) / 10,
  max: Math.max(...DAILY.map((d) => d.mm)),
  drops: DAILY.reduce((a, d) => a + Math.round(d.mm), 0),
};
const FMT = { n: String(STATS.n), total: STATS.total.toFixed(1), max: STATS.max.toFixed(1), drops: String(STATS.drops) };

const browser = await chromium.launch({ executablePath: findChrome() });
let failed = 0;

for (const sheet of targets) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  const url = pathToFileURL(path.join(ROOT, "src", sheet.file)).href;
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  const EXPECT = (sheet.shows || []).map((k) => FMT[k]).filter(Boolean);
  const EXPECT_DAYS = STATS.n;
  const report = await page.evaluate(
    ({ W, H, SAFE, EXPECT, EXPECT_DAYS }) => {
      const bad = [];

      // 护栏 1：字体真加载（否则静默回落系统字体，字形全变）
      for (const fam of ["Noto Serif SC", "Noto Sans SC"]) {
        if (!document.fonts.check(`300px "${fam}"`)) bad.push({ rule: "font", msg: `字体未加载：${fam}` });
      }

      // 护栏 2：文字不溢出容器
      for (const el of document.querySelectorAll("[data-fit]")) {
        const oy = el.scrollHeight - el.clientHeight;
        const ox = el.scrollWidth - el.clientWidth;
        if (oy > 1 || ox > 1) {
          bad.push({ rule: "overflow", msg: `溢出 ${ox}px×${oy}px：${el.textContent.trim().slice(0, 18)}` });
        }
      }

      // 护栏 3：安全区
      for (const el of document.querySelectorAll("[data-safe]")) {
        const r = el.getBoundingClientRect();
        if (
          r.width && (r.left < SAFE - 0.5 || r.top < SAFE - 0.5 || r.right > W - SAFE + 0.5 || r.bottom > H - SAFE + 0.5)
        ) {
          bad.push({
            rule: "safe-area",
            msg: `出安全区：${el.textContent.trim().slice(0, 16)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`,
          });
        }
      }

      // 护栏 4：字号下限（A3 300dpi 上 24px ≈ 2.0mm，再小印不清）
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest("svg defs") || ["SCRIPT", "STYLE", "NOSCRIPT", "TITLE", "DESC"].includes(el.tagName)) continue;
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length) ||
          (el.tagName === "text" && el.textContent.trim().length);
        if (!hasText) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 24) bad.push({ rule: "font-size", msg: `${fs}px 太小：${el.textContent.trim().slice(0, 18)}` });
      }

      // 护栏 5：数字必须与数据一致（防"改了数据忘了改版面"）
      const rep = window.__YUGU_REPORT__;
      if (!rep) bad.push({ rule: "data", msg: "页面没有吐 __YUGU_REPORT__" });
      else {
        const text = document.body.innerText.replace(/\s+/g, "");
        for (const w of EXPECT) {
          if (!text.includes(w)) bad.push({ rule: "data", msg: `版面上找不到数据值 ${w}` });
        }
        if (rep.rings && rep.rings !== EXPECT_DAYS) {
          bad.push({ rule: "data", msg: `圈数 ${rep.rings} ≠ 天数 ${EXPECT_DAYS}` });
        }
      }

      // 附：画布尺寸与图片解码
      if (document.documentElement.scrollWidth > W + 1) bad.push({ rule: "canvas", msg: "画布横向溢出" });
      if (document.documentElement.scrollHeight > H + 1) bad.push({ rule: "canvas", msg: "画布纵向溢出" });
      for (const img of document.images) {
        if (!img.complete || !img.naturalWidth) bad.push({ rule: "image", msg: `图片未加载：${img.getAttribute("src")}` });
      }

      return { bad };
    },
    { W, H, SAFE, EXPECT, EXPECT_DAYS }
  );

  if (errors.length) for (const e of errors) report.bad.push({ rule: "js", msg: e.slice(0, 120) });

  if (report.bad.length) {
    failed++;
    console.error(`\n✗ ${sheet.id} 断言失败 ${report.bad.length} 条`);
    for (const b of report.bad) console.error(`   [${b.rule}] ${b.msg}`);
    await page.close();
    continue;
  }

  const outPath = path.join(ROOT, "output", sheet.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: W, height: H } });
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`✓ ${sheet.id} 断言全过 → output/${path.basename(outPath)}  ${W}×${H}  ${kb} KB`);
  await page.close();
}

await browser.close();
if (failed) {
  console.error(`\n共 ${failed} 张未通过，已拒绝出图。`);
  process.exit(1);
}
