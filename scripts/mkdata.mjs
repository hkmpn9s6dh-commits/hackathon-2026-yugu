/** data/rain-2024.json → data/rain-2024.js
 *
 * 为什么多这一步：版式用 file:// 直接打开，fetch() 会被 CORS 拦；
 * 所以把同一份数据同时留一份 JS 快照。JSON 是唯一真相，JS 由它生成。
 * 用法：node scripts/mkdata.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(ROOT, "data", "rain-2024.json");
const out = path.join(ROOT, "data", "rain-2024.js");

const data = JSON.parse(fs.readFileSync(src, "utf8"));
const total = data.daily.reduce((a, d) => a + d.mm, 0);
const expectDays = 25;

if (data.daily.length !== expectDays) {
  console.error(`✗ 天数 ${data.daily.length} ≠ ${expectDays}`);
  process.exit(1);
}
if (Math.abs(total - 422.8) > 0.05) {
  console.error(`✗ 合计 ${total.toFixed(1)} 与版面上写的 422.8 不符`);
  process.exit(1);
}

fs.writeFileSync(
  out,
  "/* 由 scripts/mkdata.mjs 从 rain-2024.json 生成，不要手改 */\n" +
    "window.RAIN = " +
    JSON.stringify(data, null, 2) +
    ";\n",
  "utf8"
);
console.log(`✓ data/rain-2024.js  ${data.daily.length} 天，合计 ${total.toFixed(1)} 毫米`);
